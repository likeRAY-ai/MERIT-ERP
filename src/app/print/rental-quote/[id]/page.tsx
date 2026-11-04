// 租賃報價單 列印
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { billingLabel, dateStr, TAX_TYPE_LABELS } from "@/lib/format";
import { RENTAL_QUOTE_TERMS } from "@/lib/company";
import { loadRentalQuote, quoteTotals } from "@/lib/services/rentalQuotes";
import PrintDoc, { num, parsePaper, type TotalRow } from "@/components/print/PrintDoc";
import PrintToolbar from "@/components/print/PrintToolbar";

export const metadata = { title: "列印租賃報價單" };

export default async function PrintRentalQuote({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paper?: string }>;
}) {
  await requireUser();
  const id = Number((await params).id);
  const paper = parsePaper((await searchParams).paper);
  const q = await loadRentalQuote(db, id);
  if (!q) notFound();

  const daily = q.billingType === "DAILY";
  const unit = daily ? "日" : "月";
  const excl = q.taxType === "EXCLUDED";
  const t = quoteTotals(q, q.items);
  const c = q.customer;
  const termText = q.term ? `${q.term} ${daily ? "天" : "個月"}` : "不定期（按月續租）";
  // 租金在前、一次性費用在後
  const items = [...q.items.filter((i) => i.kind === "RENT"), ...q.items.filter((i) => i.kind === "FEE")];

  const rows = items.map((it, i) => [
    i + 1,
    <>
      <div>{it.name}</div>
      {it.description && <div className="whitespace-pre-wrap text-[0.9em]">{it.description}</div>}
    </>,
    num(it.qty),
    it.kind === "RENT" ? `每${unit}` : "一次",
    num(it.unitPrice),
    num(it.qty * it.unitPrice),
  ]);

  const totals: TotalRow[] = [
    { label: excl ? `每${unit}租金(未稅)` : `每${unit}租金`, value: num(t.rent), strong: !excl && !t.grand },
    ...(excl ? [{ label: "營業稅 5%", value: num(t.period.tax) }, { label: `每${unit}租金(含稅)`, value: num(t.period.total), strong: !t.grand }] : []),
    ...(q.billingMonths > 1 ? [{ label: `每次收款(${q.billingMonths}個月)`, value: num(t.period.total * q.billingMonths) }] : []),
    ...(t.fees > 0 ? [{ label: excl ? "一次性費用(含稅)" : "一次性費用", value: num(t.feeT.total) }] : []),
    ...(t.grand ? [{ label: `租期 ${termText} 合計`, value: num(t.grand.total), strong: true }] : []),
    ...(q.deposit > 0 ? [{ label: "押金(另收，可退)", value: num(q.deposit) }] : []),
  ];

  const terms = [
    `租期：${termText}${q.plannedStart ? `，預定 ${dateStr(q.plannedStart)} 起租` : ""}；收費方式：${billingLabel(q)}${
      daily ? "，依實際租用天數計算" : ""
    }。`,
    ...(q.validUntil ? [`本報價有效期限至 ${dateStr(q.validUntil)}。`] : []),
    ...(q.deposit > 0 ? [`押金新台幣 ${num(q.deposit)} 元，於交機前支付。`] : []),
    ...RENTAL_QUOTE_TERMS,
  ];

  return (
    <>
      <PrintToolbar back={`/rentals/quotes/${q.id}`} />
      <PrintDoc
        paper={paper}
        title="租賃報價單"
        number={q.number}
        party={[
          { label: "客戶", value: c ? `${c.name}${c.code ? `（${c.code}）` : ""}` : (q.customerName ?? ""), wide: true },
          { label: "統編", value: q.buyerTaxId },
          { label: "聯絡人", value: q.contact ?? c?.contact },
          { label: "電話", value: q.phone ?? c?.phone ?? c?.mobile },
          { label: "傳真", value: c?.fax },
          { label: "放置地點", value: q.address ?? c?.address, wide: true },
        ]}
        info={[
          { label: "日期", value: dateStr(q.date) },
          { label: "有效期限", value: q.validUntil ? dateStr(q.validUntil) : "" },
          { label: "租期", value: termText },
          { label: "稅別", value: TAX_TYPE_LABELS[q.taxType] },
          { label: "業務", value: (q.salesperson ?? q.createdBy).name },
        ]}
        columns={[
          { label: "#", align: "center", width: "2.2em" },
          { label: "品名規格" },
          { label: "數量", align: "right", width: "4em" },
          { label: "計費", align: "center", width: "3.5em" },
          { label: excl ? "單價(未稅)" : "單價", align: "right", width: "6.5em" },
          { label: excl ? "金額(未稅)" : "金額", align: "right", width: "7em" },
        ]}
        rows={rows}
        totals={totals}
        amount={t.grand ? t.grand.total : undefined}
        note={q.note}
        terms={terms}
        signatures={["報價人", "客戶確認回簽（請蓋章）"]}
      />
    </>
  );
}
