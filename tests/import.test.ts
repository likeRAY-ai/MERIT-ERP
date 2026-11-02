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

// ───────── 商品 ─────────
import { parseLegacyProducts, importProducts } from "../src/lib/services/importProducts";

const PH = ["產品類別", "類別名稱", "產品編號", "輔助編號", "品名規格", "產品分類", "安全存量", "單    位", "包裝單位", "包裝數量", "進    價", "包裝進價", "售    價", "包裝售價", "標準成本", "包裝標準成本", "期初單位成本", "計算成本", "額外成本", "維修科目", "條碼格式", "條碼內容", "自 定 一", "備註", "圖檔名稱", "建檔日期", "最近進貨", "最近銷貨", "期初總數量", "期初總成本", "總庫存量"];
const prow = (o: Record<string, string>) => PH.map((h) => o[h] ?? "");
const prows = [
  ["旭橙科技有限公司"],
  ["產 品 基 本 資 料"],
  PH,
  prow({ 產品類別: "RAM", 類別名稱: "記憶體", 產品編號: "R1", 品名規格: "DDR5 16G", 產品分類: "單一商品", "單    位": "條", "進    價": "1000", 期初單位成本: "1050", "售    價": "1500", 建檔日期: "111/01/02", 總庫存量: "3" }),
  // 被折成兩列的商品
  prow({ 產品類別: "CPU", 產品編號: "C1", 品名規格: "I5", 產品分類: "單一商品", "單    位": "顆", 期初單位成本: "6000" }),
  ["", "111/11/11", "111/11/12", "111/11/18", "0.00", "0.00", "-2.0"],
  prow({ 產品類別: "ZZZ", 產品編號: "S1", 品名規格: "組裝工資", 產品分類: "單一商品", 維修科目: "Y", 建檔日期: "110/05/05" }),
  prow({ 產品編號: "R1", 品名規格: "重複" }),
  ["主管:   製表:"],
];

test("解析舊系統商品資料（含折行合併）", () => {
  const { records, skipped, merged } = parseLegacyProducts(prows);
  assert.equal(merged, 1);
  assert.equal(records.length, 3);
  assert.deepEqual(skipped.map((s) => s.reason), ["產品編號 R1 重複"]);
  const [r1, c1, s1] = records;
  assert.equal(r1.category, "記憶體");
  assert.equal(r1.avgCost, 1050);
  assert.equal(r1.retailPrice, 1500);
  assert.equal(r1.stockQty, 3);
  assert.equal(c1.stockQty, -2);
  assert.equal(c1.createdAt!.toISOString(), "2022-11-10T16:00:00.000Z");
  assert.equal(s1.category, "ZZZ");
  assert.match(s1.note!, /維修／服務/);
});

test("匯入商品：新商品帶庫存與異動紀錄，再匯入只更新基本資料", async () => {
  const [{ id: uid }] = await db
    .insert(schema.users)
    .values({ username: "imp", name: "匯入", passwordHash: "x", role: "OWNER" })
    .returning();
  const { records } = parseLegacyProducts(prows);
  assert.deepEqual(await importProducts(db, records, uid), { inserted: 3, updated: 0 });
  const r1 = await db.query.products.findFirst({ where: eq(schema.products.sku, "R1"), with: { category: true } });
  assert.equal(r1!.stockQty, 3);
  assert.equal(r1!.category!.name, "記憶體");
  const moves = await db.select().from(schema.stockMovements);
  assert.equal(moves.length, 2); // R1 +3、C1 -2
  // 庫存改變後再匯入：不覆蓋庫存
  await db.update(schema.products).set({ stockQty: 10 }).where(eq(schema.products.sku, "R1"));
  records[0].name = "DDR5 16G 新名稱";
  assert.deepEqual(await importProducts(db, records, uid), { inserted: 0, updated: 3 });
  const again = await db.query.products.findFirst({ where: eq(schema.products.sku, "R1") });
  assert.equal(again!.stockQty, 10);
  assert.equal(again!.name, "DDR5 16G 新名稱");
  assert.equal((await db.select().from(schema.stockMovements)).length, 2);
});

// ───────── 廠商 ─────────
import { parseLegacySuppliers, importSuppliers } from "../src/lib/services/importSuppliers";

test("匯入廠商：解析、備註合併、重複匯入只更新", async () => {
  const SH = ["廠商編號", "廠商名稱", "廠商簡稱", "負 責 人", "聯絡人１", "統一編號", "電 話 １", "大哥大１", "公司地址", "工廠地址", "結帳類別", "結帳類別", "營業項目", "建檔日期"];
  const r = (o: Record<string, string>) => SH.map((h, i) => o[`${h}#${i}`] ?? o[h] ?? "");
  const rows = [
    ["廠 商 基 本 資 料"],
    SH,
    r({ 廠商編號: "A002", 廠商名稱: "立嵐", "負 責 人": "廖耿立", "電 話 １": "04-1", 公司地址: "台中市A", 工廠地址: "台中市B", "結帳類別#11": "月結", 建檔日期: "109/12/22" }),
    r({ 廠商編號: "S1", 廠商名稱: "酷澎股份有限公司", 統一編號: "91002999", 大哥大１: "0936-398316" }),
    ["主管:   製表:"],
  ];
  const { records, skipped } = parseLegacySuppliers(rows);
  assert.equal(records.length, 2);
  assert.equal(skipped.length, 0);
  assert.match(records[0].note!, /負責人：廖耿立/);
  assert.match(records[0].note!, /工廠地址：台中市B/);
  assert.match(records[0].note!, /結帳：月結/);
  assert.equal(records[1].taxId, "91002999");
  assert.equal(records[1].phone, "0936-398316");
  assert.deepEqual(await importSuppliers(db, records), { inserted: 2, updated: 0 });
  assert.deepEqual(await importSuppliers(db, records), { inserted: 0, updated: 2 });
  assert.equal((await db.select().from(schema.suppliers)).length, 2);
});
