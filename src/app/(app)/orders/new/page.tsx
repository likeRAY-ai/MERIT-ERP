import { notFound } from "next/navigation";
import { requireUser, canSeeCost } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import OrderForm from "../OrderForm";
import { emptyInit, formOptions, loadInit } from "../load";

export const metadata = { title: "開報價單" };

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ copy?: string; customer?: string }>;
}) {
  const s = await requireUser(["OWNER", "STAFF"]);
  const { copy, customer } = await searchParams;
  const opts = await formOptions();
  let init = emptyInit(s.uid);
  if (copy) {
    const c = await loadInit(Number(copy), canSeeCost(s), s.uid, true);
    if (!c) notFound();
    init = c;
  } else if (customer) {
    const c = opts.customers.find((x) => x.id === Number(customer));
    if (c) {
      init = { ...init, customerId: c.id, contact: c.contact ?? "", phone: c.phone ?? "", buyerTaxId: c.taxId ?? "" };
      if (c.type === "COMPANY") init.taxType = "EXCLUDED";
    }
  }
  return (
    <div className="max-w-5xl">
      <PageHeader title={copy ? "複製報價單" : "開報價單"} back="/orders" />
      <OrderForm init={init} customers={opts.customers} staff={opts.staff} />
    </div>
  );
}
