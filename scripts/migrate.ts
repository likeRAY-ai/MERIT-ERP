// 執行資料庫遷移：npm run db:migrate
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("資料庫已更新到最新版本");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
