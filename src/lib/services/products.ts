import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { orders, orderItems, products } from "@/db/schema";

// 開單畫面使用的商品資料
export type ProductHit = {
  id: number;
  sku: string;
  name: string;
  spec: string | null;
  unit: string;
  trackSerial: boolean;
  stockQty: number;
  reservedQty: number; // 已成交訂單尚未出貨的數量
  retailPrice: number;
  businessPrice: number;
  avgCost: number | null; // 沒有權限時為 null
  matchedSerial?: string; // 輸入的是在庫序號時，直接帶出
};

export const hitColumns = {
  id: products.id,
  sku: products.sku,
  name: products.name,
  spec: products.spec,
  unit: products.unit,
  trackSerial: products.trackSerial,
  stockQty: products.stockQty,
  retailPrice: products.retailPrice,
  businessPrice: products.businessPrice,
  avgCost: products.avgCost,
};

// 已成交、尚未出貨的訂單數量（預訂量）
export async function reservedQty(db: DB, productIds: number[], excludeOrderId?: number) {
  const map = new Map<number, number>();
  if (!productIds.length) return map;
  const rows = await db
    .select({
      productId: orderItems.productId,
      qty: sql<number>`coalesce(sum(greatest(${orderItems.qty} - ${orderItems.shippedQty}, 0)),0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.status, "CONFIRMED"),
        inArray(orderItems.productId, productIds),
        excludeOrderId ? ne(orders.id, excludeOrderId) : undefined,
      ),
    )
    .groupBy(orderItems.productId);
  for (const r of rows) map.set(r.productId, r.qty);
  return map;
}

type HitRow = Omit<ProductHit, "reservedQty" | "avgCost"> & { avgCost: number };

export async function toHits(db: DB, rows: HitRow[], showCost: boolean): Promise<ProductHit[]> {
  const reserved = await reservedQty(db, [...new Set(rows.map((r) => r.id))]);
  return rows.map((p) => ({ ...p, avgCost: showCost ? p.avgCost : null, reservedQty: reserved.get(p.id) ?? 0 }));
}

export async function hitsByIds(db: DB, ids: number[], showCost: boolean) {
  if (!ids.length) return new Map<number, ProductHit>();
  const rows = await db.select(hitColumns).from(products).where(inArray(products.id, ids));
  const hits = await toHits(db, rows, showCost);
  return new Map(hits.map((h) => [h.id, h]));
}
