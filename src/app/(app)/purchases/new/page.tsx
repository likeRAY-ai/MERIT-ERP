import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ymd } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import PurchaseForm from "./PurchaseForm";

export const metadata = { title: "新增進貨" };

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
  await requireUser(["OWNER", "STAFF"]);
  const { supplier } = await searchParams;
  const list = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.name));
  const d = ymd();
  return (
    <div className="max-w-3xl">
      <PageHeader title="新增進貨" back="/purchases" />
      <PurchaseForm
        suppliers={list}
        defaultSupplier={supplier ? Number(supplier) : undefined}
        today={`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`}
      />
    </div>
  );
}
