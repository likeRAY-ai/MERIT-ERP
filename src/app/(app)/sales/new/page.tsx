import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { customers, orders, sales, users } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { hitsByIds } from "@/lib/services/products";
import { PageHeader } from "@/components/ui";
import type { Line } from "@/components/LineItems";
import SaleForm, { type SaleInit } from "./SaleForm";

export const metadata = { title: "開銷貨單" };

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; order?: string; copy?: string }>;
}) {
  const s = await requireUser(["OWNER", "STAFF"]);
  const showCost = canSeeCost(s);
  const { customer, order, copy } = await searchParams;
  const [list, staff] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        type: customers.type,
        taxId: customers.taxId,
        phone: customers.phone,
        mobile: customers.mobile,
        code: customers.code,
        contact: customers.contact,
        address: customers.address,
        taxType: customers.taxType,
      })
      .from(customers)
      .where(eq(customers.active, true))
      .orderBy(asc(customers.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.id)),
  ]);

  let init: SaleInit = {
    customerId: "",
    buyerTaxId: "",
    taxType: "INCLUDED",
    paymentMethod: "CASH",
    salespersonId: s.uid,
    contact: "",
    deliveryMethod: "",
    deliveryAddress: "",
    note: "",
    lines: [],
  };
  let title = "開銷貨單";
  let back = "/sales";

  if (order) {
    // 由訂單轉銷貨：帶入客戶、稅別與待出貨的商品
    const o = await db.query.orders.findFirst({
      where: eq(orders.id, Number(order)),
      with: { items: true, customer: true },
    });
    if (!o) notFound();
    if (o.status !== "CONFIRMED") redirect(`/orders/${o.id}`);
    const hits = await hitsByIds(db, [...new Set(o.items.map((i) => i.productId))], showCost);
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
          qty: p.trackSerial ? 0 : left,
          price: it.unitPrice,
          serials: [],
          orderItemId: it.id,
          hint: `訂單待出貨 ${left}${p.trackSerial ? "，請選擇序號" : ""}`,
        }];
      });
    init = {
      ...init,
      orderId: o.id,
      orderNumber: o.number,
      customerId: o.customerId ?? "",
      buyerTaxId: o.buyerTaxId ?? "",
      taxType: o.taxType,
      paymentMethod: o.paymentTerms?.includes("月結") && o.customerId ? "CREDIT" : "CASH",
      salespersonId: o.salespersonId ?? s.uid,
      contact: o.contact ?? "",
      deliveryAddress: o.customer?.address ?? "",
      note: `訂單 ${o.number}`,
      lines,
    };
    title = `訂單 ${o.number} 出貨`;
    back = `/orders/${o.id}`;
  } else if (copy) {
    // 複製舊單：商品與價格照舊，序號需重新選擇
    const old = await db.query.sales.findFirst({ where: eq(sales.id, Number(copy)), with: { items: true } });
    if (!old) notFound();
    const hits = await hitsByIds(db, [...new Set(old.items.map((i) => i.productId))], showCost);
    init = {
      ...init,
      customerId: old.customerId ?? "",
      buyerTaxId: old.buyerTaxId ?? "",
      taxType: old.taxType,
      paymentMethod: old.paymentMethod,
      contact: old.contact ?? "",
      deliveryMethod: old.deliveryMethod ?? "",
      deliveryAddress: old.deliveryAddress ?? "",
      lines: old.items.flatMap((it) => {
        const p = hits.get(it.productId);
        if (!p) return [];
        return [{
          key: `c${it.id}`,
          product: p,
          qty: p.trackSerial ? 0 : it.qty,
          price: it.unitPrice,
          serials: [],
          hint: p.trackSerial ? `原單 ${it.qty} 件，請選擇序號` : undefined,
        }];
      }),
    };
    title = `複製銷貨單 ${old.number}`;
  } else if (customer) {
    const c = list.find((x) => x.id === Number(customer));
    if (c) {
      init = {
        ...init,
        customerId: c.id,
        buyerTaxId: c.taxId ?? "",
        taxType: c.taxType ?? "INCLUDED",
        contact: c.contact ?? "",
        deliveryAddress: c.address ?? "",
      };
    }
  }

  return (
    <div className="max-w-5xl">
      <PageHeader title={title} back={back} />
      <SaleForm customers={list} staff={staff} init={init} />
    </div>
  );
}
