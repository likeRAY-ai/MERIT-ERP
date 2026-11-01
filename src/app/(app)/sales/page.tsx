import Link from "next/link";
import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { sales, customers } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { money, dateTimeStr, PAYMENT_LABELS } from "@/lib/format";
import { PageHeader, TableWrap, Empty } from "@/components/ui";

export const metadata = { title: "銷貨" };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string }>;
}) {
  const s = await requireUser();
  const showCost = canSeeCost(s);
  const { q, from, to } = await searchParams;

  const where: SQL[] = [];
  if (q) where.push(or(ilike(sales.number, `%${q}%`), ilike(customers.name, `%${q}%`), ilike(sales.buyerTaxId, `%${q}%`))!);
  if (from) where.push(gte(sales.date, new Date(`${from}T00:00:00+08:00`)));
  if (to) where.push(lt(sales.date, new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400_000)));

  const [rows, [sum]] = await Promise.all([
    db
      .select({
        id: sales.id,
        number: sales.number,
        date: sales.date,
        total: sales.total,
        costTotal: sales.costTotal,
        paymentMethod: sales.paymentMethod,
        customer: customers.name,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(and(...where))
      .orderBy(desc(sales.id))
      .limit(300),
    db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${sales.total}),0)::int`,
        cost: sql<number>`coalesce(sum(${sales.costTotal}),0)::int`,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(and(...where)),
  ]);

  return (
    <div>
      <PageHeader title="銷貨" actions={<Link href="/sales/new" className="btn-primary">＋ 開銷貨單</Link>} />
      <form className="mb-3 flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={q} placeholder="單號、客戶、統編" className="input max-w-xs flex-1" />
        <label className="text-xs text-gray-600">從<input type="date" name="from" defaultValue={from} className="input" /></label>
        <label className="text-xs text-gray-600">到<input type="date" name="to" defaultValue={to} className="input" /></label>
        <button className="btn">查詢</button>
      </form>
      <div className="mb-3 text-sm text-gray-600">
        共 {sum.count} 筆，金額 {money(sum.total)}
        {showCost && `，毛利 ${money(sum.total - sum.cost)}`}
      </div>
      <TableWrap>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>單號</th><th>時間</th><th>客戶</th><th className="hidden sm:table-cell">付款</th>
                <th className="text-right">金額</th>
                {showCost && <th className="hidden text-right md:table-cell">毛利</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/sales/${r.id}`} className="link">{r.number}</Link></td>
                  <td className="whitespace-nowrap">{dateTimeStr(r.date)}</td>
                  <td>{r.customer ?? "散客"}</td>
                  <td className="hidden sm:table-cell">{PAYMENT_LABELS[r.paymentMethod]}</td>
                  <td className="text-right">{money(r.total)}</td>
                  {showCost && <td className="hidden text-right md:table-cell">{money(r.total - r.costTotal)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>沒有銷貨紀錄</Empty>
        )}
      </TableWrap>
    </div>
  );
}
