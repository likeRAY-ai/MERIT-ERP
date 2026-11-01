"use server";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { startSession, endSession } from "@/lib/auth";
import { runAction, str, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const username = str(fd, "username").toLowerCase();
    const password = String(fd.get("password") ?? "");
    const u = await db.query.users.findFirst({ where: eq(users.username, username) });
    if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash))) {
      throw new AppError("帳號或密碼錯誤");
    }
    await startSession({ uid: u.id, name: u.name, role: u.role });
  });
  if (res?.error) return res;
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
