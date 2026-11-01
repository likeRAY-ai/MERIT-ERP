import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, sales } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { money, dateTimeStr, PAYMENT_LABELS } from "@/lib/format";
import { PageHeader, TableWrap, Empty } from "@/components/ui";
import PartyForm from "@/components/PartyForm";
import { saveCustomer } from "../../parties/actions";

export const metadata = { title: "客戶資料" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser();
  const id = Number((await params).id);
  const c = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  if (!c) notFound();

  const [history, [sum]] = await Promise.all([
    db.select().from(sales).where(eq(sales.customerId, id)).orderBy(desc(sales.id)).limit(50),
    db
      .select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${sales.total}),0)::int` })
      .from(sales)
      .where(eq(sales.customerId, id)),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.name}
        back="/customers"
        actions={<Link href={`/sales/new?customer=${c.id}`} className="btn-primary">＋ 為此客戶開單</Link>}
      />
      <PartyForm action={saveCustomer.bind(null, c.id)} party={c} isCustomer readOnly={s.role === "ACCOUNTANT"} />
      <section>
        <h2 className="mb-2 font-semibold">
          購買紀錄（共 {sum.count} 筆，{money(sum.total)}）
        </h2>
        <TableWrap>
          {history.length ? (
            <table className="table">
              <thead>
                <tr><th>單號</th><th>時間</th><th>付款</th><th className="text-right">金額</th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td><Link href={`/sales/${h.id}`} className="link">{h.number}</Link></td>
                    <td className="whitespace-nowrap">{dateTimeStr(h.date)}</td>
                    <td>{PAYMENT_LABELS[h.paymentMethod]}</td>
                    <td className="text-right">{money(h.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>尚無購買紀錄</Empty>
          )}
        </TableWrap>
      </section>
    </div>
  );
}
