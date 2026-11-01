"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireActionUser } from "@/lib/auth";
import { runAction, optStr, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { createPurchase } from "@/lib/services/inventory";

const itemsSchema = z.array(
  z.object({
    productId: z.number().int(),
    qty: z.number().int(),
    unitCost: z.number().int(),
    serials: z.array(z.string()).default([]),
  }),
);

export async function submitPurchase(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = 0;
  const res = await runAction(async () => {
    const s = await requireActionUser(["OWNER", "STAFF"]);
    const supplierId = Number(fd.get("supplierId"));
    if (!supplierId) throw new AppError("請選擇供應商");
    const parsed = itemsSchema.safeParse(JSON.parse(String(fd.get("items") || "[]")));
    if (!parsed.success) throw new AppError("商品明細格式錯誤");
    const dateStr = optStr(fd, "date");
    const p = await createPurchase(
      db,
      {
        supplierId,
        date: dateStr ? new Date(`${dateStr}T12:00:00+08:00`) : undefined,
        note: optStr(fd, "note"),
        items: parsed.data,
      },
      s.uid,
    );
    id = p.id;
    revalidatePath("/purchases");
    revalidatePath("/products");
  });
  if (res?.error) return res;
  redirect(`/purchases/${id}?created=1`);
}
