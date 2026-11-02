"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireActionUser } from "@/lib/auth";
import { runAction, optStr, int, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { createSale, updateSaleInfo, voidSale } from "@/lib/services/inventory";

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
        salespersonId: Number(fd.get("salespersonId")) || null,
        contact: optStr(fd, "contact"),
        deliveryMethod: optStr(fd, "deliveryMethod"),
        deliveryAddress: optStr(fd, "deliveryAddress"),
        invoiceNo: optStr(fd, "invoiceNo"),
        discount: int(fd, "discount", "折扣金額"),
        paidAmount: optStr(fd, "paidAmount") === null ? null : int(fd, "paidAmount", "已收金額"),
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

export async function voidSaleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = Number(fd.get("id"));
  return runAction(async () => {
    const s = await requireActionUser(["OWNER"]);
    await voidSale(db, id, String(fd.get("reason") ?? ""), s.uid);
    revalidatePath("/sales");
    revalidatePath(`/sales/${id}`);
    revalidatePath("/products");
    revalidatePath("/orders");
    revalidatePath("/");
    return "已作廢，庫存與序號已還原";
  });
}

export async function updateSaleInfoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = Number(fd.get("id"));
  return runAction(async () => {
    await requireActionUser(["OWNER", "STAFF"]);
    await updateSaleInfo(db, id, { invoiceNo: optStr(fd, "invoiceNo"), paidAmount: int(fd, "paidAmount", "已收金額") });
    revalidatePath(`/sales/${id}`);
    revalidatePath("/sales");
    return "已更新";
  });
}
