"use server";

// 客戶與供應商的新增、修改
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { customers, suppliers } from "@/db/schema";
import { requireActionUser } from "@/lib/auth";
import { runAction, optStr, required, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";

function common(fd: FormData) {
  const taxId = optStr(fd, "taxId");
  if (taxId && !/^\d{8}$/.test(taxId)) throw new AppError("統一編號必須是 8 位數字");
  return {
    name: required(fd, "name", "名稱"),
    taxId,
    contact: optStr(fd, "contact"),
    phone: optStr(fd, "phone"),
    email: optStr(fd, "email"),
    address: optStr(fd, "address"),
    note: optStr(fd, "note"),
    active: fd.get("hasActive") ? fd.get("active") === "on" : true,
  };
}

export async function saveCustomer(id: number | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let newId: number | null = null;
  const res = await runAction(async () => {
    await requireActionUser(["OWNER", "STAFF"]);
    const data = { ...common(fd), type: fd.get("type") === "COMPANY" ? ("COMPANY" as const) : ("PERSONAL" as const) };
    if (id) {
      await db.update(customers).set(data).where(eq(customers.id, id));
    } else {
      [{ id: newId }] = await db.insert(customers).values(data).returning({ id: customers.id });
    }
    revalidatePath("/customers");
  });
  if (res?.error) return res;
  if (newId) redirect(`/customers/${newId}`);
  return { ok: "已儲存" };
}

export async function saveSupplier(id: number | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let newId: number | null = null;
  const res = await runAction(async () => {
    await requireActionUser(["OWNER", "STAFF"]);
    const data = common(fd);
    if (id) {
      await db.update(suppliers).set(data).where(eq(suppliers.id, id));
    } else {
      [{ id: newId }] = await db.insert(suppliers).values(data).returning({ id: suppliers.id });
    }
    revalidatePath("/suppliers");
  });
  if (res?.error) return res;
  if (newId) redirect(`/suppliers/${newId}`);
  return { ok: "已儲存" };
}
