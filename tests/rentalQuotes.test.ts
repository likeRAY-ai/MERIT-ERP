// 租賃報價單：建立、試算、修改、未成交、轉租約
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { saveAsset, createContract } from "../src/lib/services/rentals";
import {
  saveRentalQuote,
  setRentalQuoteStatus,
  quoteTotals,
  quoteEndDate,
  loadRentalQuote,
  type RentalQuoteInput,
} from "../src/lib/services/rentalQuotes";
import { parseDateInput } from "../src/lib/format";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("請設定 TEST_DATABASE_URL");
const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });
const D = (s: string) => parseDateInput(s)!;
let uid = 0;
let cust = 0;

before(async () => {
  await db.execute(sql`drop schema if exists public cascade; create schema public;`);
  await db.execute(sql`drop schema if exists drizzle cascade;`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  [{ id: uid }] = await db.insert(schema.users).values({ username: "q", name: "老闆", passwordHash: "x", role: "OWNER" }).returning();
  [{ id: cust }] = await db.insert(schema.customers).values({ name: "活動公司", type: "COMPANY" }).returning();
});
after(async () => {
  await pool.end();
});

const base: RentalQuoteInput = {
  customerName: "王先生",
  billingType: "MONTHLY",
  billingMonths: 1,
  term: 6,
  taxType: "EXCLUDED",
  deposit: 5000,
  items: [
    { kind: "RENT", name: "文書機 i5/8G/256G", qty: 10, unitPrice: 600 },
    { kind: "RENT", name: "24 吋螢幕", qty: 10, unitPrice: 150 },
    { kind: "FEE", name: "安裝及運費", qty: 1, unitPrice: 2000 },
    { kind: "RENT", name: "   ", qty: 1, unitPrice: 1 }, // 空白列忽略
  ],
};

test("試算：每月租金、租期合計、一次性費用、外加稅", () => {
  const t = quoteTotals({ billingType: "MONTHLY", term: 6, taxType: "EXCLUDED" }, base.items.slice(0, 3));
  assert.equal(t.rent, 7500);
  assert.equal(t.units, 20);
  assert.equal(t.period.total, 7875);
  assert.equal(t.termRent, 45000);
  assert.equal(t.fees, 2000);
  assert.equal(t.grand!.subtotal, 47000);
  assert.equal(t.grand!.total, 49350);
  // 不定期：沒有租期合計
  assert.equal(quoteTotals({ billingType: "MONTHLY", term: null, taxType: "INCLUDED" }, base.items).grand, null);
});

test("租期推算到期日", () => {
  assert.equal(quoteEndDate(D("2026-11-10"), "MONTHLY", 6)!.getTime(), D("2027-05-09").getTime());
  assert.equal(quoteEndDate(D("2026-11-10"), "DAILY", 3)!.getTime(), D("2026-11-12").getTime());
  assert.equal(quoteEndDate(D("2026-11-10"), "MONTHLY", null), null);
});

test("建立、修改、未成交、重新開啟", async () => {
  const id = await saveRentalQuote(db, base, uid);
  let q = (await loadRentalQuote(db, id))!;
  assert.match(q.number, /^RQ\d{8}-001$/);
  assert.equal(q.items.length, 3);
  assert.equal(q.customerName, "王先生");

  await saveRentalQuote(db, { ...base, items: base.items.slice(0, 1), deposit: 0 }, uid, id);
  q = (await loadRentalQuote(db, id))!;
  assert.equal(q.items.length, 1);
  assert.equal(q.deposit, 0);

  await assert.rejects(saveRentalQuote(db, { ...base, items: [base.items[2]] }, uid), /至少輸入一項租賃設備/);
  await assert.rejects(saveRentalQuote(db, { ...base, customerName: "" }, uid), /請選擇客戶/);
  await assert.rejects(saveRentalQuote(db, { ...base, billingType: "DAILY", term: null }, uid), /租用天數/);
  await assert.rejects(saveRentalQuote(db, { ...base, buyerTaxId: "1234567" }, uid), /統一編號/);

  await setRentalQuoteStatus(db, id, "lose");
  await assert.rejects(saveRentalQuote(db, base, uid, id), /只有報價中/);
  await setRentalQuoteStatus(db, id, "reopen");
  q = (await loadRentalQuote(db, id))!;
  assert.equal(q.status, "QUOTE");
});

test("轉成租約：報價單變已成交並連結租約，不能重複轉", async () => {
  const qid = await saveRentalQuote(db, { ...base, customerName: null, customerId: cust }, uid);
  const { id: a1 } = await saveAsset(db, { code: "Q-01", name: "文書機 i5/8G/256G", monthlyRate: 700, dailyRate: 200, cost: 0 });
  const { id: a2 } = await saveAsset(db, { code: "Q-02", name: "文書機 i5/8G/256G", monthlyRate: 700, dailyRate: 200, cost: 0 });
  const input = {
    customerId: cust,
    billingType: "MONTHLY" as const,
    billingMonths: 1,
    startDate: D("2026-11-10"),
    taxType: "EXCLUDED" as const,
    paymentMethod: "CREDIT" as const,
    deposit: 5000,
    items: [{ assetId: a1, rate: 600 }],
    quoteId: qid,
  };
  const k = await createContract(db, input, uid);
  const q = (await loadRentalQuote(db, qid))!;
  assert.equal(q.status, "ACCEPTED");
  assert.equal(q.contractId, k.id);
  await assert.rejects(createContract(db, { ...input, items: [{ assetId: a2, rate: 600 }] }, uid), /已轉成租約/);
  // 失敗時設備狀態不變
  const [x] = await db.select().from(schema.rentalAssets).where(eq(schema.rentalAssets.id, a2));
  assert.equal(x.status, "AVAILABLE");
});
