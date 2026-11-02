// 設備租賃契約 列印
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalContracts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { billingLabel, dateStr, PAYMENT_LABELS, TAX_TYPE_LABELS } from "@/lib/format";
import { COMPANY, RENTAL_TERMS } from "@/lib/company";
import PrintDoc, { num, parsePaper } from "@/components/print/PrintDoc";
import PrintToolbar from "@/components/print/PrintToolbar";

export const metadata = { title: "列印租約" };

export default async function PrintRental({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paper?: string; all?: string }>;
}) {
  await requireUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  const paper = parsePaper(sp.paper);
  const showReturned = sp.all === "1";

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
  const daily = c.billingType === "DAILY";
  const items = showReturned ? c.items : c.items.filter((it) => !it.returnedAt);
  const anyReturned = c.items.some((it) => it.returnedAt);
  const rateSum = items.filter((it) => !it.returnedAt).reduce((a, it) => a + it.rate, 0);
  const cu = c.customer;
  const taxNote = c.taxType === "EXCLUDED" ? "（未稅，另加 5% 營業稅）" : "（含稅）";

  const rows = items.map((it, i) => [
    i + 1,
    <span key="c" className="font-mono">{it.asset.code}</span>,
    it.asset.name,
    dateStr(it.startDate),
    it.returnedAt ? `已收回 ${dateStr(it.returnedAt)}` : "",
    num(it.rate),
  ]);

  return (
    <>
      <PrintToolbar
        back={`/rentals/${c.id}`}
        options={
          anyReturned
            ? [
                [
                  { label: "只印租用中設備", param: "all", value: null },
                  { label: "含已收回", param: "all", value: "1" },
                ],
              ]
            : []
        }
      />
      <PrintDoc
        paper={paper}
        title="設備租賃契約"
        number={c.number}
        party={[
          { label: "承租人", value: `${cu.name}${cu.code ? `（${cu.code}）` : ""}`, wide: true },
          { label: "統編", value: cu.taxId },
          { label: "聯絡人", value: c.contact ?? cu.contact },
          { label: "電話", value: c.phone ?? cu.phone ?? cu.mobile },
          { label: "傳真", value: cu.fax },
          { label: "放置地點", value: c.address ?? cu.address, wide: true },
        ]}
        info={[
          { label: "出租人", value: COMPANY.name },
          { label: "租期", value: `${dateStr(c.startDate)} 起${c.endDate ? ` 至 ${dateStr(c.endDate)}` : "（不定期）"}` },
          { label: "收費方式", value: `${billingLabel(c)}・${PAYMENT_LABELS[c.paymentMethod]}` },
          { label: "稅別", value: TAX_TYPE_LABELS[c.taxType] },
          { label: "押金", value: c.deposit ? `${num(c.deposit)} 元` : "無" },
          { label: "業務", value: (c.salesperson ?? c.createdBy).name },
        ]}
        columns={[
          { label: "#", align: "center", width: "2.2em" },
          { label: "設備編號", width: "9em" },
          { label: "設備名稱" },
          { label: "起租日", align: "center", width: "6.5em" },
          { label: "備註", width: "9em" },
          { label: daily ? "日租" : "月租", align: "right", width: "6em" },
        ]}
        rows={rows}
        totals={[{ label: daily ? "每日租金合計" : "每月租金合計", value: num(rateSum), strong: true }]}
        note={c.note}
        terms={[
          `租金：${daily ? "每日" : "每月"}新台幣 ${num(rateSum)} 元${taxNote}，${
            daily ? "依實際租用天數計算" : c.billingMonths > 1 ? `每 ${c.billingMonths} 個月預收一次` : "按月收取"
          }。`,
          ...(c.deposit ? [`押金：新台幣 ${num(c.deposit)} 元，於簽約時支付，租約結束設備返還無誤後退還。`] : []),
          ...RENTAL_TERMS,
        ]}
        signatures={[`出租人：${COMPANY.name}（簽章）`, "承租人（簽章）"]}
      />
    </>
  );
}
