// 銷貨單：折扣、已收未收、作廢還原
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { createPurchase, createSale, voidSale, updateSaleInfo } from "../src/lib/services/inventory";
import { saveOrder } from "../src/lib/services/orders";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("請設定 TEST_DATABASE_URL");
const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });

let uid = 0;
let cust = 0;
let gpu = 0;
let cable = 0;

before(async () => {
  await db.execute(sql`drop schema if exists public cascade; create schema public;`);
  await db.execute(sql`drop schema if exists drizzle cascade;`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  [{ id: uid }] = await db.insert(schema.users).values({ username: "s", name: "店員", passwordHash: "x", role: "OWNER" }).returning();
  const [{ id: sup }] = await db.insert(schema.suppliers).values({ name: "供" }).returning();
  [{ id: cust }] = await db.insert(schema.customers).values({ name: "客" }).returning();
  [{ id: gpu }] = await db.insert(schema.products).values({ sku: "G", name: "顯卡", trackSerial: true }).returning();
  [{ id: cable }] = await db.insert(schema.products).values({ sku: "C", name: "線" }).returning();
  await createPurchase(
    db,
    {
      supplierId: sup,
      items: [
        { productId: gpu, qty: 2, unitCost: 10000, serials: ["X1", "X2"] },
        { productId: cable, qty: 5, unitCost: 100 },
      ],
    },
    uid,
  );
});
after(async () => {
  await pool.end();
});

const product = (id: number) => db.query.products.findFirst({ where: eq(schema.products.id, id) });

test("折扣、外加稅、已收金額預設", async () => {
  const s = await createSale(
    db,
    {
      paymentMethod: "CASH",
      taxType: "EXCLUDED",
      discount: 100,
      items: [{ productId: cable, qty: 2, unitPrice: 300 }],
      salespersonId: uid,
      deliveryMethod: "宅配",
      invoiceNo: "ab12345678",
    },
    uid,
  );
  assert.equal(s.discount, 100);
  assert.equal(s.total, 525); // (600-100) × 1.05
  assert.equal(s.taxAmount, 25);
  assert.equal(s.paidAmount, 525); // 現金預設收齊
  assert.equal(s.invoiceNo, "AB12345678");

  const credit = await createSale(
    db,
    { customerId: cust, paymentMethod: "CREDIT", items: [{ productId: cable, qty: 1, unitPrice: 210 }] },
    uid,
  );
  assert.equal(credit.paidAmount, 0); // 月結預設未收
  await updateSaleInfo(db, credit.id, { invoiceNo: "cd00000001", paidAmount: 210 });
  const u = await db.query.sales.findFirst({ where: eq(schema.sales.id, credit.id) });
  assert.equal(u!.paidAmount, 210);
  assert.equal(u!.invoiceNo, "CD00000001");
  await assert.rejects(updateSaleInfo(db, credit.id, { paidAmount: 999 }), /不可大於/);
  await assert.rejects(
    createSale(db, { paymentMethod: "CASH", discount: 9999, items: [{ productId: cable, qty: 1, unitPrice: 10 }] }, uid),
    /折扣/,
  );
});

test("作廢：庫存與序號還原、訂單回到待出貨、不能重複作廢", async () => {
  const before = (await product(cable))!.stockQty;
  const { id: orderId } = await saveOrder(
    db,
    {
      customerId: cust,
      taxType: "INCLUDED",
      confirm: true,
      items: [
        { productId: gpu, qty: 1, unitPrice: 20000 },
        { productId: cable, qty: 1, unitPrice: 200 },
      ],
    },
    uid,
  );
  const o = (await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId), with: { items: true } }))!;
  const s = await createSale(
    db,
    {
      customerId: cust,
      paymentMethod: "CASH",
      orderId,
      items: [
        { productId: gpu, qty: 1, unitPrice: 20000, serials: ["X1"], orderItemId: o.items.find((i) => i.productId === gpu)!.id },
        { productId: cable, qty: 1, unitPrice: 200, orderItemId: o.items.find((i) => i.productId === cable)!.id },
      ],
    },
    uid,
  );
  assert.equal((await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) }))!.status, "COMPLETED");

  await assert.rejects(voidSale(db, s.id, " ", uid), /作廢原因/);
  await voidSale(db, s.id, "開錯客戶", uid);

  assert.equal((await product(cable))!.stockQty, before);
  assert.equal((await product(gpu))!.stockQty, 2);
  const sn = await db.query.serialNumbers.findFirst({ where: eq(schema.serialNumbers.serial, "X1") });
  assert.equal(sn!.status, "IN_STOCK");
  assert.equal(sn!.saleItemId, null);
  const o2 = (await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId), with: { items: true } }))!;
  assert.equal(o2.status, "CONFIRMED");
  assert.ok(o2.items.every((i) => i.shippedQty === 0));
  const v = await db.query.sales.findFirst({ where: eq(schema.sales.id, s.id) });
  assert.ok(v!.voidedAt);
  assert.equal(v!.voidReason, "開錯客戶");
  await assert.rejects(voidSale(db, s.id, "再一次", uid), /已經作廢/);
  await assert.rejects(updateSaleInfo(db, s.id, { paidAmount: 0 }), /作廢/);

  // 序號可以再次出貨
  await createSale(db, { paymentMethod: "CASH", items: [{ productId: gpu, qty: 1, unitPrice: 1, serials: ["X1"] }] }, uid);
});
