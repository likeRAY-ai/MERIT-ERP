import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { billingLabel, dateStr, dateTimeStr, money, RENTAL_QUOTE_STATUS_LABELS, TAX_TYPE_LABELS } from "@/lib/format";
import { loadRentalQuote, quoteTotals } from "@/lib/services/rentalQuotes";
import { PageHeader } from "@/components/ui";
import QuoteActions from "../QuoteActions";

export const metadata = { title: "租賃報價單" };

export default async function RentalQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const s = await requireUser();
  const canEdit = s.role !== "ACCOUNTANT";
  const id = Number((await params).id);
  const { saved } = await searchParams;
  const q = await loadRentalQuote(db, id);
  if (!q) notFound();
  const t = quoteTotals(q, q.items);
  const daily = q.billingType === "DAILY";
  const unit = daily ? "日" : "月";
  const expired = q.status === "QUOTE" && q.validUntil && q.validUntil < new Date();
  const name = q.customer?.name ?? q.customerName ?? "";
  const badge =
    q.status === "ACCEPTED" ? "bg-green-100 text-green-800" : q.status === "LOST" ? "bg-gray-200 text-gray-700" : "bg-amber-100 text-amber-800";

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        title={`租賃報價單 ${q.number}`}
        back="/rentals/quotes"
        actions={
          <>
            {canEdit && q.status === "QUOTE" && <Link href={`/rentals/quotes/${q.id}/edit`} className="btn">修改</Link>}
            {canEdit && <Link href={`/rentals/quotes/new?copy=${q.id}`} className="btn">複製</Link>}
            <Link href={`/print/rental-quote/${q.id}`} className="btn">🖨️ 列印</Link>
          </>
        }
      />
      {saved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">已儲存</p>}

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${badge}`}>{RENTAL_QUOTE_STATUS_LABELS[q.status]}</span>
          {expired && <span className="badge bg-red-100 text-red-700">報價已過期</span>}
          {q.contract && (
            <span className="text-sm">
              租約 <Link href={`/rentals/${q.contract.id}`} className="link">{q.contract.number}</Link>
            </span>
          )}
        </div>
        {canEdit && q.status === "QUOTE" && (
          <div className="flex flex-wrap items-start gap-2">
            <Link href={`/rentals/new?quote=${q.id}`} className="btn-primary">✔ 客戶確認，建立租約</Link>
            <QuoteActions id={q.id} op="lose" label="未成交" confirm="確定將這張報價單標記為未成交？" />
          </div>
        )}
        {canEdit && q.status === "LOST" && <QuoteActions id={q.id} op="reopen" label="重新開啟" />}
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-gray-500">客戶</div>
            {q.customer ? <Link href={`/customers/${q.customerId}`} className="link">{name}</Link> : <>{name}<span className="text-xs text-gray-500">（未建檔）</span></>}
          </div>
          <div><div className="text-gray-500">聯絡人</div>{q.contact ?? "—"}</div>
          <div><div className="text-gray-500">電話</div>{q.phone ?? "—"}</div>
          <div><div className="text-gray-500">統一編號</div>{q.buyerTaxId ?? "—"}</div>
          <div><div className="text-gray-500">報價日期</div>{dateStr(q.date)}</div>
          <div><div className="text-gray-500">有效期限</div>{q.validUntil ? dateStr(q.validUntil) : "—"}</div>
          <div><div className="text-gray-500">收費方式</div>{billingLabel(q)}</div>
          <div><div className="text-gray-500">租期</div>{q.term ? `${q.term} ${daily ? "天" : "個月"}` : "不定期"}</div>
          <div><div className="text-gray-500">預定起租</div>{q.plannedStart ? dateStr(q.plannedStart) : "—"}</div>
          <div><div className="text-gray-500">稅別</div>{TAX_TYPE_LABELS[q.taxType]}</div>
          <div><div className="text-gray-500">押金</div>{q.deposit ? money(q.deposit) : "—"}</div>
          <div><div className="text-gray-500">業務人員</div>{q.salesperson?.name ?? "—"}</div>
          {q.address && <div className="col-span-2"><div className="text-gray-500">放置地點</div>{q.address}</div>}
          <div className="col-span-2"><div className="text-gray-500">建立</div>{q.createdBy.name}・{dateTimeStr(q.createdAt)}</div>
        </div>
        {q.note && <p className="whitespace-pre-wrap text-sm"><span className="text-gray-500">備註：</span>{q.note}</p>}

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>項目</th><th className="text-right">數量</th><th className="text-right">單價</th><th className="text-right">金額</th></tr>
            </thead>
            <tbody>
              {q.items.map((it) => (
                <tr key={it.id}>
                  <td className="min-w-40">
                    <span className="mr-1 text-xs text-gray-500">{it.kind === "RENT" ? `${unit}租` : "一次性"}</span>
                    {it.name}
                    {it.description && <div className="text-xs text-gray-600">{it.description}</div>}
                  </td>
                  <td className="text-right">{it.qty}</td>
                  <td className="whitespace-nowrap text-right">{money(it.unitPrice)}{it.kind === "RENT" ? `／${unit}` : ""}</td>
                  <td className="text-right">{money(it.qty * it.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto max-w-sm space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">每{unit}租金（{t.units} 台）</span>{money(t.period.total)}</div>
          {q.taxType === "EXCLUDED" && (
            <div className="flex justify-between text-xs text-gray-500"><span>未稅 {money(t.rent)}＋稅 {money(t.period.tax)}</span></div>
          )}
          {q.billingMonths > 1 && <div className="flex justify-between"><span className="text-gray-500">每次收款（{q.billingMonths} 個月）</span>{money(t.period.total * q.billingMonths)}</div>}
          {t.fees > 0 && <div className="flex justify-between"><span className="text-gray-500">一次性費用</span>{money(t.feeT.total)}</div>}
          {t.grand && (
            <div className="flex justify-between border-t border-gray-200 pt-1 text-lg font-bold">
              <span>租期合計</span>{money(t.grand.total)}
            </div>
          )}
          {q.deposit > 0 && <div className="flex justify-between"><span className="text-gray-500">押金（另收）</span>{money(q.deposit)}</div>}
        </div>
      </div>
    </div>
  );
}
