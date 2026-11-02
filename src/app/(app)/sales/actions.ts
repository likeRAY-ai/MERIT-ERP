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
    orderItemId: z.number().int().nullish(),
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
        taxType: String(fd.get("taxType")) === "EXCLUDED" ? "EXCLUDED" : "INCLUDED",
        orderId: Number(fd.get("orderId")) || null,
        note: optStr(fd, "note"),
        items: parsed.data,
      },
      s.uid,
    );
    id = sale.id;
    revalidatePath("/sales");
    revalidatePath("/orders");
    revalidatePath("/products");
    revalidatePath("/");
  });
  if (res?.error) return res;
  redirect(`/sales/${id}?created=1`);
}
