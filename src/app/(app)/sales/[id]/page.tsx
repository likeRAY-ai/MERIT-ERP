import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { money, dateStr, dateTimeStr, PAYMENT_LABELS, TAX_TYPE_LABELS } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import { COMPANY } from "@/lib/company";

export const metadata = { title: "銷貨單" };

export default async function SalePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const sess = await requireUser();
  const showCost = canSeeCost(sess);
  const id = Number((await params).id);
  const { created } = await searchParams;
  const s = await db.query.sales.findFirst({
    where: eq(sales.id, id),
    with: { customer: true, createdBy: true, order: true, items: { with: { product: true, serials: true } } },
  });
  if (!s) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={`銷貨單 ${s.number}`}
        back="/sales"
        actions={
          <>
            <Link href="/sales/new" className="btn">＋ 再開一張</Link>
            <PrintButton />
          </>
        }
      />
      {created && <p className="no-print rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">銷貨完成，庫存與序號已更新</p>}

      <div className="card space-y-4">
        <div className="hidden text-center print:block">
          <div className="text-xl font-bold">{COMPANY.name}</div>
          <div className="text-xs">
            {[`統編 ${COMPANY.taxId}`, `電話 ${COMPANY.phone}`, COMPANY.address].join("　")}
          </div>
          <div className="mt-2 text-lg font-bold tracking-widest">銷貨單</div>
          <div className="text-sm">{s.number}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-gray-500">客戶</div>
            {s.customer ? <Link href={`/customers/${s.customerId}`} className="link">{s.customer.name}</Link> : "門市散客"}
          </div>
          <div><div className="text-gray-500">日期</div>{dateStr(s.date)}</div>
          <div><div className="text-gray-500">付款方式</div>{PAYMENT_LABELS[s.paymentMethod]}</div>
          <div><div className="text-gray-500">統編</div>{s.buyerTaxId ?? "—"}</div>
          <div><div className="text-gray-500">經手人</div>{s.createdBy.name}</div>
          <div><div className="text-gray-500">稅別</div>{TAX_TYPE_LABELS[s.taxType]}</div>
          {s.order && (
            <div><div className="text-gray-500">來源訂單</div><Link href={`/orders/${s.order.id}`} className="link">{s.order.number}</Link></div>
          )}
          <div><div className="text-gray-500">建立時間</div>{dateTimeStr(s.createdAt)}</div>
        </div>
        {s.note && <p className="text-sm"><span className="text-gray-500">備註：</span>{s.note}</p>}

        <table className="table">
          <thead>
            <tr><th>商品</th><th className="text-right">數量</th><th className="text-right">{s.taxType === "EXCLUDED" ? "單價（未稅）" : "單價"}</th><th className="text-right">小計</th></tr>
          </thead>
          <tbody>
            {s.items.map((it) => (
              <tr key={it.id}>
                <td>
                  {it.product.name}
                  {it.serials.length > 0 && (
                    <div className="mt-1 text-xs text-gray-600">
                      序號：<span className="font-mono">{it.serials.map((x) => x.serial).join("、")}</span>
                      {it.serials[0].warrantyUntil && <span>（保固至 {dateStr(it.serials[0].warrantyUntil)}）</span>}
                    </div>
                  )}
                </td>
                <td className="text-right">{it.qty}</td>
                <td className="text-right">{money(it.unitPrice)}</td>
                <td className="text-right">{money(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} className="text-right text-gray-500">未稅金額</td><td className="text-right">{money(s.total - s.taxAmount)}</td></tr>
            <tr><td colSpan={3} className="text-right text-gray-500">營業稅 5%</td><td className="text-right">{money(s.taxAmount)}</td></tr>
            <tr><td colSpan={3} className="text-right font-semibold">合計（含稅）</td><td className="text-right text-lg font-bold">{money(s.total)}</td></tr>
            {showCost && (
              <tr className="no-print">
                <td colSpan={3} className="text-right text-gray-500">毛利</td>
                <td className="text-right text-green-700">{money(s.total - s.costTotal)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
