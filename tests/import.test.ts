// 舊系統客戶資料匯入測試
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { isValidTaxId } from "../src/lib/format";
import { parseLegacyCustomers, importCustomers, rocDate } from "../src/lib/services/importCustomers";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("請設定 TEST_DATABASE_URL");
const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });

const H = ["客戶編號", "客戶名稱", "客戶簡稱", "業務人員", "業務人員", "負 責 人", "聯絡人１", "聯絡人２", "統一編號", "電 話 １", "電 話 ２", "傳 真 機", "大哥大１", "大哥大２", "客戶類別", "客戶類別", "公司地址", "送貨地址", "營 業 稅", "結帳類別", "結帳類別", "電子信箱", "備    註", "建檔日期"];
const row = (o: Record<string, string>) => H.map((h, i) => o[`${h}#${i}`] ?? o[h] ?? "");

const rows = [
  ["旭橙科技有限公司"],
  ["客 戶 基 本 資 料"],
  H,
  row({ 客戶編號: "*", 客戶簡稱: "一般客戶" }),
  row({ 客戶編號: "A001", 客戶名稱: "大明科技有限公司", 統一編號: "04595257", "電 話 １": "04-1234567", 大哥大１: "0912345678", 公司地址: "台中市", "送貨地址": "台中市", "營 業 稅": "外加稅", "結帳類別#20": "月結", 電子信箱: "a@b.com", 建檔日期: "111/11/08" }),
  row({ 客戶編號: "B001", 客戶名稱: "王先生", 大哥大１: "0911222333", 公司地址: "自取", "營 業 稅": "內含稅", "備    註": "統編：22099131 某某行", "負 責 人": "王老闆" }),
  row({ 客戶編號: "C001", 客戶名稱: "", 客戶簡稱: "陳小姐", "營 業 稅": "免  稅" }),
  row({ 客戶編號: "A001", 客戶名稱: "重複的" }),
  ["主管:      製表:"],
];

before(async () => {
  await db.execute(sql`drop schema if exists public cascade; create schema public;`);
  await db.execute(sql`drop schema if exists drizzle cascade;`);
  await migrate(db, { migrationsFolder: "./drizzle" });
});
after(async () => {
  await pool.end();
});

test("統一編號檢查碼", () => {
  assert.ok(isValidTaxId("04595257"));
  assert.ok(isValidTaxId("22099131"));
  assert.ok(!isValidTaxId("12345678"));
  assert.ok(!isValidTaxId("1234567"));
});

test("民國日期轉換", () => {
  assert.equal(rocDate("111/11/08")!.toISOString(), "2022-11-07T16:00:00.000Z");
  assert.equal(rocDate("abc"), null);
});

test("解析舊系統客戶資料", () => {
  const { records, skipped } = parseLegacyCustomers(rows);
  assert.equal(records.length, 3);
  assert.deepEqual(skipped.map((s) => s.reason), ["系統預設客戶（*）", "客戶編號 A001 重複"]);
  const [a, b, c] = records;
  assert.equal(a.type, "COMPANY");
  assert.equal(a.taxType, "EXCLUDED");
  assert.equal(a.phone, "04-1234567");
  assert.equal(a.mobile, "0912345678");
  assert.equal(a.email, "a@b.com");
  assert.match(a.note!, /結帳：月結/);
  assert.equal(b.phone, "0911222333");
  assert.equal(b.mobile, null);
  assert.equal(b.address, null); // 自取
  assert.equal(b.taxId, "22099131"); // 從備註取出統編
  assert.equal(b.type, "COMPANY");
  assert.match(b.note!, /負責人：王老闆/);
  assert.equal(c.name, "陳小姐");
  assert.equal(c.taxType, null);
});

test("匯入：新增後再匯入會更新，不會重複", async () => {
  const { records } = parseLegacyCustomers(rows);
  assert.deepEqual(await importCustomers(db, records), { inserted: 3, updated: 0 });
  records[0].phone = "04-7654321";
  assert.deepEqual(await importCustomers(db, records), { inserted: 0, updated: 3 });
  const all = await db.select().from(schema.customers);
  assert.equal(all.length, 3);
  const a = await db.query.customers.findFirst({ where: eq(schema.customers.code, "A001") });
  assert.equal(a!.phone, "04-7654321");
  assert.equal(a!.createdAt.toISOString(), "2022-11-07T16:00:00.000Z");
});
