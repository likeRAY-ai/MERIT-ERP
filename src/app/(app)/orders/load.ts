import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders, users } from "@/db/schema";
import { isoDate } from "@/lib/format";
import { hitsByIds } from "@/lib/services/products";
import type { Line } from "@/components/LineItems";
import type { OrderInit } from "./OrderForm";

export async function formOptions() {
  const [cs, staff] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        type: customers.type,
        taxId: customers.taxId,
        contact: customers.contact,
        phone: customers.phone,
      })
      .from(customers)
      .where(eq(customers.active, true))
      .orderBy(asc(customers.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.id)),
  ]);
  return { customers: cs, staff };
}

export function emptyInit(uid: number): OrderInit {
  const today = new Date();
  return {
    date: isoDate(today),
    validUntil: isoDate(new Date(today.getTime() + 7 * 86400_000)),
    deliveryDate: "",
    customerId: "",
    customerName: "",
    contact: "",
    phone: "",
    buyerTaxId: "",
    salespersonId: uid,
    customerPo: "",
    paymentTerms: "",
    taxType: "INCLUDED",
    note: "",
    lines: [],
  };
}

// 讀取一張單作為表單初始值；copy = true 時為複製（新日期、新單號）
export async function loadInit(id: number, showCost: boolean, uid: number, copy = false): Promise<OrderInit | null> {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, id), with: { items: true } });
  if (!o) return null;
  const hits = await hitsByIds(db, [...new Set(o.items.map((i) => i.productId))], showCost);
  const lines: Line[] = o.items
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .flatMap((it) => {
      const product = hits.get(it.productId);
      if (!product) return [];
      return [{
        key: `${it.id}-${copy ? "c" : "e"}`,
        product,
        qty: it.qty,
        price: it.unitPrice,
        serials: [],
        description: it.description ?? "",
      }];
    });
  const base = copy ? emptyInit(uid) : null;
  return {
    id: copy ? undefined : o.id,
    status: copy ? undefined : o.status,
    date: base ? base.date : isoDate(o.date),
    validUntil: base ? base.validUntil : isoDate(o.validUntil),
    deliveryDate: base ? "" : isoDate(o.deliveryDate),
    customerId: o.customerId ?? "",
    customerName: o.customerName ?? "",
    contact: o.contact ?? "",
    phone: o.phone ?? "",
    buyerTaxId: o.buyerTaxId ?? "",
    salespersonId: base ? uid : (o.salespersonId ?? ""),
    customerPo: base ? "" : (o.customerPo ?? ""),
    paymentTerms: o.paymentTerms ?? "",
    taxType: o.taxType,
    note: o.note ?? "",
    lines,
  };
}
