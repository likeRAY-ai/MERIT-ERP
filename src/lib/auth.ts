import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession, type Session } from "./session";
import { AppError } from "./errors";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const s = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  // 確認帳號仍然有效（被停用會立即登出）
  const u = await db.query.users.findFirst({ where: eq(users.id, s.uid) });
  if (!u || !u.active || u.sessionVersion !== s.sv) return null;
  return { uid: u.id, name: u.name, role: u.role, sv: u.sessionVersion };
}

// 頁面用：未登入導向登入頁；權限不足導回首頁
export async function requireUser(roles?: Session["role"][]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.role)) redirect("/");
  return s;
}

// 動作用：未登入或權限不足時丟出錯誤訊息
export async function requireActionUser(roles?: Session["role"][]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AppError("登入已逾時，請重新登入");
  if (roles && !roles.includes(s.role)) throw new AppError("沒有權限執行此操作");
  return s;
}

export async function startSession(s: Session) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

// 是否可看成本與毛利
export function canSeeCost(s: Session) {
  return s.role === "OWNER" || s.role === "ACCOUNTANT";
}
