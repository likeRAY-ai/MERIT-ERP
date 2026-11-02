// 匯入舊系統「廠商基本資料」Excel（SUPPLIEREX 格式）
// 以「廠商編號」對應：已存在的更新、沒有的新增，可重複匯入
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { suppliers } from "@/db/schema";
import { isValidTaxId } from "@/lib/format";
import { rocDate } from "./importCustomers";

export type SupplierRecord = {
  code: string;
  name: string;
  taxId: string | null;
  contact: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  createdAt: Date | null;
};

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, "");
const val = (s: unknown) => String(s ?? "").trim() || null;

export function parseLegacySuppliers(rows: unknown[][]) {
  const h = rows.findIndex((r) => r.some((c) => norm(c) === "廠商編號") && r.some((c) => norm(c) === "廠商名稱"));
  if (h < 0) throw new Error("找不到「廠商編號」「廠商名稱」欄位，請確認是舊系統匯出的廠商基本資料");
  const header = rows[h].map(norm);
  const col = (name: string, nth = 0) => {
    let seen = -1;
    return header.findIndex((x) => x === name && ++seen === nth);
  };
  const C = {
    code: col("廠商編號"),
    name: col("廠商名稱"),
    short: col("廠商簡稱"),
    owner: col("負責人"),
    contact1: col("聯絡人１"),
    contact2: col("聯絡人２"),
    taxId: col("統一編號"),
    tel1: col("電話１"),
    tel2: col("電話２"),
    fax: col("傳真機"),
    mob1: col("大哥大１"),
    mob2: col("大哥大２"),
    kind: col("廠商類別", 1),
    billing: col("結帳類別", 1),
    addr: col("公司地址"),
    factory: col("工廠地址"),
    items: col("營業項目"),
    email: col("電子信箱"),
    note: col("備註"),
    custom1: col("自定一"),
    custom2: col("自定二"),
    payDay: col("結帳日"),
    created: col("建檔日期"),
  };
  const get = (r: unknown[], i: number) => (i >= 0 ? val(r[i]) : null);

  const records: SupplierRecord[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const seen = new Set<string>();
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    const code = get(r, C.code);
    const name = get(r, C.name) ?? get(r, C.short);
    if (!code && !name) continue;
    if (!code || /主管|製表/.test(code)) {
      if (code && /主管|製表/.test(code)) continue;
      skipped.push({ row: i + 1, reason: "沒有廠商編號" });
      continue;
    }
    if (!name) {
      skipped.push({ row: i + 1, reason: `廠商 ${code} 沒有名稱` });
      continue;
    }
    if (seen.has(code)) {
      skipped.push({ row: i + 1, reason: `廠商編號 ${code} 重複` });
      continue;
    }
    seen.add(code);
    const digits = (s: string | null) => s?.replace(/\D/g, "") ?? "";
    const tel1 = get(r, C.tel1);
    const mob1 = get(r, C.mob1);
    const phone = tel1 ?? mob1;
    const address = get(r, C.addr);
    const factory = get(r, C.factory);
    const short = get(r, C.short);
    const emailRaw = get(r, C.email);
    const taxRaw = get(r, C.taxId)?.replace(/\D/g, "") ?? null;
    const extra = [
      get(r, C.note),
      short && short !== name && `簡稱：${short}`,
      get(r, C.owner) && `負責人：${get(r, C.owner)}`,
      get(r, C.tel2) && digits(get(r, C.tel2)) !== digits(phone) && `電話2：${get(r, C.tel2)}`,
      get(r, C.mob2) && `手機2：${get(r, C.mob2)}`,
      factory && factory !== address && `工廠地址：${factory}`,
      get(r, C.kind) && `類別：${get(r, C.kind)}`,
      get(r, C.billing) && `結帳：${get(r, C.billing)}`,
      get(r, C.payDay) && `結帳日：${get(r, C.payDay)}`,
      get(r, C.items) && `營業項目：${get(r, C.items)}`,
      emailRaw && !emailRaw.includes("@") && emailRaw,
      get(r, C.custom1),
      get(r, C.custom2),
    ].filter(Boolean);
    records.push({
      code,
      name,
      taxId: isValidTaxId(taxRaw) ? taxRaw : null,
      contact: [get(r, C.contact1), get(r, C.contact2)].filter(Boolean).join("、") || null,
      phone,
      mobile: mob1 && digits(mob1) !== digits(phone) ? mob1 : null,
      fax: get(r, C.fax),
      email: emailRaw?.includes("@") ? emailRaw : null,
      address,
      note: extra.join("\n") || null,
      createdAt: rocDate(get(r, C.created)),
    });
  }
  return { records, skipped };
}

export async function importSuppliers(db: DB, records: SupplierRecord[]) {
  let inserted = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < records.length; i += 200) {
      const chunk = records.slice(i, i + 200).map((r) => ({ ...r, createdAt: r.createdAt ?? new Date() }));
      const res = await tx
        .insert(suppliers)
        .values(chunk)
        .onConflictDoUpdate({
          target: suppliers.code,
          set: {
            name: sql`excluded.name`,
            taxId: sql`excluded.tax_id`,
            contact: sql`excluded.contact`,
            phone: sql`excluded.phone`,
            mobile: sql`excluded.mobile`,
            fax: sql`excluded.fax`,
            email: sql`excluded.email`,
            address: sql`excluded.address`,
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
