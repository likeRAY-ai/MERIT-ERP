// 租賃報價單：報價給客戶，客戶確認後轉成租約
import { asc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { customers, rentalQuoteItems, rentalQuotes } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { TaxType } from "@/lib/format";
import type { QuoteLine } from "./rentalQuotesCalc";
export { quoteTotals, quoteEndDate, type QuoteLine } from "./rentalQuotesCalc";
import { nextNumber } from "./numbering";

export type RentalQuoteInput = {
  date?: Date;
  validUntil?: Date | null;
  customerId?: number | null;
  customerName?: string | null;
  contact?: string | null;
  phone?: string | null;
  buyerTaxId?: string | null;
  address?: string | null;
  salespersonId?: number | null;
  billingType: "MONTHLY" | "DAILY";
  billingMonths: number;
  term?: number | null;
  plannedStart?: Date | null;
  taxType: TaxType;
  deposit: number;
  note?: string | null;
  items: QuoteLine[];
};

function validate(input: RentalQuoteInput) {
  if (!input.customerId && !input.customerName?.trim()) throw new AppError("請選擇客戶或輸入客戶名稱");
  const items = input.items.filter((i) => i.name.trim());
  if (!items.some((i) => i.kind === "RENT")) throw new AppError("請至少輸入一項租賃設備");
  for (const it of items) {
    if (!Number.isInteger(it.qty) || it.qty < 1) throw new AppError(`「${it.name}」數量必須是 1 以上的整數`);
    if (!Number.isInteger(it.unitPrice) || it.unitPrice < 0) throw new AppError(`「${it.name}」金額必須是 0 以上的整數`);
  }
  if (!Number.isInteger(input.deposit) || input.deposit < 0) throw new AppError("押金必須是 0 以上的整數");
  if (input.billingType === "MONTHLY" && (input.billingMonths < 1 || input.billingMonths > 36)) {
    throw new AppError("每次收款月數必須是 1～36");
  }
  if (input.term != null && (!Number.isInteger(input.term) || input.term < 1 || input.term > 3650)) {
    throw new AppError("租期必須是 1 以上的整數");
  }
  if (input.billingType === "DAILY" && !input.term) throw new AppError("短期按天計請填寫租用天數");
  const tax = input.buyerTaxId?.trim();
  if (tax && !/^\d{8}$/.test(tax)) throw new AppError("統一編號必須是 8 碼數字");
  return items;
}

export async function saveRentalQuote(db: DB, input: RentalQuoteInput, userId: number, id?: number) {
  const items = validate(input);
  return db.transaction(async (tx) => {
    let customerName = input.customerName?.trim() || null;
    if (input.customerId) {
      const c = await tx.query.customers.findFirst({ where: eq(customers.id, input.customerId) });
      if (!c) throw new AppError("找不到客戶");
      customerName = null;
    }
    const values = {
      date: input.date ?? new Date(),
      validUntil: input.validUntil ?? null,
      customerId: input.customerId || null,
      customerName,
      contact: input.contact?.trim() || null,
      phone: input.phone?.trim() || null,
      buyerTaxId: input.buyerTaxId?.trim() || null,
      address: input.address?.trim() || null,
      salespersonId: input.salespersonId || null,
      billingType: input.billingType,
      billingMonths: input.billingType === "MONTHLY" ? input.billingMonths : 1,
      term: input.term || null,
      plannedStart: input.plannedStart ?? null,
      taxType: input.taxType,
      deposit: input.deposit,
      note: input.note?.trim() || null,
      updatedAt: new Date(),
    };
    let qid: number;
    if (id) {
      const [cur] = await tx.select().from(rentalQuotes).where(eq(rentalQuotes.id, id)).for("update");
      if (!cur) throw new AppError("找不到報價單");
      if (cur.status !== "QUOTE") throw new AppError("只有報價中的單據可以修改");
      await tx.update(rentalQuotes).set(values).where(eq(rentalQuotes.id, id));
      await tx.delete(rentalQuoteItems).where(eq(rentalQuoteItems.quoteId, id));
      qid = id;
    } else {
      const number = await nextNumber(tx, "RQ", "rental_quotes", new Date());
      const [q] = await tx.insert(rentalQuotes).values({ ...values, number, createdById: userId }).returning();
      qid = q.id;
    }
    await tx.insert(rentalQuoteItems).values(
      items.map((it, i) => ({
        quoteId: qid,
        kind: it.kind,
        name: it.name.trim(),
        description: it.description?.trim() || null,
        qty: it.qty,
        unitPrice: it.unitPrice,
        sort: i,
      })),
    );
    return qid;
  });
}

export async function setRentalQuoteStatus(db: DB, id: number, op: "lose" | "reopen") {
  const [q] = await db.select().from(rentalQuotes).where(eq(rentalQuotes.id, id));
  if (!q) throw new AppError("找不到報價單");
  if (op === "lose") {
    if (q.status !== "QUOTE") throw new AppError("只有報價中的單據可以標記未成交");
    await db.update(rentalQuotes).set({ status: "LOST", updatedAt: new Date() }).where(eq(rentalQuotes.id, id));
  } else {
    if (q.status !== "LOST") throw new AppError("只有未成交的單據可以重新開啟");
    await db.update(rentalQuotes).set({ status: "QUOTE", updatedAt: new Date() }).where(eq(rentalQuotes.id, id));
  }
}

export async function loadRentalQuote(db: DB, id: number) {
  return db.query.rentalQuotes.findFirst({
    where: eq(rentalQuotes.id, id),
    with: {
      customer: true,
      salesperson: true,
      createdBy: true,
      contract: true,
      items: { orderBy: [asc(rentalQuoteItems.sort), asc(rentalQuoteItems.id)] },
    },
  });
}
