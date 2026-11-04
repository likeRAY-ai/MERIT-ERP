// 資安：登入失敗鎖定、改密碼後舊登入失效、員工改設備資料不會動到成本
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { clearFailures, lockedMinutes, recordFailure, throttleKeys, WINDOW_MS } from "../src/lib/services/loginThrottle";
import { saveAsset } from "../src/lib/services/rentals";
import { signSession, verifySession } from "../src/lib/session";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("請設定 TEST_DATABASE_URL");
const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";

before(async () => {
  await db.execute(sql`drop schema if exists public cascade; create schema public;`);
  await db.execute(sql`drop schema if exists drizzle cascade;`);
  await migrate(db, { migrationsFolder: "drizzle" });
});
after(() => pool.end());

test("同一帳號錯 5 次鎖定 15 分鐘，成功登入清除帳號紀錄", async () => {
  const t0 = new Date("2026-11-04T08:00:00Z");
  const keys = throttleKeys("alice", "1.2.3.4");
  for (let i = 0; i < 4; i++) await recordFailure(db, keys, t0);
  assert.equal(await lockedMinutes(db, keys, t0), 0);
  await recordFailure(db, keys, t0);
  assert.equal(await lockedMinutes(db, keys, t0), 15);
  // 別的帳號、同 IP 還沒到 IP 上限，可以登入
  assert.equal(await lockedMinutes(db, throttleKeys("bob", "1.2.3.4"), t0), 0);
  // 15 分鐘後解鎖
  assert.equal(await lockedMinutes(db, keys, new Date(t0.getTime() + 15 * 60000 + 1)), 0);
  await clearFailures(db, "alice");
  assert.equal(await lockedMinutes(db, ["u:alice"], t0), 0);
});

test("超過時間視窗重新計算；同一 IP 錯 20 次鎖定", async () => {
  const t0 = new Date("2026-11-04T09:00:00Z");
  const k = throttleKeys("carol", null);
  for (let i = 0; i < 4; i++) await recordFailure(db, k, t0);
  await recordFailure(db, k, new Date(t0.getTime() + WINDOW_MS + 1000)); // 新視窗，第 1 次
  assert.equal(await lockedMinutes(db, k, new Date(t0.getTime() + WINDOW_MS + 1000)), 0);

  for (let i = 0; i < 20; i++) await recordFailure(db, throttleKeys(`user${i}`, "9.9.9.9"), t0);
  assert.ok((await lockedMinutes(db, throttleKeys("someone", "9.9.9.9"), t0)) > 0);
});

test("登入狀態帶有 sessionVersion；舊 cookie 沒有時視為 0", async () => {
  const tok = await signSession({ uid: 1, name: "A", role: "STAFF", sv: 3 });
  assert.equal((await verifySession(tok))?.sv, 3);
  assert.equal(await verifySession(tok.slice(0, -2) + "xx"), null);
});

test("未提供成本時（員工）修改設備不會改到成本", async () => {
  const { id } = await saveAsset(db, { code: "SEC-1", name: "筆電", monthlyRate: 500, dailyRate: 50, cost: 12000 });
  await saveAsset(db, { code: "SEC-1", name: "筆電 改名", monthlyRate: 600, dailyRate: 60 }, id);
  const a = await db.query.rentalAssets.findFirst({ where: eq(schema.rentalAssets.id, id) });
  assert.equal(a?.cost, 12000);
  assert.equal(a?.name, "筆電 改名");
  const { id: id2 } = await saveAsset(db, { code: "SEC-2", name: "螢幕", monthlyRate: 100, dailyRate: 10 });
  assert.equal((await db.query.rentalAssets.findFirst({ where: eq(schema.rentalAssets.id, id2) }))?.cost, 0);
});
