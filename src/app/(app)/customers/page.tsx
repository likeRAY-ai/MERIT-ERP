import Link from "next/link";
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader, SearchBar, TableWrap, Empty } from "@/components/ui";

export const metadata = { title: "客戶" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const where: SQL[] = [eq(customers.active, true)];
  if (q) {
    const like = `%${q}%`;
    where.push(or(ilike(customers.name, like), ilike(customers.phone, like), ilike(customers.taxId, like), ilike(customers.contact, like))!);
  }
  const rows = await db.select().from(customers).where(and(...where)).orderBy(asc(customers.name)).limit(300);

  return (
    <div>
      <PageHeader title="客戶" actions={<Link href="/customers/new" className="btn-primary">＋ 新增客戶</Link>} />
      <SearchBar q={q} placeholder="名稱、電話、統編、聯絡人" />
      <TableWrap>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr><th>名稱</th><th>類型</th><th>電話</th><th className="hidden sm:table-cell">統編</th><th className="hidden md:table-cell">聯絡人</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/customers/${c.id}`} className="link">{c.name}</Link></td>
                  <td>{c.type === "COMPANY" ? "公司" : "個人"}</td>
                  <td className="whitespace-nowrap">{c.phone}</td>
                  <td className="hidden sm:table-cell">{c.taxId}</td>
                  <td className="hidden md:table-cell">{c.contact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>沒有符合的客戶</Empty>
        )}
      </TableWrap>
    </div>
  );
}
