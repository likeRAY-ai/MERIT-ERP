// 銷貨單／出貨單（不印金額）／租金帳單 列印
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalBills, sales } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dateStr, PAYMENT_LABELS, TAX_TYPE_LABELS } from "@/lib/format";
import { SALE_TERMS } from "@/lib/company";
import PrintDoc, { num, parsePaper, type Column } from "@/components/print/PrintDoc";
import PrintToolbar from "@/components/print/PrintToolbar";

export const metadata = { title: "列印銷貨單" };

export default async function PrintSale({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paper?: string; ship?: string }>;
}) {
  await requireUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  const paper = parsePaper(sp.paper);
  const ship = sp.ship === "1"; // 出貨單：不印單價金額

  const s = await db.query.sales.findFirst({
    where: eq(sales.id, id),
    with: {
      customer: true,
      salesperson: true,
      createdBy: true,
      order: true,
      items: { with: { product: true, serials: true }, orderBy: (t, { asc }) => [asc(t.id)] },
    },
  });
  if (!s) notFound();
  const bill = await db.query.rentalBills.findFirst({
    where: eq(rentalBills.saleId, id),
    with: { contract: true },
  });

  const title = bill ? "租金帳單" : ship ? "出貨單" : "銷貨單";
  const excl = s.taxType === "EXCLUDED";
  const lineSum = s.items.reduce((a, it) => a + it.subtotal, 0);
  const unpaid = s.total - s.paidAmount;
  const c = s.customer;

  const columns: Column[] = ship
    ? [
        { label: "#", align: "center", width: "2.2em" },
        { label: "品名規格" },
        { label: "數量", align: "right", width: "4em" },
        { label: "單位", align: "center", width: "3.5em" },
        { label: "備註", width: "22%" },
      ]
    : [
        { label: "#", align: "center", width: "2.2em" },
        { label: "品名規格" },
        { label: "數量", align: "right", width: "4em" },
        { label: "單位", align: "center", width: "3.5em" },
        { label: excl ? "單價(未稅)" : "單價", align: "right", width: "6.5em" },
        { label: "金額", align: "right", width: "7em" },
      ];

  const rows = s.items.map((it, i) => {
    const name = (
      <>
        <div>{it.product.name}</div>
        {it.description && <div className="whitespace-pre-wrap text-[0.9em]">{it.description}</div>}
        {it.serials.length > 0 && (
          <div className="text-[0.85em]">
            S/N：<span className="font-mono">{it.serials.map((x) => x.serial).join("、")}</span>
            {it.serials[0].warrantyUntil && <>（保固至 {dateStr(it.serials[0].warrantyUntil)}）</>}
          </div>
        )}
      </>
    );
    const unit = it.product.isService ? "" : it.product.unit;
    return ship
      ? [i + 1, name, num(it.qty), unit, ""]
      : [i + 1, name, num(it.qty), unit, num(it.unitPrice), num(it.subtotal)];
  });

  const totals = ship
    ? undefined
    : [
        ...(s.discount > 0
          ? [
              { label: "商品合計", value: num(lineSum) },
              { label: "折扣", value: `−${num(s.discount)}` },
            ]
          : []),
        { label: "未稅金額", value: num(s.total - s.taxAmount) },
        { label: "營業稅 5%", value: num(s.taxAmount) },
        { label: "總計", value: num(s.total), strong: true },
        ...(s.paidAmount > 0 && unpaid > 0
          ? [
              { label: "已收", value: num(s.paidAmount) },
              { label: "未收", value: num(unpaid), strong: true },
            ]
          : []),
      ];

  return (
    <>
      <PrintToolbar
        back={`/sales/${s.id}`}
        options={
          bill
            ? []
            : [
                [
                  { label: "銷貨單", param: "ship", value: null },
                  { label: "出貨單（不印金額）", param: "ship", value: "1" },
                ],
              ]
        }
      />
      <PrintDoc
        paper={paper}
        title={title}
        number={s.number}
        voided={!!s.voidedAt}
        party={[
          { label: "客戶", value: c ? `${c.name}${c.code ? `（${c.code}）` : ""}` : "門市散客", wide: true },
          { label: "統編", value: s.buyerTaxId },
          { label: "聯絡人", value: s.contact ?? c?.contact },
          { label: "電話", value: c?.phone ?? c?.mobile },
          { label: "傳真", value: c?.fax },
          {
            label: ship || s.deliveryAddress ? "送貨地址" : "地址",
            value: s.deliveryAddress ?? c?.address,
            wide: true,
          },
        ]}
        info={[
          { label: "日期", value: dateStr(s.date) },
          ...(bill
            ? [
                { label: "租約", value: bill.contract.number },
                { label: "計費期間", value: `${dateStr(bill.periodStart)}～${dateStr(bill.periodEnd)}` },
              ]
            : []),
          ...(s.order ? [{ label: "訂單", value: s.order.number }] : []),
          ...(ship ? [] : [{ label: "付款", value: `${PAYMENT_LABELS[s.paymentMethod]}・${TAX_TYPE_LABELS[s.taxType]}` }]),
          ...(s.invoiceNo && !ship ? [{ label: "發票", value: s.invoiceNo }] : []),
          ...(s.deliveryMethod ? [{ label: "送貨", value: s.deliveryMethod }] : []),
          { label: "業務", value: s.salesperson?.name ?? s.createdBy.name },
        ]}
        columns={columns}
        rows={rows}
        totals={totals}
        amount={ship ? undefined : s.total}
        note={s.note}
        terms={paper === "a4" ? SALE_TERMS : undefined}
        signatures={ship ? ["送貨人", "客戶簽收"] : ["經手人", "客戶簽收"]}
      />
    </>
  );
}
