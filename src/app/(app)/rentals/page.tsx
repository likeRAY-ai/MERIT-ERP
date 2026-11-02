import Link from "next/link";
import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, rentalContracts, rentalItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { money, dateStr, billingLabel, startOfTaipeiDay } from "@/lib/format";
import { dueContracts } from "@/lib/services/rentals";
import { PageHeader, TableWrap, Empty } from "@/components/ui";
import BillAllButton from "./BillAllButton";

export const metadata = { title: "租賃" };

export default async function RentalsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const s = await requireUser();
  const canEdit = s.role !== "ACCOUNTANT";
  const { q, tab = "active" } = await searchParams;
  const due = await dueContracts(db, startOfTaipeiDay());
  const dueIds = due.map((d) => d.id);

  const where: SQL[] = [];
  if (tab === "due") where.push(dueIds.length ? inArray(rentalContracts.id, dueIds) : sql`false`);
  else if (tab === "ended") where.push(eq(rentalContracts.status, "ENDED"));
  else where.push(eq(rentalContracts.status, "ACTIVE"));
  if (q) where.push(or(ilike(rentalContracts.number, `%${q}%`), ilike(customers.name, `%${q}%`))!);

  const rows = await db
    .select({
      id: rentalContracts.id,
      number: rentalContracts.number,
      customer: customers.name,
      billingType: rentalContracts.billingType,
      billingMonths: rentalContracts.billingMonths,
      startDate: rentalContracts.startDate,
      endDate: rentalContracts.endDate,
      nextBillDate: rentalContracts.nextBillDate,
      deposit: rentalContracts.deposit,
      depositReceivedAt: rentalContracts.depositReceivedAt,
      status: rentalContracts.status,
      units: sql<number>`count(${rentalItems.id}) filter (where ${rentalItems.returnedAt} is null)::int`,
      rateSum: sql<number>`coalesce(sum(${rentalItems.rate}) filter (where ${rentalItems.returnedAt} is null),0)::int`,
    })
    .from(rentalContracts)
    .innerJoin(customers, eq(rentalContracts.customerId, customers.id))
    .leftJoin(rentalItems, eq(rentalItems.contractId, rentalContracts.id))
    .where(and(...where))
    .groupBy(rentalContracts.id, customers.name)
    .orderBy(desc(rentalContracts.id))
    .limit(300);

  const [{ active, rented }] = await db
    .select({
      active: sql<number>`count(distinct ${rentalContracts.id})::int`,
      rented: sql<number>`count(${rentalItems.id})::int`,
    })
    .from(rentalContracts)
    .leftJoin(rentalItems, and(eq(rentalItems.contractId, rentalContracts.id), isNull(rentalItems.returnedAt)))
    .where(eq(rentalContracts.status, "ACTIVE"));

  const tabs = [
    { key: "active", label: `租約中 ${active}` },
    { key: "due", label: `應開帳 ${dueIds.length}` },
    { key: "ended", label: "已結束" },
  ];

  return (
    <div className="space-y-3">
      <PageHeader
        title="租賃"
        actions={
          <>
            <Link href="/rentals/assets" className="btn">出租設備</Link>
            {canEdit && <Link href="/rentals/new" className="btn-primary">＋ 新增租約</Link>}
          </>
        }
      />
      <p className="text-sm text-gray-600">租約中 {active} 份，出租中設備 {rented} 台</p>
      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/rentals?tab=${t.key}`}
            className={`rounded-full px-3 py-1 text-sm ${tab === t.key ? "bg-brand-700 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"} ${t.key === "due" && dueIds.length ? "font-semibold" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {tab === "due" && canEdit && dueIds.length > 0 && (
        <div className="card space-y-2">
          <p className="text-sm text-gray-700">以下租約的下一期已到，按下會為每份租約產生一張租金銷貨單（付款方式、稅別依租約設定）。</p>
          <BillAllButton count={dueIds.length} />
        </div>
      )}
      <form className="flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={q} placeholder="租約編號、客戶" className="input max-w-xs flex-1" />
        <button className="btn">搜尋</button>
      </form>
      <TableWrap>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>租約</th><th>客戶</th><th className="hidden md:table-cell">收款</th>
                <th className="text-right">台數</th><th className="hidden text-right sm:table-cell">租金合計</th>
                <th>下一期</th><th className="hidden lg:table-cell">押金</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isDue = dueIds.includes(r.id);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap"><Link href={`/rentals/${r.id}`} className="link">{r.number}</Link></td>
                    <td>{r.customer}</td>
                    <td className="hidden md:table-cell">{billingLabel(r)}</td>
                    <td className="text-right">{r.units}</td>
                    <td className="hidden text-right sm:table-cell">{money(r.rateSum)}{r.billingType === "DAILY" ? "／天" : "／月"}</td>
                    <td className="whitespace-nowrap">
                      {r.status === "ENDED" ? "已結束" : r.nextBillDate ? (
                        <span className={isDue ? "font-semibold text-red-600" : ""}>{dateStr(r.nextBillDate)}{isDue && " 應開帳"}</span>
                      ) : "已收完"}
                    </td>
                    <td className="hidden lg:table-cell">
                      {r.deposit ? `${money(r.deposit)} ${r.depositReceivedAt ? "已收" : "未收"}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Empty>{tab === "due" ? "目前沒有應開帳的租約" : "沒有租約"}</Empty>
        )}
      </TableWrap>
    </div>
  );
}
