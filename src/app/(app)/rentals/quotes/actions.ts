"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireActionUser } from "@/lib/auth";
import { runAction, optStr, int, str, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { parseDateInput } from "@/lib/format";
import { saveRentalQuote, setRentalQuoteStatus } from "@/lib/services/rentalQuotes";

const itemsSchema = z.array(
  z.object({
    kind: z.enum(["RENT", "FEE"]),
    name: z.string(),
    description: z.string().nullish(),
    qty: z.number().int(),
    unitPrice: z.number().int(),
  }),
);

export async function submitRentalQuote(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = Number(fd.get("id")) || 0;
  const res = await runAction(async () => {
    const s = await requireActionUser(["OWNER", "STAFF"]);
    const items = itemsSchema.safeParse(JSON.parse(String(fd.get("items") || "[]")));
    if (!items.success) throw new AppError("明細格式錯誤");
    const daily = str(fd, "billingType") === "DAILY";
    id = await saveRentalQuote(
      db,
      {
        date: parseDateInput(optStr(fd, "date")) ?? undefined,
        validUntil: parseDateInput(optStr(fd, "validUntil")),
        customerId: Number(fd.get("customerId")) || null,
        customerName: optStr(fd, "customerName"),
        contact: optStr(fd, "contact"),
        phone: optStr(fd, "phone"),
        buyerTaxId: optStr(fd, "buyerTaxId"),
        address: optStr(fd, "address"),
        salespersonId: Number(fd.get("salespersonId")) || null,
        billingType: daily ? "DAILY" : "MONTHLY",
        billingMonths: int(fd, "billingMonths", "每次收款月數", { min: 1 }) || 1,
        term: int(fd, "term", daily ? "租用天數" : "租期") || null,
        plannedStart: parseDateInput(optStr(fd, "plannedStart")),
        taxType: str(fd, "taxType") === "EXCLUDED" ? "EXCLUDED" : "INCLUDED",
        deposit: int(fd, "deposit", "押金"),
        note: optStr(fd, "note"),
        items: items.data,
      },
      s.uid,
      id || undefined,
    );
    revalidatePath("/rentals/quotes");
  });
  if (res?.error) return res;
  redirect(`/rentals/quotes/${id}?saved=1`);
}

export async function rentalQuoteStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireActionUser(["OWNER", "STAFF"]);
    const id = Number(fd.get("id"));
    const op = str(fd, "op");
    if (op !== "lose" && op !== "reopen") throw new AppError("未知的操作");
    await setRentalQuoteStatus(db, id, op);
    revalidatePath("/rentals/quotes");
    revalidatePath(`/rentals/quotes/${id}`);
    return op === "lose" ? "已標記為未成交" : "已重新開啟";
  });
}
