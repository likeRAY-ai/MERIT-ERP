import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, rentalContracts, rentalQuoteItems, rentalQuotes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dateStr, money, RENTAL_QUOTE_STATUS_LABELS } from "@/lib/format";
import { PageHeader, TableWrap, Empty } from "@/components/ui";

export const metadata = { title: "租賃報價單" };

export default async function RentalQuotesPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const s = await requireUser();
  const canEdit = s.role !== "ACCOUNTANT";
  const { q, tab = "QUOTE" } = await searchParams;
  const status = (["QUOTE", "ACCEPTED", "LOST"] as const).find((x) => x === tab) ?? "QUOTE";

  const where: SQL[] = [eq(rentalQuotes.status, status)];
  if (q) {
    where.push(
      or(ilike(rentalQuotes.number, `%${q}%`), ilike(customers.name, `%${q}%`), ilike(rentalQuotes.customerName, `%${q}%`))!,
    );
  }
  const rows = await db
    .select({
      id: rentalQuotes.id,
      number: rentalQuotes.number,
      date: rentalQuotes.date,
      validUntil: rentalQuotes.validUntil,
      customer: sql<string>`coalesce(${customers.name}, ${rentalQuotes.customerName})`,
      billingType: rentalQuotes.billingType,
      term: rentalQuotes.term,
      contractId: rentalQuotes.contractId,
      contractNumber: rentalContracts.number,
      units: sql<number>`coalesce(sum(${rentalQuoteItems.qty}) filter (where ${rentalQuoteItems.kind} = 'RENT'),0)::int`,
      rent: sql<number>`coalesce(sum(${rentalQuoteItems.qty} * ${rentalQuoteItems.unitPrice}) filter (where ${rentalQuoteItems.kind} = 'RENT'),0)::int`,
    })
    .from(rentalQuotes)
    .leftJoin(customers, eq(rentalQuotes.customerId, customers.id))
    .leftJoin(rentalContracts, eq(rentalQuotes.contractId, rentalContracts.id))
    .leftJoin(rentalQuoteItems, eq(rentalQuoteItems.quoteId, rentalQuotes.id))
    .where(and(...where))
    .groupBy(rentalQuotes.id, customers.name, rentalContracts.number)
    .orderBy(desc(rentalQuotes.id))
    .limit(300);

  const counts = await db
    .select({ status: rentalQuotes.status, n: sql<number>`count(*)::int` })
    .from(rentalQuotes)
    .groupBy(rentalQuotes.status);
  const n = (k: string) => counts.find((c) => c.status === k)?.n ?? 0;
  const now = new Date();

  return (
    <div className="space-y-3">
      <PageHeader
        title="租賃報價單"
        back="/rentals"
        actions={canEdit && <Link href="/rentals/quotes/new" className="btn-primary">＋ 開租賃報價單</Link>}
      />
      <div className="flex flex-wrap gap-1">
        {(["QUOTE", "ACCEPTED", "LOST"] as const).map((k) => (
          <Link
            key={k}
            href={`/rentals/quotes?tab=${k}`}
            className={`rounded-full px-3 py-1 text-sm ${status === k ? "bg-brand-700 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}
          >
            {k === "ACCEPTED" ? "已成交" : RENTAL_QUOTE_STATUS_LABELS[k]} {n(k)}
          </Link>
        ))}
      </div>
      <form className="flex gap-2">
        <input type="hidden" name="tab" value={status} />
        <input name="q" defaultValue={q} placeholder="報價單號、客戶" className="input max-w-xs flex-1" />
        <button className="btn">搜尋</button>
      </form>
      <TableWrap>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>單號</th><th className="hidden sm:table-cell">日期</th><th>客戶</th>
                <th className="text-right">台數</th><th className="text-right">租金</th>
                <th className="hidden md:table-cell">租期</th>
                <th>{status === "ACCEPTED" ? "租約" : status === "QUOTE" ? "有效期限" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap"><Link href={`/rentals/quotes/${r.id}`} className="link">{r.number}</Link></td>
                  <td className="hidden whitespace-nowrap sm:table-cell">{dateStr(r.date)}</td>
                  <td>{r.customer}</td>
                  <td className="text-right">{r.units}</td>
                  <td className="whitespace-nowrap text-right">{money(r.rent)}{r.billingType === "DAILY" ? "／天" : "／月"}</td>
                  <td className="hidden md:table-cell">{r.term ? `${r.term} ${r.billingType === "DAILY" ? "天" : "個月"}` : "不定期"}</td>
                  <td className="whitespace-nowrap">
                    {status === "ACCEPTED" && r.contractId ? (
                      <Link href={`/rentals/${r.contractId}`} className="link">{r.contractNumber}</Link>
                    ) : status === "QUOTE" && r.validUntil ? (
                      <span className={r.validUntil < now ? "text-red-600" : ""}>{dateStr(r.validUntil)}{r.validUntil < now && " 已過期"}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>沒有{status === "ACCEPTED" ? "已成交的" : status === "LOST" ? "未成交的" : "報價中的"}租賃報價單</Empty>
        )}
      </TableWrap>
    </div>
  );
}
