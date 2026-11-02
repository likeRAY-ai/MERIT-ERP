import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { orders, suppliers } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { orderShortage } from "@/lib/services/orders";
import { hitsByIds } from "@/lib/services/products";
import type { Line } from "@/components/LineItems";
import { ymd } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import PurchaseForm from "./PurchaseForm";

export const metadata = { title: "新增進貨" };

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; order?: string }>;
}) {
  const s = await requireUser(["OWNER", "STAFF"]);
  const { supplier, order } = await searchParams;

  // 由訂單帶入缺貨商品
  let initialLines: Line[] = [];
  let note = "";
  if (order) {
    const o = await db.query.orders.findFirst({ where: eq(orders.id, Number(order)) });
    if (!o) notFound();
    const short = (await orderShortage(db, o.id)).filter((x) => x.short > 0);
    const need = new Map<number, number>();
    short.forEach((x) => need.set(x.productId, (need.get(x.productId) ?? 0) + x.short));
    const hits = await hitsByIds(db, [...need.keys()], canSeeCost(s));
    initialLines = [...need].flatMap(([pid, q]) => {
      const p = hits.get(pid);
      if (!p) return [];
      return [{
        key: `s${pid}`,
        product: p,
        qty: p.trackSerial ? 0 : q,
        price: p.avgCost ?? 0,
        serials: [],
        hint: `訂單 ${o.number} 缺 ${q}${p.trackSerial ? "，請輸入序號" : ""}`,
      }];
    });
    note = `訂單 ${o.number} 缺貨`;
  }

  const list = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.name));
  const d = ymd();
  return (
    <div className="max-w-3xl">
      <PageHeader title="新增進貨" back="/purchases" />
      <PurchaseForm
        suppliers={list}
        defaultSupplier={supplier ? Number(supplier) : undefined}
        today={`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`}
        initialLines={initialLines}
        note={note}
      />
    </div>
  );
}
