"use server";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { startSession, endSession } from "@/lib/auth";
import { runAction, str, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { clearFailures, lockedMinutes, recordFailure, throttleKeys } from "@/lib/services/loginThrottle";

// 帳號不存在時也比對一次，讓回應時間一致，避免從時間差猜出哪些帳號存在
const DUMMY_HASH = bcrypt.hashSync("merit-erp-dummy-password", 10);

async function clientIp() {
  const h = await headers();
  // Vercel 會設定 x-real-ip / x-forwarded-for（第一個是使用者的 IP）
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || null;
}

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const username = str(fd, "username").toLowerCase().slice(0, 50);
    const password = String(fd.get("password") ?? "").slice(0, 200);
    const keys = throttleKeys(username, await clientIp());
    const wait = await lockedMinutes(db, keys);
    if (wait) throw new AppError(`登入失敗次數過多，請 ${wait} 分鐘後再試`);

    const u = await db.query.users.findFirst({ where: eq(users.username, username) });
    const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
    if (!u || !u.active || !ok) {
      await recordFailure(db, keys);
      throw new AppError("帳號或密碼錯誤");
    }
    await clearFailures(db, username);
    await startSession({ uid: u.id, name: u.name, role: u.role, sv: u.sessionVersion });
  });
  if (res?.error) return res;
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
