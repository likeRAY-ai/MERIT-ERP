// 進貨單 列印
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dateStr } from "@/lib/format";
import PrintDoc, { num, parsePaper } from "@/components/print/PrintDoc";
import PrintToolbar from "@/components/print/PrintToolbar";

export const metadata = { title: "列印進貨單" };

export default async function PrintPurchase({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paper?: string }>;
}) {
  await requireUser();
  const id = Number((await params).id);
  const paper = parsePaper((await searchParams).paper);

  const p = await db.query.purchases.findFirst({
    where: eq(purchases.id, id),
    with: { supplier: true, createdBy: true, items: { with: { product: true, serials: true }, orderBy: (t, { asc }) => [asc(t.id)] } },
  });
  if (!p) notFound();
  const sp = p.supplier;
  const qty = p.items.reduce((a, it) => a + it.qty, 0);

  const rows = p.items.map((it, i) => [
    i + 1,
    <>
      <div>
        {it.product.name}
        <span className="ml-[0.5em] font-mono text-[0.85em]">{it.product.sku}</span>
      </div>
      {it.serials.length > 0 && (
        <div className="text-[0.85em]">
          S/N：<span className="font-mono">{it.serials.map((s) => s.serial).join("、")}</span>
        </div>
      )}
    </>,
    num(it.qty),
    it.product.unit,
    num(it.unitCost),
    num(it.subtotal),
  ]);

  return (
    <>
      <PrintToolbar back={`/purchases/${p.id}`} />
      <PrintDoc
        paper={paper}
        title="進貨單"
        number={p.number}
        party={[
          { label: "廠商", value: `${sp.name}${sp.code ? `（${sp.code}）` : ""}`, wide: true },
          { label: "統編", value: sp.taxId },
          { label: "聯絡人", value: sp.contact },
          { label: "電話", value: sp.phone ?? sp.mobile },
          { label: "傳真", value: sp.fax },
          { label: "地址", value: sp.address, wide: true },
        ]}
        info={[
          { label: "進貨日期", value: dateStr(p.date) },
          { label: "經手人", value: p.createdBy.name },
          { label: "總數量", value: num(qty) },
        ]}
        columns={[
          { label: "#", align: "center", width: "2.2em" },
          { label: "品名" },
          { label: "數量", align: "right", width: "4em" },
          { label: "單位", align: "center", width: "3.5em" },
          { label: "進價(含稅)", align: "right", width: "6.5em" },
          { label: "金額", align: "right", width: "7em" },
        ]}
        rows={rows}
        totals={[{ label: "合計(含稅)", value: num(p.total), strong: true }]}
        note={p.note}
        signatures={["經手人", "驗收", "主管"]}
      />
    </>
  );
}
