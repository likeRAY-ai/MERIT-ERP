"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { customers, products, suppliers } from "@/db/schema";
import { requireActionUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { money } from "@/lib/format";
import { importCustomers, parseLegacyCustomers } from "@/lib/services/importCustomers";
import { importProducts, parseLegacyProducts } from "@/lib/services/importProducts";
import { importSuppliers, parseLegacySuppliers } from "@/lib/services/importSuppliers";

export type ImportState =
  | {
      error?: string;
      preview?: {
        total: number;
        newCount: number;
        updateCount: number;
        facts: string[];
        skipped: { row: number; reason: string }[];
        columns: string[];
        sample: string[][];
      };
      done?: { inserted: number; updated: number; link: string; label: string };
    }
  | undefined;

async function readRows(file: File) {
  if (file.size > 4 * 1024 * 1024) throw new AppError("檔案超過 4MB，請分批匯出");
  const buf = Buffer.from(await file.arrayBuffer());
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    throw new AppError("無法讀取檔案，請上傳 Excel（.xls / .xlsx）或 CSV");
  }
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
}

function parse<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : "檔案格式不符");
  }
}

async function existingKeys(keys: string[], kind: "customers" | "products" | "suppliers") {
  const found = new Set<string>();
  for (let i = 0; i < keys.length; i += 1000) {
    const part = keys.slice(i, i + 1000);
    const rows =
      kind === "customers"
        ? await db.select({ k: customers.code }).from(customers).where(inArray(customers.code, part))
        : kind === "suppliers"
          ? await db.select({ k: suppliers.code }).from(suppliers).where(inArray(suppliers.code, part))
          : await db.select({ k: products.sku }).from(products).where(inArray(products.sku, part));
    rows.forEach((r) => r.k && found.add(r.k));
  }
  return found;
}

export async function runImport(_: ImportState, fd: FormData): Promise<ImportState> {
  try {
    const s = await requireActionUser(["OWNER"]);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("請選擇檔案");
    const kind = String(fd.get("kind"));
    const doImport = fd.get("mode") === "import";
    const rows = await readRows(file);

    if (kind === "customers") {
      const { records, skipped } = parse(() => parseLegacyCustomers(rows));
      if (!records.length) throw new AppError("檔案中沒有可匯入的客戶");
      if (doImport) {
        const r = await importCustomers(db, records);
        revalidatePath("/customers");
        return { done: { ...r, link: "/customers", label: "查看客戶" } };
      }
      const ex = await existingKeys(records.map((r) => r.code), "customers");
      return {
        preview: {
          total: records.length,
          newCount: records.length - ex.size,
          updateCount: ex.size,
          facts: [
            `公司行號 ${records.filter((r) => r.type === "COMPANY").length} 位`,
            `預設外加稅 ${records.filter((r) => r.taxType === "EXCLUDED").length} 位（開單時自動帶入）`,
          ],
          skipped,
          columns: ["編號", "名稱", "類型", "電話", "統編"],
          sample: records.slice(0, 8).map((r) => [
            r.code,
            r.name,
            r.type === "COMPANY" ? "公司" : "個人",
            r.phone ?? r.mobile ?? "—",
            r.taxId ?? "—",
          ]),
        },
      };
    }

    if (kind === "suppliers") {
      const { records, skipped } = parse(() => parseLegacySuppliers(rows));
      if (!records.length) throw new AppError("檔案中沒有可匯入的廠商");
      if (doImport) {
        const r = await importSuppliers(db, records);
        revalidatePath("/suppliers");
        return { done: { ...r, link: "/suppliers", label: "查看廠商" } };
      }
      const ex = await existingKeys(records.map((r) => r.code), "suppliers");
      return {
        preview: {
          total: records.length,
          newCount: records.length - ex.size,
          updateCount: ex.size,
          facts: ["負責人、工廠地址、營業項目、結帳方式等會放在備註"],
          skipped,
          columns: ["編號", "名稱", "電話", "統編"],
          sample: records.slice(0, 8).map((r) => [r.code, r.name, r.phone ?? r.mobile ?? "—", r.taxId ?? "—"]),
        },
      };
    }

    if (kind === "products") {
      const { records, skipped, merged } = parse(() => parseLegacyProducts(rows));
      if (!records.length) throw new AppError("檔案中沒有可匯入的商品");
      if (doImport) {
        const r = await importProducts(db, records, s.uid);
        revalidatePath("/products");
        revalidatePath("/inventory");
        return { done: { ...r, link: "/products", label: "查看商品" } };
      }
      const ex = await existingKeys(records.map((r) => r.sku), "products");
      const fresh = records.filter((r) => !ex.has(r.sku));
      const pos = fresh.filter((r) => r.stockQty > 0);
      return {
        preview: {
          total: records.length,
          newCount: fresh.length,
          updateCount: ex.size,
          facts: [
            `有庫存 ${pos.length} 項，庫存成本約 ${money(pos.reduce((a, r) => a + r.stockQty * r.avgCost, 0))}`,
            `負庫存 ${fresh.filter((r) => r.stockQty < 0).length} 項（舊系統先賣後補進貨的商品，照原數字匯入）`,
            `有售價 ${records.filter((r) => r.retailPrice > 0).length} 項、有成本 ${records.filter((r) => r.avgCost > 0).length} 項`,
            ...(merged ? [`有 ${merged} 項在 Excel 中被折成兩列，已自動合併`] : []),
            "已存在的商品只更新名稱、分類、售價等基本資料，不會改動庫存與成本",
            "匯入後序號管理預設關閉，需要的商品請到商品頁開啟",
          ],
          skipped,
          columns: ["編號", "品名", "分類", "庫存", "成本", "售價"],
          sample: records.slice(0, 10).map((r) => [
            r.sku,
            r.name,
            r.category ?? "—",
            String(r.stockQty),
            money(r.avgCost),
            r.retailPrice ? money(r.retailPrice) : "—",
          ]),
        },
      };
    }
    throw new AppError("請選擇資料種類");
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    console.error(e);
    return { error: "匯入時發生錯誤，請稍後再試" };
  }
}
