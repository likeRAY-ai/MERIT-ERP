// 登入失敗限制：同一帳號 15 分鐘內錯 5 次、同一 IP 錯 20 次，暫停登入 15 分鐘
import { eq, inArray, lt } from "drizzle-orm";
import type { DB } from "@/db";
import { loginThrottle } from "@/db/schema";

export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;
const LIMITS = { u: 5, ip: 20 } as const;

export function throttleKeys(username: string, ip: string | null) {
  const keys = [`u:${username}`];
  if (ip) keys.push(`ip:${ip}`);
  return keys;
}

const limitOf = (key: string) => (key.startsWith("ip:") ? LIMITS.ip : LIMITS.u);

// 回傳仍在鎖定中的剩餘分鐘數；沒有鎖定回傳 0
export async function lockedMinutes(db: DB, keys: string[], now = new Date()) {
  const rows = await db.select().from(loginThrottle).where(inArray(loginThrottle.key, keys));
  let until = 0;
  for (const r of rows) if (r.lockedUntil && r.lockedUntil > now) until = Math.max(until, r.lockedUntil.getTime());
  return until ? Math.ceil((until - now.getTime()) / 60000) : 0;
}

export async function recordFailure(db: DB, keys: string[], now = new Date()) {
  for (const key of keys) {
    await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(loginThrottle).where(eq(loginThrottle.key, key)).for("update");
      const fresh = !cur || now.getTime() - cur.windowStart.getTime() > WINDOW_MS;
      const failures = fresh ? 1 : cur.failures + 1;
      const lockedUntil = failures >= limitOf(key) ? new Date(now.getTime() + LOCK_MS) : (cur?.lockedUntil ?? null);
      const values = { failures, windowStart: fresh ? now : cur.windowStart, lockedUntil };
      if (cur) await tx.update(loginThrottle).set(values).where(eq(loginThrottle.key, key));
      else await tx.insert(loginThrottle).values({ key, ...values }).onConflictDoNothing();
    });
  }
  // 順便清掉很久以前的紀錄
  await db.delete(loginThrottle).where(lt(loginThrottle.windowStart, new Date(now.getTime() - 24 * 3600 * 1000)));
}

// 登入成功：只清除帳號的失敗次數（IP 的不清，避免猜到一個帳號後繼續猜別的）
export async function clearFailures(db: DB, username: string) {
  await db.delete(loginThrottle).where(eq(loginThrottle.key, `u:${username}`));
}
