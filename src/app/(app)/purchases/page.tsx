import Link from "next/link";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { purchases, suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { money, dateStr } from "@/lib/format";
import { PageHeader, SearchBar, TableWrap, Empty } from "@/components/ui";

export const metadata = { title: "進貨" };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const rows = await db
    .select({ id: purchases.id, number: purchases.number, date: purchases.date, total: purchases.total, supplier: suppliers.name, note: purchases.note })
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(q ? or(ilike(purchases.number, `%${q}%`), ilike(suppliers.name, `%${q}%`), ilike(purchases.note, `%${q}%`)) : undefined)
    .orderBy(desc(purchases.id))
    .limit(200);

  return (
    <div>
      <PageHeader title="進貨" actions={<Link href="/purchases/new" className="btn-primary">＋ 新增進貨</Link>} />
      <SearchBar q={q} placeholder="單號、供應商、備註" />
      <TableWrap>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr><th>單號</th><th>日期</th><th>供應商</th><th className="text-right">金額</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/purchases/${r.id}`} className="link">{r.number}</Link></td>
                  <td className="whitespace-nowrap">{dateStr(r.date)}</td>
                  <td>{r.supplier}</td>
                  <td className="text-right">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>還沒有進貨紀錄</Empty>
        )}
      </TableWrap>
    </div>
  );
}
