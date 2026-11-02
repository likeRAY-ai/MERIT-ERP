import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { orders, sales } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { money, dateStr, dateTimeStr, TAX_TYPE_LABELS } from "@/lib/format";
import { orderShortage } from "@/lib/services/orders";
import { COMPANY } from "@/lib/company";
import { PageHeader } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import OrderActions from "./OrderActions";
import { OrderStatusBadge } from "../StatusBadge";

export const metadata = { title: "報價單" };

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const sess = await requireUser();
  const showCost = canSeeCost(sess);
  const canEdit = sess.role !== "ACCOUNTANT";
  const id = Number((await params).id);
  const { saved } = await searchParams;

  const o = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: {
      customer: true,
      salesperson: true,
      createdBy: true,
      items: { with: { product: true }, orderBy: (t, { asc }) => [asc(t.sort), asc(t.id)] },
    },
  });
  if (!o) notFound();

  const [shortage, related, [prev], [next]] = await Promise.all([
    orderShortage(db, id),
    db.select().from(sales).where(eq(sales.orderId, id)).orderBy(asc(sales.id)),
    db.select({ id: orders.id }).from(orders).where(lt(orders.id, id)).orderBy(desc(orders.id)).limit(1),
    db.select({ id: orders.id }).from(orders).where(gt(orders.id, id)).orderBy(asc(orders.id)).limit(1),
  ]);
  const sh = new Map(shortage.map((x) => [x.id, x]));
  const totalShort = shortage.reduce((s, x) => s + x.short, 0);
  const shippedAny = o.items.some((i) => i.shippedQty > 0);
  const isQuote = o.status === "QUOTE" || o.status === "LOST";
  const docTitle = isQuote ? "報價單" : "訂購單";
  const editable = canEdit && (o.status === "QUOTE" || o.status === "CONFIRMED") && !shippedAny;
  const customerName = o.customer?.name ?? o.customerName ?? "未建檔客戶";

  const buttons: { op: string; label: string; primary?: boolean; danger?: boolean; confirm?: string }[] = [];
  if (canEdit) {
    if (o.status === "QUOTE") {
      buttons.push({ op: "confirm", label: "✔ 客戶確認，成交", primary: true });
      buttons.push({ op: "lose", label: "未成交", confirm: "確定將這張報價單標記為未成交？" });
    }
    if (o.status === "CONFIRMED") {
      if (!shippedAny) buttons.push({ op: "unconfirm", label: "取消成交" });
      buttons.push({ op: "close", label: "手動結案", confirm: "剩下未出貨的商品將不再出貨，確定結案？" });
    }
    if (o.status === "LOST" || o.status === "CLOSED") buttons.push({ op: "reopen", label: "重新開啟" });
  }

  // 成本與毛利分析（以目前平均成本估算）
  const costRows = o.items.map((it) => ({ ...it, cost: it.product.avgCost * it.qty }));
  const costTotal = costRows.reduce((s, r) => s + r.cost, 0);
  const margin = o.total - costTotal;

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title={`${docTitle} ${o.number}`}
        back="/orders"
        actions={
          <>
            {prev && <Link href={`/orders/${prev.id}`} className="btn" title="上一筆">‹ 上一筆</Link>}
            {next && <Link href={`/orders/${next.id}`} className="btn" title="下一筆">下一筆 ›</Link>}
            {editable && <Link href={`/orders/${o.id}/edit`} className="btn">修改</Link>}
            {canEdit && <Link href={`/orders/new?copy=${o.id}`} className="btn">複製</Link>}
            <PrintButton />
          </>
        }
      />
      {saved && <p className="no-print rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">已儲存</p>}

      <div className="no-print card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">狀態</span>
          <OrderStatusBadge status={o.status} />
          {o.status === "QUOTE" && o.validUntil && o.validUntil < new Date() && (
            <span className="badge bg-red-100 text-red-700">報價已過期</span>
          )}
        </div>
        {canEdit && o.status === "CONFIRMED" && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/sales/new?order=${o.id}`} className="btn-primary">🧾 轉銷貨單（出貨）</Link>
            {totalShort > 0 && (
              <Link href={`/purchases/new?order=${o.id}`} className="btn">📦 缺貨商品進貨（缺 {totalShort} 件）</Link>
            )}
          </div>
        )}
        <OrderActions id={o.id} buttons={buttons} />
      </div>

      <div className="card space-y-4">
        <div className="hidden print:block">
          <div className="text-center text-xl font-bold">{COMPANY.name}</div>
          <div className="text-center text-xs">
            {[COMPANY.taxId && `統編 ${COMPANY.taxId}`, COMPANY.phone && `電話 ${COMPANY.phone}`, COMPANY.address]
              .filter(Boolean)
              .join("　")}
          </div>
          <div className="mt-2 text-center text-lg font-bold tracking-widest">{docTitle}</div>
          <div className="text-center text-sm">{o.number}</div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-gray-500">客戶</div>
            {o.customer ? <Link href={`/customers/${o.customerId}`} className="link">{customerName}</Link> : customerName}
          </div>
          <div><div className="text-gray-500">聯絡人</div>{o.contact ?? "—"}</div>
          <div><div className="text-gray-500">電話</div>{o.phone ?? "—"}</div>
          <div><div className="text-gray-500">統一編號</div>{o.buyerTaxId ?? "—"}</div>
          <div><div className="text-gray-500">日期</div>{dateStr(o.date)}</div>
          {isQuote && <div><div className="text-gray-500">報價有效期限</div>{o.validUntil ? dateStr(o.validUntil) : "—"}</div>}
          <div><div className="text-gray-500">交貨日期</div>{o.deliveryDate ? dateStr(o.deliveryDate) : "—"}</div>
          <div><div className="text-gray-500">業務人員</div>{o.salesperson?.name ?? "—"}</div>
          <div><div className="text-gray-500">付款條件</div>{o.paymentTerms ?? "—"}</div>
          {o.customerPo && <div><div className="text-gray-500">客戶訂單號</div>{o.customerPo}</div>}
          <div><div className="text-gray-500">稅別</div>{TAX_TYPE_LABELS[o.taxType]}</div>
        </div>
        {o.note && <p className="text-sm"><span className="text-gray-500">備註：</span>{o.note}</p>}

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="hidden w-8 sm:table-cell print:table-cell">#</th>
                <th>品名規格</th>
                <th className="text-right">數量</th>
                <th className="text-right">{o.taxType === "EXCLUDED" ? "單價（未稅）" : "單價"}</th>
                <th className="text-right">金額</th>
                {!isQuote && <th className="no-print text-right">已出貨</th>}
                {o.status === "CONFIRMED" && <th className="no-print text-right">可用／缺貨</th>}
              </tr>
            </thead>
            <tbody>
              {o.items.map((it, i) => {
                const x = sh.get(it.id);
                return (
                  <tr key={it.id}>
                    <td className="hidden text-gray-500 sm:table-cell print:table-cell">{i + 1}</td>
                    <td className="min-w-40">
                      <Link href={`/products/${it.productId}`} className="link print:no-underline print:text-inherit">{it.product.name}</Link>
                      {it.product.spec && <div className="text-xs text-gray-500">{it.product.spec}</div>}
                      {it.description && <div className="text-xs text-gray-700">{it.description}</div>}
                    </td>
                    <td className="whitespace-nowrap text-right">{it.qty} {it.product.unit}</td>
                    <td className="text-right">{money(it.unitPrice)}</td>
                    <td className="text-right">{money(it.subtotal)}</td>
                    {!isQuote && <td className="no-print text-right">{it.shippedQty}</td>}
                    {o.status === "CONFIRMED" && (
                      <td className="no-print text-right">
                        {x && x.remaining > 0 ? (
                          x.short > 0 ? (
                            <span className="text-red-600">可用 {x.available}・缺 {x.short}</span>
                          ) : (
                            <span className="text-green-700">可出 {x.remaining}</span>
                          )
                        ) : (
                          <span className="text-gray-400">已出完</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">未稅合計</span>{money(o.subtotal)}</div>
          <div className="flex justify-between"><span className="text-gray-500">營業稅 5%</span>{money(o.taxAmount)}</div>
          <div className="flex justify-between border-t border-gray-200 pt-1 text-lg font-bold">
            <span>總計</span>{money(o.total)}
          </div>
        </div>

        <div className="hidden pt-10 text-sm print:grid print:grid-cols-2 print:gap-8">
          <div className="border-t border-gray-400 pt-1">{COMPANY.name}　經辦：{o.salesperson?.name ?? ""}</div>
          <div className="border-t border-gray-400 pt-1">客戶確認簽章</div>
        </div>
      </div>

      {showCost && (
        <section className="no-print card">
          <h2 className="mb-2 font-semibold">成本與毛利分析</h2>
          <p className="mb-2 text-xs text-gray-500">以目前平均成本（含稅）估算，實際毛利以出貨時的成本為準。</p>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>商品</th><th className="text-right">數量</th><th className="text-right">平均成本</th><th className="text-right">成本小計</th></tr>
              </thead>
              <tbody>
                {costRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.product.name}</td>
                    <td className="text-right">{r.qty}</td>
                    <td className="text-right">{money(r.product.avgCost)}</td>
                    <td className="text-right">{money(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-right text-sm">
            總計 {money(o.total)} − 成本 {money(costTotal)} ={" "}
            <span className={`font-semibold ${margin < 0 ? "text-red-600" : "text-green-700"}`}>毛利 {money(margin)}</span>
            {o.total > 0 && `（${((margin / o.total) * 100).toFixed(1)}%）`}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="no-print card">
          <h2 className="mb-2 font-semibold">出貨紀錄</h2>
          <ul className="space-y-1 text-sm">
            {related.map((r) => (
              <li key={r.id} className="flex justify-between">
                <Link href={`/sales/${r.id}`} className="link">{r.number}</Link>
                <span className="text-gray-600">
                  {dateTimeStr(r.date)}・{money(r.total)}
                  {r.voidedAt && <span className="badge ml-1 bg-gray-200 text-gray-600">作廢</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="no-print text-xs text-gray-500">
        建立：{o.createdBy.name}・{dateTimeStr(o.createdAt)}
        {o.confirmedAt && `・成交：${dateTimeStr(o.confirmedAt)}`}
      </p>
    </div>
  );
}
