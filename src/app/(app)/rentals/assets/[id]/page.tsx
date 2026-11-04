import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalAssets, rentalContracts, rentalItems, customers } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { money, dateStr, isoDate, ASSET_STATUS_LABELS } from "@/lib/format";
import { PageHeader, TableWrap, Empty } from "@/components/ui";
import { AssetForm } from "../../AssetForms";

export const metadata = { title: "出租設備" };

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser();
  const id = Number((await params).id);
  const a = await db.query.rentalAssets.findFirst({ where: eq(rentalAssets.id, id) });
  if (!a) notFound();
  const history = await db
    .select({
      id: rentalItems.id,
      contractId: rentalContracts.id,
      number: rentalContracts.number,
      customer: customers.name,
      rate: rentalItems.rate,
      billingType: rentalContracts.billingType,
      startDate: rentalItems.startDate,
      returnedAt: rentalItems.returnedAt,
    })
    .from(rentalItems)
    .innerJoin(rentalContracts, eq(rentalItems.contractId, rentalContracts.id))
    .innerJoin(customers, eq(rentalContracts.customerId, customers.id))
    .where(eq(rentalItems.assetId, id))
    .orderBy(desc(rentalItems.startDate));

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title={`${a.code} ${a.name}`} back="/rentals/assets" />
      <p className="text-sm">狀態：<b>{ASSET_STATUS_LABELS[a.status]}</b></p>
      {s.role !== "ACCOUNTANT" ? (
        <AssetForm
          showCost={canSeeCost(s)}
          // 沒有權限時不把成本送到瀏覽器
          asset={{ ...a, cost: canSeeCost(s) ? a.cost : undefined, acquiredAt: isoDate(a.acquiredAt) }}
        />
      ) : null}
      <section>
        <h2 className="mb-2 font-semibold">出租紀錄</h2>
        <TableWrap>
          {history.length ? (
            <table className="table">
              <thead><tr><th>租約</th><th>客戶</th><th>期間</th><th className="text-right">租金</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td><Link href={`/rentals/${h.contractId}`} className="link">{h.number}</Link></td>
                    <td>{h.customer}</td>
                    <td className="whitespace-nowrap">{dateStr(h.startDate)}～{h.returnedAt ? dateStr(h.returnedAt) : "出租中"}</td>
                    <td className="text-right">{money(h.rate)}{h.billingType === "DAILY" ? "／天" : "／月"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>尚未出租過</Empty>
          )}
        </TableWrap>
      </section>
    </div>
  );
}
