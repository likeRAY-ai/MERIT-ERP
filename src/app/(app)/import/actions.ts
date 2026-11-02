"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requireActionUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { importCustomers, parseLegacyCustomers } from "@/lib/services/importCustomers";

export type ImportState =
  | {
      error?: string;
      preview?: {
        total: number;
        newCount: number;
        updateCount: number;
        companies: number;
        excluded: number;
        skipped: { row: number; reason: string }[];
        sample: { code: string; name: string; type: string; phone: string | null; taxId: string | null }[];
      };
      done?: { inserted: number; updated: number };
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

export async function runImport(_: ImportState, fd: FormData): Promise<ImportState> {
  try {
    await requireActionUser(["OWNER"]);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("請選擇檔案");
    const kind = String(fd.get("kind"));
    if (kind !== "customers") throw new AppError("目前只支援客戶資料");

    let parsed;
    try {
      parsed = parseLegacyCustomers(await readRows(file));
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(e instanceof Error ? e.message : "檔案格式不符");
    }
    const { records, skipped } = parsed;
    if (!records.length) throw new AppError("檔案中沒有可匯入的客戶");

    if (fd.get("mode") === "import") {
      const done = await importCustomers(db, records);
      revalidatePath("/customers");
      return { done };
    }

    const codes = records.map((r) => r.code);
    const existing = new Set<string>();
    for (let i = 0; i < codes.length; i += 1000) {
      const rows = await db
        .select({ code: customers.code })
        .from(customers)
        .where(inArray(customers.code, codes.slice(i, i + 1000)));
      rows.forEach((r) => r.code && existing.add(r.code));
    }
    return {
      preview: {
        total: records.length,
        newCount: records.length - existing.size,
        updateCount: existing.size,
        companies: records.filter((r) => r.type === "COMPANY").length,
        excluded: records.filter((r) => r.taxType === "EXCLUDED").length,
        skipped,
        sample: records.slice(0, 8).map((r) => ({
          code: r.code,
          name: r.name,
          type: r.type,
          phone: r.phone ?? r.mobile,
          taxId: r.taxId,
        })),
      },
    };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    console.error(e);
    return { error: "匯入時發生錯誤，請稍後再試" };
  }
}
