import Link from "next/link";
import { and, desc, gte, lte, sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, sales, customers } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { money, dateTimeStr, startOfTaipeiDay, ymd } from "@/lib/format";
import { TableWrap, Empty } from "@/components/ui";

async function salesSummary(from: Date) {
  const [r] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${sales.total}),0)::int`,
      cost: sql<number>`coalesce(sum(${sales.costTotal}),0)::int`,
    })
    .from(sales)
    .where(gte(sales.date, from));
  return r;
}

export default async function Dashboard() {
  const s = await requireUser();
  const showCost = canSeeCost(s);
  const today = startOfTaipeiDay();
  const d = ymd();
  const monthStart = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-01T00:00:00+08:00`);

  const [todaySum, monthSum, lowStock, recent] = await Promise.all([
    salesSummary(today),
    salesSummary(monthStart),
    db
      .select({ id: products.id, name: products.name, stockQty: products.stockQty, safetyStock: products.safetyStock })
      .from(products)
      .where(and(eq(products.active, true), sql`${products.safetyStock} > 0`, lte(products.stockQty, products.safetyStock)))
      .orderBy(products.stockQty)
      .limit(10),
    db
      .select({ id: sales.id, number: sales.number, date: sales.date, total: sales.total, customer: customers.name })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .orderBy(desc(sales.id))
      .limit(8),
  ]);

  const cards = [
    { label: "今日銷售", value: money(todaySum.total), sub: `${todaySum.count} 筆` },
    ...(showCost ? [{ label: "今日毛利", value: money(todaySum.total - todaySum.cost), sub: "" }] : []),
    { label: "本月銷售", value: money(monthSum.total), sub: `${monthSum.count} 筆` },
    ...(showCost ? [{ label: "本月毛利", value: money(monthSum.total - monthSum.cost), sub: "" }] : []),
  ];

  return (
    <div className="space-y-4">
      <h1 className="page-title">你好，{s.name}</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div className="text-sm text-gray-500">{c.label}</div>
            <div className="mt-1 text-2xl font-bold">{c.value}</div>
            {c.sub && <div className="text-xs text-gray-500">{c.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/sales/new" className="btn-primary py-3">＋ 開銷貨單</Link>
        <Link href="/purchases/new" className="btn py-3">＋ 進貨</Link>
        <Link href="/products/new" className="btn py-3">＋ 新增商品</Link>
        <Link href="/serials" className="btn py-3">🔎 序號查詢</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">最近銷貨</h2>
          <TableWrap>
            {recent.length ? (
              <table className="table">
                <thead>
                  <tr><th>單號</th><th>時間</th><th>客戶</th><th className="text-right">金額</th></tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td><Link className="link" href={`/sales/${r.id}`}>{r.number}</Link></td>
                      <td className="whitespace-nowrap">{dateTimeStr(r.date)}</td>
                      <td>{r.customer ?? "散客"}</td>
                      <td className="text-right">{money(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>還沒有銷貨紀錄</Empty>
            )}
          </TableWrap>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">低庫存提醒</h2>
          <TableWrap>
            {lowStock.length ? (
              <table className="table">
                <thead>
                  <tr><th>商品</th><th className="text-right">庫存</th><th className="text-right">安全庫存</th></tr>
                </thead>
                <tbody>
                  {lowStock.map((p) => (
                    <tr key={p.id}>
                      <td><Link className="link" href={`/products/${p.id}`}>{p.name}</Link></td>
                      <td className="text-right font-semibold text-red-600">{p.stockQty}</td>
                      <td className="text-right">{p.safetyStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>目前沒有低於安全庫存的商品</Empty>
            )}
          </TableWrap>
        </section>
      </div>
    </div>
  );
}
