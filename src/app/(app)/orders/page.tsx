import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { orders, customers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { money, dateStr } from "@/lib/format";
import { PageHeader, TableWrap, Empty } from "@/components/ui";
import { OrderStatusBadge } from "./StatusBadge";

export const metadata = { title: "報價／訂單" };

const TABS = [
  { key: "", label: "全部" },
  { key: "QUOTE", label: "報價中" },
  { key: "CONFIRMED", label: "待出貨" },
  { key: "COMPLETED", label: "已出貨" },
  { key: "CLOSED", label: "手動結案" },
  { key: "LOST", label: "未成交" },
] as const;

type Status = "QUOTE" | "CONFIRMED" | "COMPLETED" | "CLOSED" | "LOST";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const s = await requireUser();
  const { q, status } = await searchParams;
  const st = TABS.some((t) => t.key && t.key === status) ? (status as Status) : undefined;

  const where: SQL[] = [];
  if (q) {
    where.push(
      or(
        ilike(orders.number, `%${q}%`),
        ilike(customers.name, `%${q}%`),
        ilike(orders.customerName, `%${q}%`),
        ilike(orders.phone, `%${q}%`),
        ilike(orders.customerPo, `%${q}%`),
      )!,
    );
  }
  const whereAll = and(...where);
  if (st) where.push(eq(orders.status, st));

  const [rows, counts] = await Promise.all([
    db
      .select({
        id: orders.id,
        number: orders.number,
        date: orders.date,
        deliveryDate: orders.deliveryDate,
        total: orders.total,
        status: orders.status,
        customer: customers.name,
        customerName: orders.customerName,
        salesperson: users.name,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(users, eq(orders.salespersonId, users.id))
      .where(and(...where))
      .orderBy(desc(orders.id))
      .limit(300),
    db
      .select({ status: orders.status, count: sql<number>`count(*)::int` })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(whereAll)
      .groupBy(orders.status),
  ]);
  const countOf = (k: string) =>
    k ? (counts.find((c) => c.status === k)?.count ?? 0) : counts.reduce((a, c) => a + c.count, 0);
  const href = (k: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (k) p.set("status", k);
    const qs = p.toString();
    return qs ? `/orders?${qs}` : "/orders";
  };

  return (
    <div>
      <PageHeader
        title="報價／訂單"
        actions={s.role !== "ACCOUNTANT" && <Link href="/orders/new" className="btn-primary">＋ 開報價單</Link>}
      />
      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            className={`rounded-full px-3 py-1 text-sm ${
              (st ?? "") === t.key ? "bg-brand-700 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"
            }`}
          >
            {t.label} {countOf(t.key)}
          </Link>
        ))}
      </div>
      <form className="mb-3 flex flex-wrap gap-2">
        {st && <input type="hidden" name="status" value={st} />}
        <input name="q" defaultValue={q} placeholder="單號、客戶、電話、客戶訂單號" className="input max-w-xs flex-1" />
        <button className="btn">搜尋</button>
      </form>
      <TableWrap>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>單號</th><th className="hidden sm:table-cell">日期</th><th>客戶</th>
                <th className="hidden md:table-cell">業務</th>
                <th className="hidden sm:table-cell">交貨日</th>
                <th className="text-right">金額</th><th className="hidden sm:table-cell">狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`/orders/${r.id}`} className="link">{r.number}</Link>
                    <div className="mt-0.5 sm:hidden"><OrderStatusBadge status={r.status} /></div>
                  </td>
                  <td className="hidden whitespace-nowrap sm:table-cell">{dateStr(r.date)}</td>
                  <td>{r.customer ?? r.customerName ?? "—"}</td>
                  <td className="hidden md:table-cell">{r.salesperson ?? "—"}</td>
                  <td className="hidden whitespace-nowrap sm:table-cell">{r.deliveryDate ? dateStr(r.deliveryDate) : "—"}</td>
                  <td className="text-right whitespace-nowrap">{money(r.total)}</td>
                  <td className="hidden whitespace-nowrap sm:table-cell"><OrderStatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>沒有報價單</Empty>
        )}
      </TableWrap>
    </div>
  );
}
