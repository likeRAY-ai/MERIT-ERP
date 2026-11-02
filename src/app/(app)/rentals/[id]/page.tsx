import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalAssets, rentalBills, rentalContracts, sales } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  money,
  dateStr,
  isoDate,
  billingLabel,
  calcTotals,
  startOfTaipeiDay,
  addDaysTW,
  PAYMENT_LABELS,
  TAX_TYPE_LABELS,
} from "@/lib/format";
import { billableItems, nextPeriod } from "@/lib/services/rentals";
import { PageHeader, TableWrap, Empty } from "@/components/ui";
import { AddItemsForm, BillButton, DepositButton, EndForm, ItemsTable } from "./ContractTools";

export const metadata = { title: "租約" };

export default async function ContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const s = await requireUser();
  const canEdit = s.role !== "ACCOUNTANT";
  const id = Number((await params).id);
  const { created } = await searchParams;
  const c = await db.query.rentalContracts.findFirst({
    where: eq(rentalContracts.id, id),
    with: {
      customer: true,
      salesperson: true,
      createdBy: true,
      items: { with: { asset: true }, orderBy: (t, { asc }) => [asc(t.id)] },
    },
  });
  if (!c) notFound();
  const [bills, free] = await Promise.all([
    db
      .select({
        id: rentalBills.id,
        periodStart: rentalBills.periodStart,
        periodEnd: rentalBills.periodEnd,
        saleId: sales.id,
        number: sales.number,
        total: sales.total,
        paid: sales.paidAmount,
      })
      .from(rentalBills)
      .innerJoin(sales, eq(rentalBills.saleId, sales.id))
      .where(eq(rentalBills.contractId, id))
      .orderBy(asc(rentalBills.periodStart)),
    c.status === "ACTIVE"
      ? db
          .select({
            id: rentalAssets.id,
            code: rentalAssets.code,
            name: rentalAssets.name,
            monthlyRate: rentalAssets.monthlyRate,
            dailyRate: rentalAssets.dailyRate,
          })
          .from(rentalAssets)
          .where(eq(rentalAssets.status, "AVAILABLE"))
          .orderBy(asc(rentalAssets.code))
      : Promise.resolve([]),
  ]);

  const active = c.status === "ACTIVE";
  const daily = c.billingType === "DAILY";
  const period = active ? nextPeriod(c) : null;
  const periodItems = period ? billableItems(c.items, period) : [];
  const periodTotal = period ? calcTotals(periodItems.reduce((a, i) => a + i.rate * period.units, 0), c.taxType).total : 0;
  const due = !!period && period.start < addDaysTW(startOfTaipeiDay(), 1);
  const today = isoDate(new Date());
  const unpaid = bills.reduce((a, b) => a + (b.total - b.paid), 0);
  const refundable = c.depositReceivedAt && !c.depositRefundedAt ? c.deposit : null;

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title={`租約 ${c.number}`}
        back="/rentals"
        actions={<Link href={`/print/rental/${c.id}`} className="btn">🖨️ 列印租約</Link>}
      />
      {created && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">租約已建立，設備狀態已改為出租中</p>}

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${active ? "bg-blue-100 text-blue-800" : "bg-gray-200 text-gray-700"}`}>{active ? "租約中" : "已結束"}</span>
          <span className="text-sm text-gray-600">{billingLabel(c)}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div><div className="text-gray-500">客戶</div><Link href={`/customers/${c.customerId}`} className="link">{c.customer.name}</Link></div>
          <div><div className="text-gray-500">聯絡人</div>{c.contact ?? "—"}</div>
          <div><div className="text-gray-500">電話</div>{c.phone ?? "—"}</div>
          <div><div className="text-gray-500">業務人員</div>{c.salesperson?.name ?? "—"}</div>
          <div className="col-span-2"><div className="text-gray-500">放置地點</div>{c.address ?? "—"}</div>
          <div><div className="text-gray-500">租期</div>{dateStr(c.startDate)}～{c.endDate ? dateStr(c.endDate) : "不定期"}</div>
          <div><div className="text-gray-500">稅別／付款</div>{TAX_TYPE_LABELS[c.taxType]}・{PAYMENT_LABELS[c.paymentMethod]}</div>
          <div>
            <div className="text-gray-500">押金</div>
            {c.deposit ? (
              <>
                {money(c.deposit)}{" "}
                {c.depositRefundedAt
                  ? `已退 ${money(c.depositRefund)}`
                  : c.depositReceivedAt
                    ? "已收"
                    : <span className="text-red-600">未收</span>}
              </>
            ) : "無"}
          </div>
          {!active && <div><div className="text-gray-500">結束日</div>{dateStr(c.endedAt)}</div>}
          {unpaid > 0 && <div><div className="text-gray-500">租金未收</div><span className="font-semibold text-red-600">{money(unpaid)}</span></div>}
        </div>
        {c.note && <p className="text-sm"><span className="text-gray-500">備註：</span>{c.note}</p>}
        {canEdit && active && c.deposit > 0 && !c.depositReceivedAt && <DepositButton id={c.id} amount={c.deposit} />}
      </div>

      {active && (
        <div className={`card space-y-2 ${due ? "border-red-200 bg-red-50/40" : ""}`}>
          <h2 className="font-semibold">下一期租金</h2>
          {period ? (
            <>
              <p className="text-sm">
                {dateStr(period.start)}～{dateStr(period.end)}（{period.units} {period.unitLabel}），{periodItems.length} 台，
                應收 <b>{money(periodTotal)}</b>
                {due ? <span className="ml-1 font-semibold text-red-600">已到期，請開帳</span> : <span className="ml-1 text-gray-500">尚未到期，可提前開帳</span>}
              </p>
              {canEdit && <BillButton id={c.id} due={due} label="產生這一期的銷貨單" />}
            </>
          ) : (
            <p className="text-sm text-gray-600">所有租期都已開帳。</p>
          )}
        </div>
      )}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">出租設備</h2>
          {canEdit && active && <AddItemsForm id={c.id} assets={free} daily={daily} today={today} />}
        </div>
        <ItemsTable
          id={c.id}
          daily={daily}
          active={active}
          today={today}
          canEdit={canEdit}
          items={c.items.map((i) => ({
            id: i.id,
            assetId: i.assetId,
            code: i.asset.code,
            name: i.asset.name,
            rate: i.rate,
            start: dateStr(i.startDate),
            returned: i.returnedAt ? dateStr(i.returnedAt) : null,
          }))}
        />
      </section>

      <section>
        <h2 className="mb-2 font-semibold">租金帳單</h2>
        <TableWrap>
          {bills.length ? (
            <table className="table">
              <thead><tr><th>期間</th><th>銷貨單</th><th className="text-right">金額</th><th className="text-right">未收</th><th></th></tr></thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap">{dateStr(b.periodStart)}～{dateStr(b.periodEnd)}</td>
                    <td><Link href={`/sales/${b.saleId}`} className="link">{b.number}</Link></td>
                    <td className="text-right">{money(b.total)}</td>
                    <td className="text-right">{b.total > b.paid ? <span className="text-red-600">{money(b.total - b.paid)}</span> : "已收"}</td>
                    <td className="text-right"><Link href={`/print/sale/${b.saleId}`} className="link whitespace-nowrap">🖨️ 帳單</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>尚未開帳</Empty>
          )}
        </TableWrap>
        <p className="mt-1 text-xs text-gray-500">開錯的帳單到銷貨單「作廢」即可（從最新一期開始），該期可以重新開帳。收款請在銷貨單上登記。</p>
      </section>

      {canEdit && active && <EndForm id={c.id} today={today} refundable={refundable} />}
      <p className="text-xs text-gray-500">建立：{c.createdBy.name}・{dateStr(c.createdAt)}</p>
    </div>
  );
}
