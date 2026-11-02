// 報價單／訂購單 列印
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dateStr, TAX_TYPE_LABELS } from "@/lib/format";
import { QUOTE_TERMS } from "@/lib/company";
import PrintDoc, { num, parsePaper } from "@/components/print/PrintDoc";
import PrintToolbar from "@/components/print/PrintToolbar";

export const metadata = { title: "列印報價單" };

export default async function PrintOrder({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paper?: string; as?: string }>;
}) {
  await requireUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  const paper = parsePaper(sp.paper);

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

  const isQuote = o.status === "QUOTE" || o.status === "LOST";
  // 已成交的單據也可以印成報價單（as=quote），未成交的也可以印成訂購單（as=order）
  const asQuote = sp.as ? sp.as === "quote" : isQuote;
  const title = asQuote ? "報價單" : "訂購單";
  const excl = o.taxType === "EXCLUDED";
  const c = o.customer;
  const sales = o.salesperson ?? o.createdBy;

  const rows = o.items.map((it, i) => [
    i + 1,
    <>
      <div>{it.product.name}</div>
      {it.description && <div className="whitespace-pre-wrap text-[0.9em]">{it.description}</div>}
    </>,
    num(it.qty),
    it.product.isService ? "" : it.product.unit,
    num(it.unitPrice),
    num(it.subtotal),
  ]);

  const terms = [
    ...(asQuote && o.validUntil ? [`本報價有效期限至 ${dateStr(o.validUntil)}。`] : []),
    ...(o.paymentTerms ? [`付款條件：${o.paymentTerms}。`] : []),
    ...(asQuote ? QUOTE_TERMS : []),
  ];

  return (
    <>
      <PrintToolbar
        back={`/orders/${o.id}`}
        options={[
          [
            { label: "報價單", param: "as", value: "quote", isDefault: isQuote },
            { label: "訂購單", param: "as", value: "order", isDefault: !isQuote },
          ],
        ]}
      />
      <PrintDoc
        paper={paper}
        title={title}
        number={o.number}
        party={[
          {
            label: "客戶",
            value: c ? `${c.name}${c.code ? `（${c.code}）` : ""}` : (o.customerName ?? ""),
            wide: true,
          },
          { label: "統編", value: o.buyerTaxId },
          { label: "聯絡人", value: o.contact ?? c?.contact },
          { label: "電話", value: o.phone ?? c?.phone ?? c?.mobile },
          { label: "傳真", value: c?.fax },
          { label: "地址", value: c?.address, wide: true },
        ]}
        info={[
          { label: "日期", value: dateStr(o.date) },
          ...(asQuote ? [{ label: "有效期限", value: o.validUntil ? dateStr(o.validUntil) : "" }] : []),
          ...(o.deliveryDate ? [{ label: "交貨日期", value: dateStr(o.deliveryDate) }] : []),
          ...(o.customerPo ? [{ label: "客戶單號", value: o.customerPo }] : []),
          { label: "稅別", value: TAX_TYPE_LABELS[o.taxType] },
          { label: "業務", value: sales ? `${sales.name}` : "" },
        ]}
        columns={[
          { label: "#", align: "center", width: "2.2em" },
          { label: "品名規格" },
          { label: "數量", align: "right", width: "4em" },
          { label: "單位", align: "center", width: "3.5em" },
          { label: excl ? "單價(未稅)" : "單價", align: "right", width: "6.5em" },
          { label: "金額", align: "right", width: "7em" },
        ]}
        rows={rows}
        totals={[
          { label: "未稅金額", value: num(o.subtotal) },
          { label: "營業稅 5%", value: num(o.taxAmount) },
          { label: "總計", value: num(o.total), strong: true },
        ]}
        amount={o.total}
        note={o.note}
        terms={terms}
        signatures={asQuote ? ["報價人", "客戶確認回簽（請蓋章）"] : ["業務", "客戶確認簽章"]}
      />
    </>
  );
}
