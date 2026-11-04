import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { ymd } from "@/lib/format";

// 產生單號：前綴 + 台灣日期 + 當日流水號，例如 S20261101-001
// 使用 advisory lock 避免兩人同時開單拿到同一號碼
export async function nextNumber(
  tx: Tx,
  prefix: "P" | "S" | "Q" | "R" | "RQ",
  table: "purchases" | "sales" | "orders" | "rental_contracts" | "rental_quotes",
  date: Date,
): Promise<string> {
  const base = `${prefix}${ymd(date)}-`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${base}))`);
  const res = await tx.execute<{ max: string | null }>(
    sql`select max(number) as max from ${sql.identifier(table)} where number like ${base + "%"}`,
  );
  const max = res.rows[0]?.max;
  const seq = max ? parseInt(max.slice(base.length), 10) + 1 : 1;
  return base + String(seq).padStart(3, "0");
}
