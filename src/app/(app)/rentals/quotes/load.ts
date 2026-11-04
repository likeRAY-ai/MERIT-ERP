import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, rentalAssets, users } from "@/db/schema";
import { addDaysTW, isoDate } from "@/lib/format";
import { loadRentalQuote } from "@/lib/services/rentalQuotes";
import type { QuoteInit } from "./QuoteForm";

// 報價單表單需要的資料：客戶、業務、可報價的設備機型
export async function quoteFormData() {
  const [cs, staff, models] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        type: customers.type,
        phone: customers.phone,
        mobile: customers.mobile,
        contact: customers.contact,
        address: customers.address,
        taxId: customers.taxId,
        code: customers.code,
        taxType: customers.taxType,
      })
      .from(customers)
      .where(eq(customers.active, true))
      .orderBy(asc(customers.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.id)),
    db
      .select({
        name: rentalAssets.name,
        monthlyRate: sql<number>`max(${rentalAssets.monthlyRate})::int`,
        dailyRate: sql<number>`max(${rentalAssets.dailyRate})::int`,
        total: sql<number>`count(*)::int`,
        available: sql<number>`count(*) filter (where ${rentalAssets.status} = 'AVAILABLE')::int`,
      })
      .from(rentalAssets)
      .where(sql`${rentalAssets.status} <> 'RETIRED'`)
      .groupBy(rentalAssets.name)
      .orderBy(asc(rentalAssets.name)),
  ]);
  return { customers: cs, staff, models };
}

export type QuoteFormData = Awaited<ReturnType<typeof quoteFormData>>;


export function emptyQuoteInit(uid: number): QuoteInit {
  const today = new Date();
  return {
    date: isoDate(today),
    validUntil: isoDate(addDaysTW(today, 14)),
    customerId: "",
    customerName: "",
    contact: "",
    phone: "",
    buyerTaxId: "",
    address: "",
    salespersonId: uid,
    mode: "MONTH",
    months: 3,
    term: "",
    plannedStart: "",
    taxType: "INCLUDED",
    deposit: "",
    note: "",
    lines: [],
  };
}

// 讀出既有報價單給表單使用；copy=true 時當作新單（日期改今天）
export async function loadQuoteInit(id: number, uid: number, copy = false): Promise<QuoteInit | null> {
  const q = await loadRentalQuote(db, id);
  if (!q) return null;
  const base = emptyQuoteInit(uid);
  return {
    ...base,
    id: copy ? undefined : q.id,
    date: copy ? base.date : isoDate(q.date),
    validUntil: copy ? base.validUntil : isoDate(q.validUntil),
    customerId: q.customerId ?? "",
    customerName: q.customerName ?? "",
    contact: q.contact ?? "",
    phone: q.phone ?? "",
    buyerTaxId: q.buyerTaxId ?? "",
    address: q.address ?? "",
    salespersonId: q.salespersonId ?? "",
    mode: q.billingType === "DAILY" ? "DAY" : q.billingMonths > 1 ? "PREPAY" : "MONTH",
    months: q.billingMonths > 1 ? q.billingMonths : 3,
    term: q.term ? String(q.term) : "",
    plannedStart: copy ? "" : isoDate(q.plannedStart),
    taxType: q.taxType,
    deposit: q.deposit ? String(q.deposit) : "",
    note: q.note ?? "",
    lines: q.items.map((it) => ({
      kind: it.kind,
      name: it.name,
      description: it.description ?? "",
      qty: it.qty,
      unitPrice: it.unitPrice,
    })),
  };
}
