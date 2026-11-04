import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { loadRentalQuote } from "@/lib/services/rentalQuotes";
import { PageHeader } from "@/components/ui";
import QuoteForm from "../../QuoteForm";
import { loadQuoteInit, quoteFormData } from "../../load";

export const metadata = { title: "修改租賃報價單" };

export default async function EditRentalQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser(["OWNER", "STAFF"]);
  const id = Number((await params).id);
  const q = await loadRentalQuote(db, id);
  if (!q) notFound();
  if (q.status !== "QUOTE") redirect(`/rentals/quotes/${id}`);
  const [init, data] = await Promise.all([loadQuoteInit(id, s.uid), quoteFormData()]);
  return (
    <div className="max-w-5xl">
      <PageHeader title={`修改 ${q.number}`} back={`/rentals/quotes/${id}`} />
      <QuoteForm init={init!} data={data} />
    </div>
  );
}
