// 進貨、銷貨、序號、庫存流程測試
// 執行：TEST_DATABASE_URL=postgresql://... npm test（會清空該資料庫，請勿指向正式資料庫）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { createPurchase, createSale, adjustStock, inStockSerials } from "../src/lib/services/inventory";

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
    .values({ username: "t", name: "測試", passwordHash: "x", role: "OWNER" })
    .returning();
  [{ id: supplierId }] = await db.insert(schema.suppliers).values({ name: "原價屋測試" }).returning();
  [{ id: customerId }] = await db
    .insert(schema.customers)
    .values({ name: "測試公司", type: "COMPANY", taxId: "12345678" })
    .returning();
  [{ id: gpuId }] = await db
    .insert(schema.products)
    .values({ sku: "GPU-1", name: "RTX 測試顯卡", trackSerial: true, retailPrice: 20000, warrantyMonths: 36 })
    .returning();
  [{ id: cableId }] = await db
    .insert(schema.products)
    .values({ sku: "CB-1", name: "HDMI 線", retailPrice: 200 })
    .returning();
});

after(async () => {
  await pool.end();
});

const getProduct = (id: number) => db.query.products.findFirst({ where: eq(schema.products.id, id) });

test("進貨：序號數量不符會被擋下", async () => {
  await assert.rejects(
    createPurchase(db, { supplierId, items: [{ productId: gpuId, qty: 2, unitCost: 15000, serials: ["A1"] }] }, userId),
    /需要序號/,
  );
});

test("進貨：更新庫存、平均成本、序號、單號", async () => {
  const p1 = await createPurchase(
    db,
    {
      supplierId,
      items: [
        { productId: gpuId, qty: 2, unitCost: 15000, serials: ["sn001", " SN002 "] },
        { productId: cableId, qty: 10, unitCost: 80 },
      ],
    },
    userId,
  );
  assert.match(p1.number, /^P\d{8}-001$/);
  assert.equal(p1.total, 30800);

  const p2 = await createPurchase(
    db,
    { supplierId, items: [{ productId: gpuId, qty: 1, unitCost: 16500, serials: ["SN003"] }] },
    userId,
  );
  assert.match(p2.number, /-002$/);

  const gpu = await getProduct(gpuId);
  assert.equal(gpu!.stockQty, 3);
  assert.equal(gpu!.avgCost, 15500); // (2*15000 + 16500) / 3
  assert.deepEqual(await inStockSerials(db, gpuId), ["SN001", "SN002", "SN003"]);
});

test("進貨：重複序號會被擋下", async () => {
  await assert.rejects(
    createPurchase(db, { supplierId, items: [{ productId: gpuId, qty: 1, unitCost: 1, serials: ["sn001"] }] }, userId),
    /已經存在/,
  );
});

test("銷貨：序號商品庫存不足、序號錯誤會被擋下", async () => {
  await assert.rejects(
    createSale(db, { paymentMethod: "CASH", items: [{ productId: gpuId, qty: 4, unitPrice: 1, serials: ["A", "B", "C", "D"] }] }, userId),
    /庫存不足/,
  );
  await assert.rejects(
    createSale(db, { paymentMethod: "CASH", items: [{ productId: gpuId, qty: 1, unitPrice: 20000, serials: ["NOPE"] }] }, userId),
    /尚未進貨/,
  );
  await assert.rejects(
    createSale(db, { paymentMethod: "CREDIT", items: [{ productId: cableId, qty: 1, unitPrice: 200 }] }, userId),
    /月結必須選擇客戶/,
  );
});

test("銷貨：扣庫存、序號改為已售出並計算保固、稅額與成本", async () => {
  const s = await createSale(
    db,
    {
      customerId,
      buyerTaxId: "12345678",
      paymentMethod: "CREDIT",
      items: [
        { productId: gpuId, qty: 1, unitPrice: 21000, serials: ["SN002"] },
        { productId: cableId, qty: 2, unitPrice: 200 },
      ],
    },
    userId,
  );
  assert.match(s.number, /^S\d{8}-001$/);
  assert.equal(s.total, 21400);
  assert.equal(s.taxAmount, 1019); // 21400 - 21400/1.05
  assert.equal(s.costTotal, 15500 + 2 * 80);

  assert.equal((await getProduct(gpuId))!.stockQty, 2);
  assert.equal((await getProduct(cableId))!.stockQty, 8);

  const sn = await db.query.serialNumbers.findFirst({ where: eq(schema.serialNumbers.serial, "SN002") });
  assert.equal(sn!.status, "SOLD");
  assert.ok(sn!.warrantyUntil! > new Date(Date.now() + 35 * 30 * 86400_000));

  // 已售出的序號不能再賣
  await assert.rejects(
    createSale(db, { paymentMethod: "CASH", items: [{ productId: gpuId, qty: 1, unitPrice: 1, serials: ["SN002"] }] }, userId),
    /不在庫存/,
  );
});

test("庫存調整：一般商品可調整，序號商品不行，並留下異動紀錄", async () => {
  assert.equal(await adjustStock(db, { productId: cableId, qty: -1, note: "盤點短少" }, userId), 7);
  await assert.rejects(adjustStock(db, { productId: gpuId, qty: 1, note: "x" }, userId), /序號商品/);
  const moves = await db.query.stockMovements.findMany({ where: eq(schema.stockMovements.productId, cableId) });
  assert.deepEqual(
    moves.map((m) => [m.type, m.qty, m.balanceAfter]),
    [
      ["PURCHASE", 10, 10],
      ["SALE", -2, 8],
      ["ADJUST", -1, 7],
    ],
  );
});

test("同時開多張銷貨單：一般商品允許負庫存，數量與單號都正確", async () => {
  // 線材剩 7，同時賣 5 張各 2 條 → 庫存 -3
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      createSale(db, { paymentMethod: "CASH", items: [{ productId: cableId, qty: 2, unitPrice: 200 }] }, userId),
    ),
  );
  const ok = results.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 5);
  assert.equal((await getProduct(cableId))!.stockQty, -3);
  const numbers = ok.map((r) => (r as PromiseFulfilledResult<{ number: string }>).value.number);
  assert.equal(new Set(numbers).size, 5);
  const moves = await db.query.stockMovements.findMany({ where: eq(schema.stockMovements.productId, cableId) });
  assert.deepEqual(
    moves.filter((m) => m.type === "SALE").map((m) => m.balanceAfter).slice(-5).sort((a, b) => b - a),
    [5, 3, 1, -1, -3],
  );
});

test("負庫存後進貨：庫存補回、平均成本以進價為準", async () => {
  await createPurchase(db, { supplierId, items: [{ productId: cableId, qty: 10, unitCost: 90 }] }, userId);
  const p = (await getProduct(cableId))!;
  assert.equal(p.stockQty, 7);
  assert.equal(p.avgCost, 90);
});
