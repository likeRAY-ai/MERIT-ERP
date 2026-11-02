// 報價單／訂單流程測試
// 執行：TEST_DATABASE_URL=postgresql://... npm test（會清空該資料庫，請勿指向正式資料庫）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { createPurchase, createSale } from "../src/lib/services/inventory";
import { saveOrder, setOrderStatus, orderShortage } from "../src/lib/services/orders";
import { reservedQty } from "../src/lib/services/products";
import { calcTotals, convertPrice } from "../src/lib/format";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("請設定 TEST_DATABASE_URL");
const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });

let userId = 0;
let supplierId = 0;
let customerId = 0;
let gpuId = 0; // 序號商品
let cableId = 0; // 一般商品

before(async () => {
  await db.execute(sql`drop schema if exists public cascade; create schema public;`);
  await db.execute(sql`drop schema if exists drizzle cascade;`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  [{ id: userId }] = await db
    .insert(schema.users)
    .values({ username: "o", name: "業務", passwordHash: "x", role: "OWNER" })
    .returning();
  [{ id: supplierId }] = await db.insert(schema.suppliers).values({ name: "供應商" }).returning();
  [{ id: customerId }] = await db
    .insert(schema.customers)
    .values({ name: "某某公司", type: "COMPANY", taxId: "12345678" })
    .returning();
  [{ id: gpuId }] = await db
    .insert(schema.products)
    .values({ sku: "G1", name: "顯卡", trackSerial: true, retailPrice: 21000 })
    .returning();
  [{ id: cableId }] = await db.insert(schema.products).values({ sku: "C1", name: "線材", retailPrice: 210 }).returning();
  await createPurchase(
    db,
    {
      supplierId,
      items: [
        { productId: gpuId, qty: 2, unitCost: 15000, serials: ["SN1", "SN2"] },
        { productId: cableId, qty: 10, unitCost: 50 },
      ],
    },
    userId,
  );
});

after(async () => {
  await pool.end();
});

const getOrder = (id: number) =>
  db.query.orders.findFirst({ where: eq(schema.orders.id, id), with: { items: true } });

test("稅額計算：含稅與外加稅", () => {
  assert.deepEqual(calcTotals(1050, "INCLUDED"), { subtotal: 1000, tax: 50, total: 1050 });
  assert.deepEqual(calcTotals(1000, "EXCLUDED"), { subtotal: 1000, tax: 50, total: 1050 });
  assert.equal(convertPrice(21000, "INCLUDED", "EXCLUDED"), 20000);
  assert.equal(convertPrice(20000, "EXCLUDED", "INCLUDED"), 21000);
});

test("報價單：建立、外加稅金額、單號 Q 開頭", async () => {
  const { id } = await saveOrder(
    db,
    {
      customerId,
      taxType: "EXCLUDED",
      items: [
        { productId: gpuId, qty: 3, unitPrice: 20000, description: "白色" },
        { productId: cableId, qty: 2, unitPrice: 200 },
      ],
    },
    userId,
  );
  const o = (await getOrder(id))!;
  assert.match(o.number, /^Q\d{8}-001$/);
  assert.equal(o.status, "QUOTE");
  assert.equal(o.subtotal, 60400);
  assert.equal(o.taxAmount, 3020);
  assert.equal(o.total, 63420);
  // 報價中不保留庫存
  assert.equal((await reservedQty(db, [gpuId])).get(gpuId) ?? 0, 0);
});

test("成交後保留庫存並計算缺貨；修改、取消成交", async () => {
  const [o] = await db.select().from(schema.orders).limit(1);
  await setOrderStatus(db, o.id, "confirm");
  assert.equal((await getOrder(o.id))!.status, "CONFIRMED");
  assert.equal((await reservedQty(db, [gpuId])).get(gpuId), 3);
  const short = await orderShortage(db, o.id);
  assert.equal(short.find((x) => x.productId === gpuId)!.short, 1); // 庫存 2，訂 3
  assert.equal(short.find((x) => x.productId === cableId)!.short, 0);

  await setOrderStatus(db, o.id, "unconfirm");
  assert.equal((await getOrder(o.id))!.status, "QUOTE");
  await assert.rejects(setOrderStatus(db, o.id, "close"), /狀態/);

  // 修改內容後再成交
  await saveOrder(
    db,
    {
      customerId,
      taxType: "EXCLUDED",
      confirm: true,
      items: [
        { productId: gpuId, qty: 2, unitPrice: 20000 },
        { productId: cableId, qty: 2, unitPrice: 200 },
      ],
    },
    userId,
    o.id,
  );
  const o2 = (await getOrder(o.id))!;
  assert.equal(o2.status, "CONFIRMED");
  assert.equal(o2.items.length, 2);
  assert.equal(o2.total, 42420);
});

test("訂單轉銷貨：可分批出貨，超出數量會擋下，出完自動結案", async () => {
  const o = (await db.query.orders.findFirst({ with: { items: true } }))!;
  const gpuLine = o.items.find((i) => i.productId === gpuId)!;
  const cableLine = o.items.find((i) => i.productId === cableId)!;

  // 稅別要與訂單一致
  await assert.rejects(
    createSale(
      db,
      {
        customerId,
        paymentMethod: "CASH",
        orderId: o.id,
        items: [{ productId: cableId, qty: 1, unitPrice: 200, orderItemId: cableLine.id }],
      },
      userId,
    ),
    /稅別/,
  );

  // 超出訂單數量
  await assert.rejects(
    createSale(
      db,
      {
        customerId,
        paymentMethod: "CASH",
        taxType: "EXCLUDED",
        orderId: o.id,
        items: [{ productId: cableId, qty: 3, unitPrice: 200, orderItemId: cableLine.id }],
      },
      userId,
    ),
    /超過訂單待出貨數量/,
  );

  // 第一批：只出顯卡 1 張
  const s1 = await createSale(
    db,
    {
      customerId,
      paymentMethod: "CREDIT",
      taxType: "EXCLUDED",
      orderId: o.id,
      items: [{ productId: gpuId, qty: 1, unitPrice: 20000, serials: ["SN1"], orderItemId: gpuLine.id }],
    },
    userId,
  );
  assert.equal(s1.total, 21000);
  assert.equal(s1.taxAmount, 1000);
  assert.equal(s1.taxType, "EXCLUDED");
  assert.equal((await getOrder(o.id))!.status, "CONFIRMED");
  assert.equal((await reservedQty(db, [gpuId])).get(gpuId), 1);

  // 第二批：剩下全部 → 自動結案
  await createSale(
    db,
    {
      customerId,
      paymentMethod: "CREDIT",
      taxType: "EXCLUDED",
      orderId: o.id,
      items: [
        { productId: gpuId, qty: 1, unitPrice: 20000, serials: ["SN2"], orderItemId: gpuLine.id },
        { productId: cableId, qty: 2, unitPrice: 200, orderItemId: cableLine.id },
      ],
    },
    userId,
  );
  const done = (await getOrder(o.id))!;
  assert.equal(done.status, "COMPLETED");
  assert.ok(done.items.every((i) => i.shippedQty === i.qty));
  assert.equal((await reservedQty(db, [gpuId])).get(gpuId) ?? 0, 0);

  // 已結案不能再出貨、不能修改
  await assert.rejects(
    createSale(
      db,
      {
        customerId,
        paymentMethod: "CASH",
        taxType: "EXCLUDED",
        orderId: o.id,
        items: [{ productId: cableId, qty: 1, unitPrice: 200, orderItemId: cableLine.id }],
      },
      userId,
    ),
    /已成交/,
  );
  await assert.rejects(
    saveOrder(db, { taxType: "INCLUDED", items: [{ productId: cableId, qty: 1, unitPrice: 1 }] }, userId, o.id),
    /不能修改/,
  );
});

test("未成交、重新開啟、手動結案", async () => {
  const { id } = await saveOrder(
    db,
    { customerName: "王先生", taxType: "INCLUDED", items: [{ productId: cableId, qty: 1, unitPrice: 210 }] },
    userId,
  );
  const o = (await getOrder(id))!;
  assert.match(o.number, /-002$/);
  assert.equal(o.customerName, "王先生");
  assert.equal(o.taxAmount, 10);
  await setOrderStatus(db, id, "lose");
  assert.equal((await getOrder(id))!.status, "LOST");
  await setOrderStatus(db, id, "reopen");
  assert.equal((await getOrder(id))!.status, "QUOTE");
  await setOrderStatus(db, id, "confirm");
  await setOrderStatus(db, id, "close");
  const closed = (await getOrder(id))!;
  assert.equal(closed.status, "CLOSED");
  assert.ok(closed.closedAt);
});

test("一般銷貨（不經訂單）不受影響", async () => {
  const s = await createSale(
    db,
    { paymentMethod: "CASH", items: [{ productId: cableId, qty: 1, unitPrice: 210 }] },
    userId,
  );
  assert.equal(s.taxType, "INCLUDED");
  assert.equal(s.total, 210);
  assert.equal(s.taxAmount, 10);
  assert.equal(s.orderId, null);
});
