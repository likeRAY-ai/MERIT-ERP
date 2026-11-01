"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireActionUser } from "@/lib/auth";
import { runAction, optStr, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { createSale } from "@/lib/services/inventory";

const itemsSchema = z.array(
  z.object({
    productId: z.number().int(),
    qty: z.number().int(),
    unitPrice: z.number().int(),
    serials: z.array(z.string()).default([]),
  }),
);

const PAYMENTS = ["CASH", "CARD", "TRANSFER", "CREDIT"] as const;

export async function submitSale(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = 0;
  const res = await runAction(async () => {
    const s = await requireActionUser(["OWNER", "STAFF"]);
    const parsed = itemsSchema.safeParse(JSON.parse(String(fd.get("items") || "[]")));
    if (!parsed.success) throw new AppError("商品明細格式錯誤");
    const pm = String(fd.get("paymentMethod"));
    if (!PAYMENTS.includes(pm as (typeof PAYMENTS)[number])) throw new AppError("請選擇付款方式");
    const sale = await createSale(
      db,
      {
        customerId: Number(fd.get("customerId")) || null,
        buyerTaxId: optStr(fd, "buyerTaxId"),
        paymentMethod: pm as (typeof PAYMENTS)[number],
        note: optStr(fd, "note"),
        items: parsed.data,
      },
      s.uid,
    );
    id = sale.id;
    revalidatePath("/sales");
    revalidatePath("/products");
    revalidatePath("/");
  });
  if (res?.error) return res;
  redirect(`/sales/${id}?created=1`);
}
