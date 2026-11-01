// 建立初始資料：npm run db:seed
// - 老闆帳號（帳號 admin，密碼取自 SEED_ADMIN_PASSWORD，未設定則隨機產生並顯示一次）
// - 常用商品分類
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import * as schema from "../src/db/schema";

const DEFAULT_CATEGORIES = [
  "整機",
  "筆記型電腦",
  "CPU",
  "主機板",
  "記憶體",
  "顯示卡",
  "硬碟/SSD",
  "電源供應器",
  "機殼",
  "散熱",
  "螢幕",
  "鍵盤滑鼠",
  "網通",
  "周邊配件",
  "軟體",
  "服務/工資",
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const existing = await db.query.users.findFirst();
  if (!existing) {
    const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(6).toString("base64url");
    await db.insert(schema.users).values({
      username: "admin",
      name: "老闆",
      passwordHash: await bcrypt.hash(password, 10),
      role: "OWNER",
    });
    console.log("已建立老闆帳號：admin");
    if (!process.env.SEED_ADMIN_PASSWORD) {
      console.log(`初始密碼：${password}（請登入後立即修改）`);
    }
  } else {
    console.log("已有帳號，略過建立老闆帳號");
  }

  await db
    .insert(schema.categories)
    .values(DEFAULT_CATEGORIES.map((name, i) => ({ name, sort: i })))
    .onConflictDoNothing();
  console.log("商品分類已建立");

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
