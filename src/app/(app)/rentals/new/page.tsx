import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, rentalAssets, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isoDate } from "@/lib/format";
import { loadRentalQuote, quoteEndDate } from "@/lib/services/rentalQuotes";
import { PageHeader } from "@/components/ui";
import ContractForm, { type QuoteSeed } from "./ContractForm";

export const metadata = { title: "新增租約" };

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ customer?: string; quote?: string }> }) {
  const s = await requireUser(["OWNER", "STAFF"]);
  const { customer, quote } = await searchParams;
  let seed: QuoteSeed | undefined;
  if (quote) {
    const q = await loadRentalQuote(db, Number(quote));
    if (!q) notFound();
    if (q.status !== "QUOTE") redirect(`/rentals/quotes/${q.id}`);
    const start = q.plannedStart ?? new Date();
    seed = {
      id: q.id,
      number: q.number,
      customerId: q.customerId,
      customerName: q.customerName,
      contact: q.contact,
      phone: q.phone,
      address: q.address,
      salespersonId: q.salespersonId,
      taxType: q.taxType,
      mode: q.billingType === "DAILY" ? "DAY" : q.billingMonths > 1 ? "PREPAY" : "MONTH",
      months: q.billingMonths > 1 ? q.billingMonths : 3,
      startDate: isoDate(start),
      endDate: isoDate(quoteEndDate(start, q.billingType, q.term)),
      deposit: q.deposit,
      note: q.note,
      rent: q.items.filter((i) => i.kind === "RENT").map((i) => ({ name: i.name, qty: i.qty, rate: i.unitPrice })),
      fees: q.items.filter((i) => i.kind === "FEE").map((i) => ({ name: i.name, qty: i.qty, rate: i.unitPrice })),
    };
  }
  const [cs, staff, assets] = await Promise.all([
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
        id: rentalAssets.id,
        code: rentalAssets.code,
        name: rentalAssets.name,
        monthlyRate: rentalAssets.monthlyRate,
        dailyRate: rentalAssets.dailyRate,
      })
      .from(rentalAssets)
      .where(eq(rentalAssets.status, "AVAILABLE"))
      .orderBy(asc(rentalAssets.code)),
  ]);
  return (
    <div className="max-w-5xl">
      <PageHeader title={seed ? `由報價單 ${seed.number} 建立租約` : "新增租約"} back={seed ? `/rentals/quotes/${seed.id}` : "/rentals"} />
      <ContractForm
        customers={cs}
        staff={staff}
        assets={assets}
        today={isoDate(new Date())}
        uid={s.uid}
        defaultCustomer={seed?.customerId ?? (customer ? Number(customer) : undefined)}
        quote={seed}
      />
    </div>
  );
}
