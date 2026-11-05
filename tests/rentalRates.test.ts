// 租金調整：長期調整（下一期起生效、留紀錄）與單期調整（改單價、加收、折讓）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { voidSale } from "../src/lib/services/inventory";
import { billContract, changeRates, createContract, returnItems, saveAsset } from "../src/lib/services/rentals";
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
  [{ id: uid }] = await db.insert(schema.users).values({ username: "r", name: "老闆", passwordHash: "x", role: "OWNER" }).returning();
  [{ id: cust }] = await db.insert(schema.customers).values({ name: "租用公司", type: "COMPANY" }).returning();
});
after(() => pool.end());

async function contract(taxType: "INCLUDED" | "EXCLUDED", n: number) {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const { id } = await saveAsset(db, { code: `RT-${taxType}-${i}`, name: "文書機", monthlyRate: 500, dailyRate: 50, cost: 0 });
    ids.push(id);
  }
  const k = await createContract(
    db,
    {
      customerId: cust,
      billingType: "MONTHLY",
      billingMonths: 1,
      startDate: D("2026-10-01"),
      taxType,
      paymentMethod: "CREDIT",
      deposit: 0,
      items: ids.map((assetId) => ({ assetId, rate: 500 })),
    },
    uid,
  );
  const items = await db.select().from(schema.rentalItems).where(eq(schema.rentalItems.contractId, k.id)).orderBy(schema.rentalItems.id);
  return { k, items };
}

test("調整租金：下一期起生效、已開的帳單不變、留下紀錄", async () => {
  const { k, items } = await contract("INCLUDED", 2);
  const s1 = await billContract(db, k.id, uid);
  assert.equal(s1.total, 1000);

  const n = await changeRates(db, k.id, [{ itemId: items[0].id, rate: 450 }, { itemId: items[1].id, rate: 500 }], "續約調降", uid);
  assert.equal(n, 1); // 第二台沒變動
  assert.equal((await db.query.sales.findFirst({ where: eq(schema.sales.id, s1.id) }))?.total, 1000);

  const s2 = await billContract(db, k.id, uid);
  assert.equal(s2.total, 950);
  const log = await db.select().from(schema.rentalRateChanges).where(eq(schema.rentalRateChanges.contractId, k.id));
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].oldRate, log[0].newRate, log[0].reason], [500, 450, "續約調降"]);

  await assert.rejects(changeRates(db, k.id, [{ itemId: items[1].id, rate: 500 }], null, uid), /沒有變動/);
  await assert.rejects(changeRates(db, k.id, [{ itemId: items[0].id, rate: -1 }], null, uid), /0 以上/);
  await assert.rejects(changeRates(db, k.id, [{ itemId: 999999, rate: 1 }], null, uid), /不屬於/);
  await returnItems(db, k.id, [items[1].id], D("2026-12-01"));
  await assert.rejects(changeRates(db, k.id, [{ itemId: items[1].id, rate: 1 }], null, uid), /已收回/);
});

test("單期調整：改本期單價、加收、折讓，不影響租約", async () => {
  const { k, items } = await contract("EXCLUDED", 2);
  const s = await billContract(db, k.id, uid, {
    rates: { [items[0].id]: 300 },
    extra: { label: "到府維修費", amount: 200 },
    discount: { label: "故障停機", amount: 100 },
  });
  // 未稅：300 + 500 + 200 − 100 = 900，含稅 945
  assert.equal(s.total, 945);
  assert.equal(s.discount, 100);
  const lines = await db.select().from(schema.saleItems).where(eq(schema.saleItems.saleId, s.id)).orderBy(schema.saleItems.id);
  assert.equal(lines.length, 3);
  assert.match(lines[0].description!, /本期調整，原 500/);
  assert.equal(lines[2].description, "到府維修費");
  assert.match(s.note!, /故障停機 折讓 100/);
  // 租約的租金沒有變
  const it = await db.query.rentalItems.findFirst({ where: eq(schema.rentalItems.id, items[0].id) });
  assert.equal(it?.rate, 500);

  // 作廢後重開，可以照原價
  await voidSale(db, s.id, "金額有誤", uid);
  const again = await billContract(db, k.id, uid);
  assert.equal(again.total, 1050);

  await assert.rejects(billContract(db, k.id, uid, { discount: { label: "x", amount: 99999 } }), /折扣金額不可大於/);
  await assert.rejects(billContract(db, k.id, uid, { rates: { [items[0].id]: -5 } }), /0 以上/);
});
