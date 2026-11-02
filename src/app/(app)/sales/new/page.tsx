import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { hitsByIds } from "@/lib/services/products";
import { PageHeader } from "@/components/ui";
import type { Line } from "@/components/LineItems";
import SaleForm, { type FromOrder } from "./SaleForm";

export const metadata = { title: "開銷貨單" };

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; order?: string }>;
}) {
  const s = await requireUser(["OWNER", "STAFF"]);
  const { customer, order } = await searchParams;
  const list = await db
    .select({ id: customers.id, name: customers.name, type: customers.type, taxId: customers.taxId, phone: customers.phone })
    .from(customers)
    .where(eq(customers.active, true))
    .orderBy(asc(customers.name));

  // 由訂單轉銷貨：帶入客戶、稅別與待出貨的商品
  let fromOrder: FromOrder | undefined;
  if (order) {
    const o = await db.query.orders.findFirst({ where: eq(orders.id, Number(order)), with: { items: true } });
    if (!o) notFound();
    if (o.status !== "CONFIRMED") redirect(`/orders/${o.id}`);
    const hits = await hitsByIds(db, [...new Set(o.items.map((i) => i.productId))], canSeeCost(s));
    const lines: Line[] = o.items
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
      .filter((it) => it.qty > it.shippedQty)
      .flatMap((it) => {
        const p = hits.get(it.productId);
        if (!p) return [];
        const left = it.qty - it.shippedQty;
        return [{
          key: `o${it.id}`,
          product: p,
          qty: p.trackSerial ? 0 : Math.min(left, Math.max(p.stockQty, 0)) || left,
          price: it.unitPrice,
          serials: [],
          orderItemId: it.id,
          hint: `訂單待出貨 ${left}${p.trackSerial ? "，請選擇序號" : ""}`,
        }];
      });
    fromOrder = {
      id: o.id,
      number: o.number,
      customerId: o.customerId,
      buyerTaxId: o.buyerTaxId,
      taxType: o.taxType,
      paymentTerms: o.paymentTerms,
      lines,
    };
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title={fromOrder ? `訂單 ${fromOrder.number} 出貨` : "開銷貨單"} back={fromOrder ? `/orders/${fromOrder.id}` : "/sales"} />
      <SaleForm customers={list} defaultCustomer={customer ? Number(customer) : undefined} fromOrder={fromOrder} />
    </div>
  );
}
