// 匯入舊系統「客戶基本資料」Excel（CUSTOMEREX 格式）
// 以「客戶編號」對應：已存在的更新、沒有的新增，可重複匯入
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { customers } from "@/db/schema";
import { isValidTaxId } from "@/lib/format";

export type CustomerRecord = {
  code: string;
  name: string;
  type: "PERSONAL" | "COMPANY";
  taxId: string | null;
  contact: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  taxType: "INCLUDED" | "EXCLUDED" | null;
  note: string | null;
  createdAt: Date | null;
};

export type ParseResult = {
  records: CustomerRecord[];
  skipped: { row: number; reason: string }[];
};

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, "");
const val = (s: unknown) => String(s ?? "").trim() || null;

// 民國日期 111/11/08 → Date（台灣時間）
export function rocDate(s: string | null): Date | null {
  const m = s?.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]) + 1911;
  return new Date(`${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T00:00:00+08:00`);
}

const SELF_PICKUP = /^(買家)?自取$/;

export function parseLegacyCustomers(rows: unknown[][]): ParseResult {
  const h = rows.findIndex((r) => r.some((c) => norm(c) === "客戶編號") && r.some((c) => norm(c) === "客戶名稱"));
  if (h < 0) throw new Error("找不到「客戶編號」「客戶名稱」欄位，請確認是舊系統匯出的客戶基本資料");
  const header = rows[h].map(norm);
  // 同名欄位（例如兩個「業務人員」）取第 n 個
  const col = (name: string, nth = 0) => {
    let seen = -1;
    return header.findIndex((x) => x === name && ++seen === nth);
  };
  const C = {
    code: col("客戶編號"),
    name: col("客戶名稱"),
    short: col("客戶簡稱"),
    owner: col("負責人"),
    contact1: col("聯絡人１"),
    contact2: col("聯絡人２"),
    taxId: col("統一編號"),
    tel1: col("電話１"),
    tel2: col("電話２"),
    fax: col("傳真機"),
    mob1: col("大哥大１"),
    mob2: col("大哥大２"),
    kindName: col("客戶類別", 1),
    addr: col("公司地址"),
    shipAddr: col("送貨地址"),
    tax: col("營業稅"),
    billing: col("結帳類別", 1),
    email: col("電子信箱"),
    note: col("備註"),
    custom1: col("自定一"),
    custom2: col("自定二"),
    created: col("建檔日期"),
  };
  const get = (r: unknown[], i: number) => (i >= 0 ? val(r[i]) : null);

  const records: CustomerRecord[] = [];
  const skipped: ParseResult["skipped"] = [];
  const seen = new Set<string>();

  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    const code = get(r, C.code);
    const name = get(r, C.name) ?? get(r, C.short);
    if (!code && !name) continue;
    if (!code || code === "*") {
      skipped.push({ row: i + 1, reason: code === "*" ? "系統預設客戶（*）" : "沒有客戶編號" });
      continue;
    }
    if (!name) {
      // 表尾的「主管／製表」等列
      if (/主管|製表/.test(code)) continue;
      skipped.push({ row: i + 1, reason: `客戶 ${code} 沒有名稱` });
      continue;
    }
    if (seen.has(code)) {
      skipped.push({ row: i + 1, reason: `客戶編號 ${code} 重複` });
      continue;
    }
    seen.add(code);

    const noteRaw = get(r, C.note);
    let taxId = get(r, C.taxId)?.replace(/\D/g, "") ?? null;
    if (!isValidTaxId(taxId)) taxId = null;
    if (!taxId && noteRaw) {
      // 備註中的「統編：xxxxxxxx」，檢查碼正確才採用（不正確的仍保留在備註）
      const m = noteRaw.match(/統編\D{0,3}(\d{8})/)?.[1] ?? null;
      if (isValidTaxId(m)) taxId = m;
    }

    const kindName = get(r, C.kindName) ?? "";
    const tax = norm(get(r, C.tax));
    const contacts = [get(r, C.contact1), get(r, C.contact2)].filter(Boolean);
    const tel1 = get(r, C.tel1);
    const mob1 = get(r, C.mob1);
    const digits = (s: string | null) => s?.replace(/\D/g, "") ?? "";
    const phone = tel1 ?? mob1;
    const mobile = mob1 && digits(mob1) !== digits(phone) ? mob1 : null;

    let address = get(r, C.addr);
    if (address && SELF_PICKUP.test(address)) address = null;
    const ship = get(r, C.shipAddr);
    const emailRaw = get(r, C.email);

    const extra = [
      noteRaw,
      get(r, C.owner) && `負責人：${get(r, C.owner)}`,
      get(r, C.tel2) && `電話2：${get(r, C.tel2)}`,
      get(r, C.mob2) && `手機2：${get(r, C.mob2)}`,
      ship && !SELF_PICKUP.test(ship) && ship !== address && `送貨地址：${ship}`,
      get(r, C.billing) && `結帳：${get(r, C.billing)}`,
      emailRaw && !emailRaw.includes("@") && emailRaw,
      get(r, C.custom1),
      get(r, C.custom2),
    ].filter(Boolean);

    records.push({
      code,
      name,
      type: taxId || kindName.includes("公司") ? "COMPANY" : "PERSONAL",
      taxId,
      contact: contacts.join("、") || null,
      phone,
      mobile,
      fax: get(r, C.fax),
      email: emailRaw?.includes("@") ? emailRaw : null,
      address,
      taxType: tax === "外加稅" ? "EXCLUDED" : tax === "內含稅" ? "INCLUDED" : null,
      note: extra.join("\n") || null,
      createdAt: rocDate(get(r, C.created)),
    });
  }
  return { records, skipped };
}

// 寫入資料庫：依客戶編號新增或更新
export async function importCustomers(db: DB, records: CustomerRecord[]) {
  let inserted = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < records.length; i += 200) {
      const chunk = records.slice(i, i + 200).map((r) => ({ ...r, createdAt: r.createdAt ?? new Date() }));
      const res = await tx
        .insert(customers)
        .values(chunk)
        .onConflictDoUpdate({
          target: customers.code,
          set: {
            name: sql`excluded.name`,
            type: sql`excluded.type`,
            taxId: sql`excluded.tax_id`,
            contact: sql`excluded.contact`,
            phone: sql`excluded.phone`,
            mobile: sql`excluded.mobile`,
            fax: sql`excluded.fax`,
            email: sql`excluded.email`,
            address: sql`excluded.address`,
            taxType: sql`excluded.tax_type`,
            note: sql`excluded.note`,
          },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      for (const x of res) {
        if (x.inserted) inserted++;
        else updated++;
      }
    }
  });
  return { inserted, updated };
}
