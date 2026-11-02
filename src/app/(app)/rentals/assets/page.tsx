import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, rentalAssets, rentalContracts, rentalItems } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { money, ASSET_STATUS_LABELS } from "@/lib/format";
import { PageHeader, TableWrap, Empty } from "@/components/ui";
import { AssetForm, AssetFromStockForm } from "../AssetForms";

export const metadata = { title: "出租設備" };

const TABS = [
  { key: "", label: "全部" },
  { key: "AVAILABLE", label: "可出租" },
  { key: "RENTED", label: "出租中" },
  { key: "MAINTENANCE", label: "維修中" },
  { key: "RETIRED", label: "停用" },
] as const;

type St = "AVAILABLE" | "RENTED" | "MAINTENANCE" | "RETIRED";

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; add?: string }> }) {
  const s = await requireUser();
  const showCost = canSeeCost(s);
  const { q, status, add } = await searchParams;
  const st = TABS.some((t) => t.key && t.key === status) ? (status as St) : undefined;
  const where: SQL[] = [];
  if (q) where.push(or(ilike(rentalAssets.code, `%${q}%`), ilike(rentalAssets.name, `%${q}%`))!);
  if (st) where.push(eq(rentalAssets.status, st));

  const [rows, counts] = await Promise.all([
    db
      .select({
        id: rentalAssets.id,
        code: rentalAssets.code,
        name: rentalAssets.name,
        status: rentalAssets.status,
        monthlyRate: rentalAssets.monthlyRate,
        dailyRate: rentalAssets.dailyRate,
        cost: rentalAssets.cost,
        contractId: rentalContracts.id,
        contractNo: rentalContracts.number,
        customer: customers.name,
      })
      .from(rentalAssets)
      .leftJoin(
        rentalItems,
        and(eq(rentalItems.assetId, rentalAssets.id), sql`${rentalItems.returnedAt} is null`),
      )
      .leftJoin(rentalContracts, and(eq(rentalItems.contractId, rentalContracts.id), eq(rentalContracts.status, "ACTIVE")))
      .leftJoin(customers, eq(rentalContracts.customerId, customers.id))
      .where(and(...where))
      .orderBy(asc(rentalAssets.code))
      .limit(500),
    db.select({ status: rentalAssets.status, count: sql<number>`count(*)::int` }).from(rentalAssets).groupBy(rentalAssets.status),
  ]);
  const countOf = (k: string) => (k ? (counts.find((c) => c.status === k)?.count ?? 0) : counts.reduce((a, c) => a + c.count, 0));
  const canEdit = s.role !== "ACCOUNTANT";

  return (
    <div className="space-y-4">
      <PageHeader
        title="出租設備"
        back="/rentals"
        actions={canEdit && !add && <Link href="/rentals/assets?add=1" className="btn-primary">＋ 新增設備</Link>}
      />
      {canEdit && add && (
        <div className="grid gap-4">
          <AssetForm showCost={showCost} />
          <AssetFromStockForm />
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key ? `/rentals/assets?status=${t.key}` : "/rentals/assets"}
            className={`rounded-full px-3 py-1 text-sm ${(st ?? "") === t.key ? "bg-brand-700 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}
          >
            {t.label} {countOf(t.key)}
          </Link>
        ))}
      </div>
      <form className="flex gap-2">
        {st && <input type="hidden" name="status" value={st} />}
        <input name="q" defaultValue={q} placeholder="設備編號、名稱" className="input max-w-xs flex-1" />
        <button className="btn">搜尋</button>
      </form>
      <TableWrap>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>編號</th><th>名稱</th><th>狀態</th><th className="hidden sm:table-cell">租給</th>
                <th className="text-right">月租</th><th className="hidden text-right md:table-cell">日租</th>
                {showCost && <th className="hidden text-right md:table-cell">成本</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap font-mono"><Link href={`/rentals/assets/${r.id}`} className="link">{r.code}</Link></td>
                  <td>{r.name}</td>
                  <td className="whitespace-nowrap">
                    <span className={`badge ${r.status === "AVAILABLE" ? "bg-green-100 text-green-800" : r.status === "RENTED" ? "bg-blue-100 text-blue-800" : "bg-gray-200 text-gray-700"}`}>
                      {ASSET_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell">
                    {r.contractId ? <Link href={`/rentals/${r.contractId}`} className="link">{r.customer}</Link> : "—"}
                  </td>
                  <td className="text-right">{money(r.monthlyRate)}</td>
                  <td className="hidden text-right md:table-cell">{money(r.dailyRate)}</td>
                  {showCost && <td className="hidden text-right md:table-cell">{money(r.cost)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>還沒有出租設備{canEdit && "，請按「新增設備」"}</Empty>
        )}
      </TableWrap>
    </div>
  );
}
