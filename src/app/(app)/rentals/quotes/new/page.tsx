import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import QuoteForm from "../QuoteForm";
import { emptyQuoteInit, loadQuoteInit, quoteFormData } from "../load";

export const metadata = { title: "開租賃報價單" };

export default async function NewRentalQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ copy?: string; customer?: string }>;
}) {
  const s = await requireUser(["OWNER", "STAFF"]);
  const { copy, customer } = await searchParams;
  const data = await quoteFormData();
  let init = emptyQuoteInit(s.uid);
  if (copy) {
    const c = await loadQuoteInit(Number(copy), s.uid, true);
    if (!c) notFound();
    init = c;
  } else if (customer) {
    const c = data.customers.find((x) => x.id === Number(customer));
    if (c) {
      init = {
        ...init,
        customerId: c.id,
        contact: c.contact ?? "",
        phone: c.phone ?? c.mobile ?? "",
        buyerTaxId: c.taxId ?? "",
        address: c.address ?? "",
        taxType: c.taxType ?? (c.type === "COMPANY" ? "EXCLUDED" : "INCLUDED"),
      };
    }
  }
  return (
    <div className="max-w-5xl">
      <PageHeader title={copy ? "複製租賃報價單" : "開租賃報價單"} back="/rentals/quotes" />
      <QuoteForm init={init} data={data} />
    </div>
  );
}
