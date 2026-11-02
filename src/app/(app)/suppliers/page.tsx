import Link from "next/link";
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader, SearchBar, TableWrap, Empty } from "@/components/ui";

export const metadata = { title: "供應商" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const where: SQL[] = [eq(suppliers.active, true)];
  if (q) {
    const like = `%${q}%`;
    where.push(or(ilike(suppliers.name, like), ilike(suppliers.phone, like), ilike(suppliers.mobile, like), ilike(suppliers.taxId, like), ilike(suppliers.code, like))!);
  }
  const rows = await db.select().from(suppliers).where(and(...where)).orderBy(asc(suppliers.name)).limit(300);

  return (
    <div>
      <PageHeader title="供應商" actions={<Link href="/suppliers/new" className="btn-primary">＋ 新增供應商</Link>} />
      <SearchBar q={q} placeholder="名稱、電話、統編、廠商編號" />
      <TableWrap>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr><th>名稱</th><th>電話</th><th className="hidden sm:table-cell">聯絡人</th><th className="hidden sm:table-cell">統編</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/suppliers/${c.id}`} className="link">{c.name}</Link></td>
                  <td className="whitespace-nowrap">{c.phone ?? c.mobile}</td>
                  <td className="hidden sm:table-cell">{c.contact}</td>
                  <td className="hidden sm:table-cell">{c.taxId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>沒有符合的供應商</Empty>
        )}
      </TableWrap>
    </div>
  );
}
