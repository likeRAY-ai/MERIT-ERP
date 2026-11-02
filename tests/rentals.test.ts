// 租賃：設備、租約、每期開帳、退租、押金、作廢連動
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { createPurchase, createSale, voidSale } from "../src/lib/services/inventory";
import {
  saveAsset,
  assetFromStock,
  createContract,
  billContract,
  nextPeriod,
  returnItems,
  endContract,
  dueContracts,
  receiveDeposit,
} from "../src/lib/services/rentals";
import { addMonthsTW, addDaysTW, parseDateInput } from "../src/lib/format";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("請設定 TEST_DATABASE_URL");
const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });

const D = (s: string) => parseDateInput(s)!;
let uid = 0;
let cust = 0;
const assets: number[] = [];

before(async () => {
  await db.execute(sql`drop schema if exists public cascade; create schema public;`);
  await db.execute(sql`drop schema if exists drizzle cascade;`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  [{ id: uid }] = await db.insert(schema.users).values({ username: "r", name: "老闆", passwordHash: "x", role: "OWNER" }).returning();
  [{ id: cust }] = await db.insert(schema.customers).values({ name: "租用公司", type: "COMPANY" }).returning();
});
after(async () => {
  await pool.end();
});

test("台灣日期：加月份月底對齊、加天數", () => {
  assert.equal(addMonthsTW(D("2026-01-31"), 1).getTime(), D("2026-02-28").getTime());
  assert.equal(addMonthsTW(D("2026-11-01"), 1).getTime(), D("2026-12-01").getTime());
  assert.equal(addMonthsTW(D("2026-11-15"), 3).getTime(), D("2027-02-15").getTime());
  assert.equal(addDaysTW(D("2026-12-01"), -1).getTime(), D("2026-11-30").getTime());
});

test("期間計算：月繳、預繳、到期日截止、按天", () => {
  const base = { billingType: "MONTHLY" as const, startDate: D("2026-01-31"), endDate: null };
  const p1 = nextPeriod({ ...base, billingMonths: 1, nextBillDate: D("2026-01-31") })!;
  assert.equal(p1.end.getTime(), D("2026-02-27").getTime());
  assert.equal(p1.next!.getTime(), D("2026-02-28").getTime());
  // 以起始日為基準：2/28 的下一期是 3/31，不會偏成 3/28
  const p2 = nextPeriod({ ...base, billingMonths: 1, nextBillDate: p1.next })!;
  assert.equal(p2.next!.getTime(), D("2026-03-31").getTime());
  // 預繳 3 個月
  const q = nextPeriod({ ...base, startDate: D("2026-11-01"), billingMonths: 3, nextBillDate: D("2026-11-01") })!;
  assert.equal(q.units, 3);
  assert.equal(q.end.getTime(), D("2027-01-31").getTime());
  // 有到期日：最後一期只收到到期日
  const e = nextPeriod({ billingType: "MONTHLY", billingMonths: 6, startDate: D("2026-11-01"), endDate: D("2027-01-15"), nextBillDate: D("2026-11-01") })!;
  assert.equal(e.units, 3);
  assert.equal(e.end.getTime(), D("2027-01-15").getTime());
  assert.equal(e.next, null);
  // 按天
  const d = nextPeriod({ billingType: "DAILY", billingMonths: 1, startDate: D("2026-11-10"), endDate: D("2026-11-12"), nextBillDate: D("2026-11-10") })!;
  assert.equal(d.units, 3);
  assert.equal(d.next, null);
});

test("出租設備：新增、從庫存序號轉入", async () => {
  for (const code of ["pc-001", "PC-002", "PC-003"]) {
    assets.push((await saveAsset(db, { code, name: "文書機", monthlyRate: 600, dailyRate: 100, cost: 8000 })).id);
  }
  await assert.rejects(saveAsset(db, { code: "PC-001", name: "x", monthlyRate: 0, dailyRate: 0, cost: 0 }), /已存在/);
  // 庫存序號轉入
  const [{ id: sup }] = await db.insert(schema.suppliers).values({ name: "供" }).returning();
  const [{ id: nb }] = await db.insert(schema.products).values({ sku: "NB", name: "筆電", trackSerial: true }).returning();
  await createPurchase(db, { supplierId: sup, items: [{ productId: nb, qty: 1, unitCost: 15000, serials: ["NB1"] }] }, uid);
  const a = await assetFromStock(db, { serial: "nb1", monthlyRate: 900, dailyRate: 200 }, uid);
  const asset = await db.query.rentalAssets.findFirst({ where: eq(schema.rentalAssets.id, a.id) });
  assert.equal(asset!.cost, 15000);
  assert.equal((await db.query.products.findFirst({ where: eq(schema.products.id, nb) }))!.stockQty, 0);
  const sn = await db.query.serialNumbers.findFirst({ where: eq(schema.serialNumbers.serial, "NB1") });
  assert.equal(sn!.status, "RENTAL");
  assets.push(a.id);
});

test("月繳租約：開帳產生銷貨單、不扣庫存、到期提醒、退租、押金", async () => {
  const k = await createContract(
    db,
    {
      customerId: cust,
      billingType: "MONTHLY",
      billingMonths: 1,
      startDate: D("2026-10-01"),
      taxType: "EXCLUDED",
      paymentMethod: "CREDIT",
      deposit: 10000,
      depositReceived: true,
      items: [
        { assetId: assets[0], rate: 600 },
        { assetId: assets[1], rate: 600 },
      ],
    },
    uid,
  );
  assert.match(k.number, /^R\d{8}-001$/);
  // 出租中的設備不能再租
  await assert.rejects(
    createContract(db, { customerId: cust, billingType: "MONTHLY", billingMonths: 1, startDate: D("2026-10-01"), taxType: "INCLUDED", paymentMethod: "CASH", deposit: 0, items: [{ assetId: assets[0], rate: 1 }] }, uid),
    /不能出租/,
  );
  assert.ok((await dueContracts(db, D("2026-10-05"))).some((x) => x.id === k.id));

  const s1 = await billContract(db, k.id, uid);
  assert.equal(s1.total, 1260); // 2 台 × 600 未稅 × 1.05
  assert.equal(s1.paidAmount, 0);
  const items = await db.select().from(schema.saleItems).where(eq(schema.saleItems.saleId, s1.id));
  assert.equal(items.length, 2);
  assert.match(items[0].description!, /PC-00\d 文書機｜2026\/10\/01～2026\/10\/31/);
  const rental = await db.query.products.findFirst({ where: eq(schema.products.sku, "RENTAL") });
  assert.equal(rental!.isService, true);
  assert.equal(rental!.stockQty, 0); // 服務項目不扣庫存
  const k1 = await db.query.rentalContracts.findFirst({ where: eq(schema.rentalContracts.id, k.id) });
  assert.equal(k1!.nextBillDate!.getTime(), D("2026-11-01").getTime());
  assert.ok(!(await dueContracts(db, D("2026-10-20"))).some((x) => x.id === k.id));

  // 作廢最新一期 → 可以重新開帳；作廢較舊一期會被擋
  const s2 = await billContract(db, k.id, uid);
  await assert.rejects(voidSale(db, s1.id, "x", uid), /較新一期/);
  await voidSale(db, s2.id, "金額錯誤", uid);
  const k2 = await db.query.rentalContracts.findFirst({ where: eq(schema.rentalContracts.id, k.id) });
  assert.equal(k2!.nextBillDate!.getTime(), D("2026-11-01").getTime());
  await billContract(db, k.id, uid); // 11 月

  // 收回一台：12 月只收 1 台
  const its = await db.select().from(schema.rentalItems).where(eq(schema.rentalItems.contractId, k.id));
  await returnItems(db, k.id, [its[0].id], D("2026-11-20"));
  assert.equal((await db.query.rentalAssets.findFirst({ where: eq(schema.rentalAssets.id, its[0].assetId) }))!.status, "AVAILABLE");
  const s4 = await billContract(db, k.id, uid);
  assert.equal(s4.total, 630);

  // 還有未開帳的租期不能結束
  await assert.rejects(endContract(db, k.id, { date: D("2027-01-05") }), /尚未開帳/);
  await assert.rejects(endContract(db, k.id, { date: D("2026-12-20"), depositRefund: 20000 }), /退還押金/);
  await endContract(db, k.id, { date: D("2026-12-20"), depositRefund: 9000 });
  const done = await db.query.rentalContracts.findFirst({ where: eq(schema.rentalContracts.id, k.id) });
  assert.equal(done!.status, "ENDED");
  assert.equal(done!.depositRefund, 9000);
  assert.equal((await db.query.rentalAssets.findFirst({ where: eq(schema.rentalAssets.id, its[1].assetId) }))!.status, "AVAILABLE");
  await assert.rejects(billContract(db, k.id, uid), /沒有待收/);
});

test("預繳 3 個月、按天計租、押金後收", async () => {
  const k = await createContract(
    db,
    {
      customerId: cust,
      billingType: "MONTHLY",
      billingMonths: 3,
      startDate: D("2026-11-01"),
      taxType: "INCLUDED",
      paymentMethod: "TRANSFER",
      deposit: 5000,
      items: [{ assetId: assets[3], rate: 900 }],
    },
    uid,
  );
  const s = await billContract(db, k.id, uid);
  assert.equal(s.total, 2700);
  assert.equal(s.paidAmount, 2700);
  await receiveDeposit(db, k.id);
  await assert.rejects(receiveDeposit(db, k.id), /已收/);

  const d = await createContract(
    db,
    {
      customerId: cust,
      billingType: "DAILY",
      billingMonths: 1,
      startDate: D("2026-12-10"),
      endDate: D("2026-12-14"),
      taxType: "INCLUDED",
      paymentMethod: "CASH",
      deposit: 0,
      items: [{ assetId: assets[2], rate: 100 }],
    },
    uid,
  );
  const ds = await billContract(db, d.id, uid);
  assert.equal(ds.total, 500);
  await assert.rejects(billContract(db, d.id, uid), /沒有待收/);
  await endContract(db, d.id, { date: D("2026-12-14") });
});

test("服務項目：銷貨不扣庫存、成本為 0", async () => {
  const [{ id: fee }] = await db.insert(schema.products).values({ sku: "FEE", name: "組裝工資", isService: true }).returning();
  const s = await createSale(db, { paymentMethod: "CASH", items: [{ productId: fee, qty: 2, unitPrice: 500 }] }, uid);
  assert.equal(s.costTotal, 0);
  assert.equal((await db.query.products.findFirst({ where: eq(schema.products.id, fee) }))!.stockQty, 0);
  await voidSale(db, s.id, "x", uid);
  assert.equal((await db.query.products.findFirst({ where: eq(schema.products.id, fee) }))!.stockQty, 0);
});
