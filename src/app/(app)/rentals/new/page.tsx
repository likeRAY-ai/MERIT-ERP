import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, rentalAssets, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import ContractForm from "./ContractForm";

export const metadata = { title: "新增租約" };

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const s = await requireUser(["OWNER", "STAFF"]);
  const { customer } = await searchParams;
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
      <PageHeader title="新增租約" back="/rentals" />
      <ContractForm
        customers={cs}
        staff={staff}
        assets={assets}
        today={isoDate(new Date())}
        uid={s.uid}
        defaultCustomer={customer ? Number(customer) : undefined}
      />
    </div>
  );
}
