"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireActionUser } from "@/lib/auth";
import { runAction, optStr, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { parseDateInput } from "@/lib/format";
import { saveOrder, setOrderStatus, type OrderOp } from "@/lib/services/orders";

const itemsSchema = z.array(
  z.object({
    productId: z.number().int(),
    qty: z.number().int(),
    unitPrice: z.number().int(),
    description: z.string().nullish(),
  }),
);

export async function submitOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = Number(fd.get("id")) || 0;
  const res = await runAction(async () => {
    const s = await requireActionUser(["OWNER", "STAFF"]);
    const parsed = itemsSchema.safeParse(JSON.parse(String(fd.get("items") || "[]")));
    if (!parsed.success) throw new AppError("商品明細格式錯誤");
    const taxType = String(fd.get("taxType")) === "EXCLUDED" ? "EXCLUDED" : "INCLUDED";
    const r = await saveOrder(
      db,
      {
        date: parseDateInput(optStr(fd, "date")) ?? undefined,
        validUntil: parseDateInput(optStr(fd, "validUntil")),
        deliveryDate: parseDateInput(optStr(fd, "deliveryDate")),
        customerId: Number(fd.get("customerId")) || null,
        customerName: optStr(fd, "customerName"),
        contact: optStr(fd, "contact"),
        phone: optStr(fd, "phone"),
        buyerTaxId: optStr(fd, "buyerTaxId"),
        salespersonId: Number(fd.get("salespersonId")) || null,
        customerPo: optStr(fd, "customerPo"),
        paymentTerms: optStr(fd, "paymentTerms"),
        taxType,
        note: optStr(fd, "note"),
        confirm: fd.get("confirm") === "1",
        items: parsed.data,
      },
      s.uid,
      id || undefined,
    );
    id = r.id;
    revalidatePath("/orders");
  });
  if (res?.error) return res;
  redirect(`/orders/${id}?saved=1`);
}

const OPS: OrderOp[] = ["confirm", "unconfirm", "lose", "close", "reopen"];
const OP_MSG: Record<OrderOp, string> = {
  confirm: "已成交，這張報價單現在是訂單",
  unconfirm: "已取消成交，回到報價中",
  lose: "已標記為未成交",
  close: "已手動結案",
  reopen: "已重新開啟",
};

export async function changeOrderStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireActionUser(["OWNER", "STAFF"]);
    const op = String(fd.get("op")) as OrderOp;
    if (!OPS.includes(op)) throw new AppError("不支援的操作");
    const id = Number(fd.get("id"));
    await setOrderStatus(db, id, op);
    revalidatePath("/orders");
    revalidatePath(`/orders/${id}`);
    return OP_MSG[op];
  });
}
