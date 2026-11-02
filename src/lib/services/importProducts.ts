// 匯入舊系統「產品基本資料」Excel（ITEMEX 格式）
// 以「產品編號」對應：新商品建立並帶入目前庫存與成本；已存在的商品只更新基本資料，不動庫存與成本
import { eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { categories, products, stockMovements } from "@/db/schema";
import { rocDate } from "./importCustomers";

export type ProductRecord = {
  sku: string;
  altCode: string | null;
  name: string;
  category: string | null;
  unit: string;
  retailPrice: number;
  avgCost: number;
  stockQty: number;
  safetyStock: number;
  isService: boolean; // 維修科目或租賃類：不計庫存
  note: string | null;
  createdAt: Date | null;
};

export type ProductParseResult = {
  records: ProductRecord[];
  skipped: { row: number; reason: string }[];
  merged: number; // 被折成兩列、已合併的商品數
};

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, "");
const val = (s: unknown) => {
  const v = String(s ?? "").trim();
  return v && v !== "0.00" ? v : null;
};
const num = (s: unknown) => {
  const n = Number(String(s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const ROC = /^\d{2,3}\/\d{1,2}\/\d{1,2}$/;
const TYPES = ["單一商品", "組合品", "組裝品"];

// 舊系統類別代碼 → 系統預設分類（沒列到的保留原代碼）
const CATEGORY_MAP: Record<string, string> = {
  SSD: "硬碟/SSD",
  HDD: "硬碟/SSD",
  RAM: "記憶體",
  VGA: "顯示卡",
  LCD: "螢幕",
  CPU: "CPU",
  NET: "網通",
  POW: "電源供應器",
  CR: "機殼",
  NB: "筆記型電腦",
  PC: "整機",
  PCJ: "整機",
  COOL: "散熱",
  FANCPU: "散熱",
  FANCR: "散熱",
  Hydro: "散熱",
  SOFT: "軟體",
  SOFV: "軟體",
  KBS: "鍵盤滑鼠",
};

export function parseLegacyProducts(rows: unknown[][]): ProductParseResult {
  const h = rows.findIndex((r) => r.some((c) => norm(c) === "產品編號") && r.some((c) => norm(c) === "品名規格"));
  if (h < 0) throw new Error("找不到「產品編號」「品名規格」欄位，請確認是舊系統匯出的產品基本資料");
  const header = rows[h].map(norm);
  const col = (name: string) => header.indexOf(name);
  const C = {
    cat: col("產品類別"),
    catName: col("類別名稱"),
    sku: col("產品編號"),
    alt: col("輔助編號"),
    name: col("品名規格"),
    kind: col("產品分類"),
    safety: col("安全存量"),
    unit: col("單位"),
    cost: col("進價"),
    price: col("售價"),
    stdCost: col("標準成本"),
    unitCost: col("期初單位成本"),
    service: col("維修科目"),
    custom1: col("自定一"),
    note: col("備註"),
    created: col("建檔日期"),
    stock: col("總庫存量"),
  };
  if (C.created < 0 || C.stock < 0) throw new Error("找不到「建檔日期」「總庫存量」欄位");

  // 部分商品被折成兩列：第二列從「建檔日期」開始，往左移到第 2 欄
  const shift = C.created - 1;
  const merged: unknown[][] = [];
  let mergedCount = 0;
  for (let i = h + 1; i < rows.length; i++) {
    const r = [...rows[i]];
    const prev = merged[merged.length - 1];
    if (prev && ROC.test(String(r[1] ?? "").trim()) && !TYPES.includes(norm(r[C.kind]))) {
      for (let j = 1; j + shift < header.length && j <= C.stock - shift; j++) {
        if (String(prev[j + shift] ?? "").trim() === "") prev[j + shift] = r[j];
      }
      mergedCount++;
      continue;
    }
    merged.push(r);
  }

  // 類別代碼對應的名稱（有些列有填「類別名稱」）
  const catNames = new Map<string, string>();
  for (const r of merged) {
    const code = val(r[C.cat]);
    const name = val(r[C.catName]);
    if (code && name && !catNames.has(code)) catNames.set(code, name);
  }

  const records: ProductRecord[] = [];
  const skipped: ProductParseResult["skipped"] = [];
  const seen = new Set<string>();
  merged.forEach((r, idx) => {
    const sku = val(r[C.sku]);
    const name = val(r[C.name]);
    if (!sku && !name) return;
    if (!sku) {
      if (!/主管|製表/.test(String(r[0]))) skipped.push({ row: idx + h + 2, reason: `「${name}」沒有產品編號` });
      return;
    }
    if (seen.has(sku)) {
      skipped.push({ row: idx + h + 2, reason: `產品編號 ${sku} 重複` });
      return;
    }
    seen.add(sku);

    const alt = val(r[C.alt]);
    const code = val(r[C.cat]);
    const category = code ? (CATEGORY_MAP[code] ?? catNames.get(code) ?? code) : null;
    const kind = norm(r[C.kind]);
    const unitCost = num(r[C.unitCost]) || num(r[C.cost]) || num(r[C.stdCost]);
    const extra = [
      val(r[C.note]),
      val(r[C.custom1]) && `自定：${val(r[C.custom1])}`,
      kind === "組合品" || kind === "組裝品" ? `舊系統分類：${kind}` : null,
      norm(r[C.service]) === "Y" ? "維修／服務項目" : null,
    ].filter(Boolean);

    const isService = norm(r[C.service]) === "Y" || code === "Lease";
    records.push({
      sku,
      isService,
      altCode: alt,
      name: name ?? alt ?? `舊系統商品 ${sku}`,
      category,
      unit: String(r[C.unit] ?? "").trim() || "個",
      retailPrice: Math.round(num(r[C.price])),
      avgCost: Math.round(unitCost),
      stockQty: isService ? 0 : Math.round(num(r[C.stock])),
      safetyStock: Math.max(0, Math.round(num(r[C.safety]))),
      note: extra.join("\n") || null,
      createdAt: rocDate(val(r[C.created])),
    });
  });
  return { records, skipped, merged: mergedCount };
}

// 寫入資料庫
export async function importProducts(db: DB, records: ProductRecord[], userId: number) {
  let inserted = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    // 分類
    const names = [...new Set(records.map((r) => r.category).filter((x): x is string => !!x))];
    if (names.length) {
      const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${categories.sort}),0)::int` }).from(categories);
      await tx
        .insert(categories)
        .values(names.map((name, i) => ({ name, sort: max + 1 + i })))
        .onConflictDoNothing();
    }
    const catRows = names.length ? await tx.select().from(categories).where(inArray(categories.name, names)) : [];
    const catId = new Map(catRows.map((c) => [c.name, c.id]));

    const existing = new Map<string, number>();
    for (let i = 0; i < records.length; i += 1000) {
      const rows = await tx
        .select({ id: products.id, sku: products.sku })
        .from(products)
        .where(inArray(products.sku, records.slice(i, i + 1000).map((r) => r.sku)));
      rows.forEach((r) => existing.set(r.sku, r.id));
    }

    const fresh = records.filter((r) => !existing.has(r.sku));
    for (let i = 0; i < fresh.length; i += 200) {
      const chunk = fresh.slice(i, i + 200);
      const ins = await tx
        .insert(products)
        .values(
          chunk.map((r) => ({
            sku: r.sku,
            altCode: r.altCode,
            name: r.name,
            categoryId: r.category ? (catId.get(r.category) ?? null) : null,
            unit: r.unit,
            retailPrice: r.retailPrice,
            avgCost: r.avgCost,
            stockQty: r.stockQty,
            safetyStock: r.safetyStock,
            isService: r.isService,
            note: r.note,
            createdAt: r.createdAt ?? new Date(),
          })),
        )
        .returning({ id: products.id, sku: products.sku, stockQty: products.stockQty, avgCost: products.avgCost });
      inserted += ins.length;
      // 期初庫存留下異動紀錄
      const moves = ins
        .filter((p) => p.stockQty !== 0)
        .map((p) => ({
          productId: p.id,
          type: "ADJUST" as const,
          qty: p.stockQty,
          balanceAfter: p.stockQty,
          unitCost: p.avgCost,
          note: "舊系統匯入期初庫存",
          createdById: userId,
        }));
      if (moves.length) await tx.insert(stockMovements).values(moves);
    }

    // 已存在：只更新基本資料
    for (const r of records) {
      const id = existing.get(r.sku);
      if (!id) continue;
      await tx
        .update(products)
        .set({
          altCode: r.altCode,
          name: r.name,
          categoryId: r.category ? (catId.get(r.category) ?? null) : null,
          unit: r.unit,
          retailPrice: r.retailPrice,
          safetyStock: r.safetyStock,
          isService: r.isService,
          note: r.note,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id));
      updated++;
    }
  });
  return { inserted, updated };
}
