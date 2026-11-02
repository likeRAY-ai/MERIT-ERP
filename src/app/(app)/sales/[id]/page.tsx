import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { money, dateStr, dateTimeStr, PAYMENT_LABELS, TAX_TYPE_LABELS } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import { COMPANY } from "@/lib/company";
import { SaleInfoForm, VoidSaleForm } from "./SaleTools";

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
  const canEdit = sess.role !== "ACCOUNTANT";
  const id = Number((await params).id);
  const { created } = await searchParams;
  const [s, [prev], [next]] = await Promise.all([
    db.query.sales.findFirst({
      where: eq(sales.id, id),
      with: {
        customer: true,
        createdBy: true,
        salesperson: true,
        voidedBy: true,
        order: true,
        items: { with: { product: true, serials: true } },
      },
    }),
    db.select({ id: sales.id }).from(sales).where(lt(sales.id, id)).orderBy(desc(sales.id)).limit(1),
    db.select({ id: sales.id }).from(sales).where(gt(sales.id, id)).orderBy(asc(sales.id)).limit(1),
  ]);
  if (!s) notFound();
  const voided = !!s.voidedAt;
  const lineSum = s.items.reduce((a, it) => a + it.subtotal, 0);
  const unpaid = s.total - s.paidAmount;

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        title={`銷貨單 ${s.number}`}
        back="/sales"
        actions={
          <>
            {prev && <Link href={`/sales/${prev.id}`} className="btn">‹ 上一筆</Link>}
            {next && <Link href={`/sales/${next.id}`} className="btn">下一筆 ›</Link>}
            {canEdit && <Link href={`/sales/new?copy=${s.id}`} className="btn">複製</Link>}
            {canEdit && <Link href="/sales/new" className="btn">＋ 再開一張</Link>}
            <PrintButton />
          </>
        }
      />
      {created && !voided && <p className="no-print rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">銷貨完成，庫存與序號已更新</p>}
      {voided && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <b>此單已作廢</b>：{s.voidReason}（{s.voidedBy?.name}・{dateTimeStr(s.voidedAt)}），庫存與序號已還原，不列入營業額。
        </div>
      )}

      <div className={`card space-y-4 ${voided ? "opacity-70" : ""}`}>
        <div className="hidden text-center print:block">
          <div className="text-xl font-bold">{COMPANY.name}</div>
          <div className="text-xs">
            {[`統編 ${COMPANY.taxId}`, `電話 ${COMPANY.phone}`, COMPANY.address].join("　")}
          </div>
          <div className="mt-2 text-lg font-bold tracking-widest">銷貨單{voided ? "（作廢）" : ""}</div>
          <div className="text-sm">{s.number}</div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-gray-500">客戶</div>
            {s.customer ? <Link href={`/customers/${s.customerId}`} className="link">{s.customer.name}</Link> : "門市散客"}
          </div>
          <div><div className="text-gray-500">聯絡人</div>{s.contact ?? "—"}</div>
          <div><div className="text-gray-500">日期</div>{dateStr(s.date)}</div>
          <div><div className="text-gray-500">付款方式</div>{PAYMENT_LABELS[s.paymentMethod]}</div>
          <div><div className="text-gray-500">統編</div>{s.buyerTaxId ?? "—"}</div>
          <div><div className="text-gray-500">發票號碼</div>{s.invoiceNo ?? "—"}</div>
          <div><div className="text-gray-500">業務人員</div>{s.salesperson?.name ?? "—"}</div>
          <div><div className="text-gray-500">稅別</div>{TAX_TYPE_LABELS[s.taxType]}</div>
          {(s.deliveryMethod || s.deliveryAddress) && (
            <div className="col-span-2">
              <div className="text-gray-500">送貨</div>
              {[s.deliveryMethod, s.deliveryAddress].filter(Boolean).join("・")}
            </div>
          )}
          {s.order && (
            <div><div className="text-gray-500">來源訂單</div><Link href={`/orders/${s.order.id}`} className="link">{s.order.number}</Link></div>
          )}
          <div className="no-print"><div className="text-gray-500">經手人</div>{s.createdBy.name}・{dateTimeStr(s.createdAt)}</div>
        </div>
        {s.note && <p className="text-sm"><span className="text-gray-500">備註：</span>{s.note}</p>}

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>商品</th><th className="text-right">數量</th>
                <th className="text-right">{s.taxType === "EXCLUDED" ? "單價（未稅）" : "單價"}</th>
                <th className="text-right">小計</th>
              </tr>
            </thead>
            <tbody>
              {s.items.map((it) => (
                <tr key={it.id}>
                  <td className="min-w-40">
                    {it.product.name}
                    {it.description && <div className="text-xs text-gray-700">{it.description}</div>}
                    {it.serials.length > 0 && (
                      <div className="mt-1 text-xs text-gray-600">
                        序號：<span className="font-mono">{it.serials.map((x) => x.serial).join("、")}</span>
                        {it.serials[0].warrantyUntil && <span>（保固至 {dateStr(it.serials[0].warrantyUntil)}）</span>}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">{it.qty}{it.product.isService ? "" : ` ${it.product.unit}`}</td>
                  <td className="text-right">{money(it.unitPrice)}</td>
                  <td className="text-right">{money(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto max-w-xs space-y-1 text-sm">
          {s.discount > 0 && (
            <>
              <div className="flex justify-between"><span className="text-gray-500">商品合計</span>{money(lineSum)}</div>
              <div className="flex justify-between"><span className="text-gray-500">折扣</span>−{money(s.discount)}</div>
            </>
          )}
          <div className="flex justify-between"><span className="text-gray-500">未稅金額</span>{money(s.total - s.taxAmount)}</div>
          <div className="flex justify-between"><span className="text-gray-500">營業稅 5%</span>{money(s.taxAmount)}</div>
          <div className="flex justify-between border-t border-gray-200 pt-1 text-lg font-bold"><span>應收總計</span>{money(s.total)}</div>
          <div className="flex justify-between"><span className="text-gray-500">已收</span>{money(s.paidAmount)}</div>
          {unpaid > 0 && (
            <div className="flex justify-between font-semibold text-red-600"><span>未收</span>{money(unpaid)}</div>
          )}
          {showCost && (
            <div className="no-print flex justify-between text-green-700">
              <span>毛利</span>{money(s.total - s.costTotal)}
            </div>
          )}
        </div>
      </div>

      {canEdit && !voided && (
        <SaleInfoForm id={s.id} invoiceNo={s.invoiceNo} paidAmount={s.paidAmount} total={s.total} />
      )}
      {sess.role === "OWNER" && !voided && <VoidSaleForm id={s.id} />}
    </div>
  );
}
