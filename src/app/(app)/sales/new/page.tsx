import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import SaleForm from "./SaleForm";

export const metadata = { title: "開銷貨單" };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  await requireUser(["OWNER", "STAFF"]);
  const { customer } = await searchParams;
  const list = await db
    .select({ id: customers.id, name: customers.name, type: customers.type, taxId: customers.taxId, phone: customers.phone })
    .from(customers)
    .where(eq(customers.active, true))
    .orderBy(asc(customers.name));
  return (
    <div className="max-w-3xl">
      <PageHeader title="開銷貨單" back="/sales" />
      <SaleForm customers={list} defaultCustomer={customer ? Number(customer) : undefined} />
    </div>
  );
}
