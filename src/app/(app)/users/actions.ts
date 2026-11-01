"use server";

import { and, eq, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireActionUser } from "@/lib/auth";
import { runAction, str, required, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";

const ROLES = ["OWNER", "STAFF", "ACCOUNTANT"] as const;
type R = (typeof ROLES)[number];

function checkPassword(pw: string) {
  if (pw.length < 8) throw new AppError("密碼至少 8 個字元");
}

export async function createUser(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireActionUser(["OWNER"]);
    const username = required(fd, "username", "帳號").toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new AppError("帳號只能使用英文小寫、數字、. _ -，3～30 字");
    const pw = String(fd.get("password") ?? "");
    checkPassword(pw);
    const role = str(fd, "role") as R;
    if (!ROLES.includes(role)) throw new AppError("請選擇角色");
    const exists = await db.query.users.findFirst({ where: eq(users.username, username) });
    if (exists) throw new AppError("此帳號已存在");
    await db.insert(users).values({
      username,
      name: required(fd, "name", "姓名"),
      role,
      passwordHash: await bcrypt.hash(pw, 10),
    });
    revalidatePath("/users");
    return `已建立帳號 ${username}`;
  });
}

export async function updateUser(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const me = await requireActionUser(["OWNER"]);
    const role = str(fd, "role") as R;
    if (!ROLES.includes(role)) throw new AppError("請選擇角色");
    const active = fd.get("active") === "on";
    if (id === me.uid && (role !== "OWNER" || !active)) {
      throw new AppError("不能停用自己或移除自己的老闆權限");
    }
    if (role !== "OWNER" || !active) {
      const otherOwner = await db.query.users.findFirst({
        where: and(eq(users.role, "OWNER"), eq(users.active, true), ne(users.id, id)),
      });
      if (!otherOwner) throw new AppError("系統至少要保留一個啟用中的老闆帳號");
    }
    const data: Partial<typeof users.$inferInsert> = { name: required(fd, "name", "姓名"), role, active };
    const pw = String(fd.get("password") ?? "");
    if (pw) {
      checkPassword(pw);
      data.passwordHash = await bcrypt.hash(pw, 10);
    }
    await db.update(users).set(data).where(eq(users.id, id));
    revalidatePath("/users");
    return pw ? "已儲存並重設密碼" : "已儲存";
  });
}

export async function changeMyPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const me = await requireActionUser();
    const u = await db.query.users.findFirst({ where: eq(users.id, me.uid) });
    if (!u || !(await bcrypt.compare(String(fd.get("current") ?? ""), u.passwordHash))) {
      throw new AppError("目前密碼不正確");
    }
    const pw = String(fd.get("password") ?? "");
    checkPassword(pw);
    if (pw !== String(fd.get("confirm") ?? "")) throw new AppError("兩次輸入的新密碼不一致");
    await db.update(users).set({ passwordHash: await bcrypt.hash(pw, 10) }).where(eq(users.id, me.uid));
    return "密碼已更新";
  });
}
