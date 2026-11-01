import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { suppliers, purchases } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { money, dateTimeStr } from "@/lib/format";
import { PageHeader, TableWrap, Empty } from "@/components/ui";
import PartyForm from "@/components/PartyForm";
import { saveSupplier } from "../../parties/actions";

export const metadata = { title: "供應商資料" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser();
  const id = Number((await params).id);
  const c = await db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
  if (!c) notFound();
  const history = await db.select().from(purchases).where(eq(purchases.supplierId, id)).orderBy(desc(purchases.id)).limit(50);

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.name}
        back="/suppliers"
        actions={<Link href={`/purchases/new?supplier=${c.id}`} className="btn-primary">＋ 向此供應商進貨</Link>}
      />
      <PartyForm action={saveSupplier.bind(null, c.id)} party={c} isCustomer={false} readOnly={s.role === "ACCOUNTANT"} />
      <section>
        <h2 className="mb-2 font-semibold">進貨紀錄</h2>
        <TableWrap>
          {history.length ? (
            <table className="table">
              <thead>
                <tr><th>單號</th><th>時間</th><th className="text-right">金額</th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td><Link href={`/purchases/${h.id}`} className="link">{h.number}</Link></td>
                    <td className="whitespace-nowrap">{dateTimeStr(h.date)}</td>
                    <td className="text-right">{money(h.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>尚無進貨紀錄</Empty>
          )}
        </TableWrap>
      </section>
    </div>
  );
}
