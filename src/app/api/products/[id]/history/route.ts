import { NextResponse } from "next/server";
import { and, desc, eq, ne, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sales, saleItems, customers, purchases, purchaseItems, suppliers, orders, orderItems } from "@/db/schema";
import { getSession, canSeeCost } from "@/lib/auth";

export type PriceRow = {
  date: string;
  number: string;
  href: string;
  party: string;
  qty: number;
  price: number;
  taxType: "INCLUDED" | "EXCLUDED";
};

export type PriceHistory = {
  customer: PriceRow[]; // 該客戶的成交紀錄（含報價）
  others: PriceRow[]; // 其他客戶的銷貨紀錄
  purchases: PriceRow[] | null; // 進價（無權限為 null）
};

// 開單時查歷史價格：該客戶交易、所有客戶交易、進價
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const productId = Number((await params).id);
  const customerId = Number(new URL(req.url).searchParams.get("customerId")) || 0;

  const saleCols = {
    id: sales.id,
    date: sales.date,
    number: sales.number,
    party: customers.name,
    qty: saleItems.qty,
    price: saleItems.unitPrice,
    taxType: sales.taxType,
  };

  const [mine, myQuotes, others, buys] = await Promise.all([
    customerId
      ? db
          .select(saleCols)
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.saleId, sales.id))
          .leftJoin(customers, eq(sales.customerId, customers.id))
          .where(and(eq(saleItems.productId, productId), eq(sales.customerId, customerId), isNull(sales.voidedAt)))
          .orderBy(desc(sales.id))
          .limit(5)
      : Promise.resolve([]),
    customerId
      ? db
          .select({
            id: orders.id,
            date: orders.date,
            number: orders.number,
            party: customers.name,
            qty: orderItems.qty,
            price: orderItems.unitPrice,
            taxType: orders.taxType,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orderItems.orderId, orders.id))
          .leftJoin(customers, eq(orders.customerId, customers.id))
          .where(and(eq(orderItems.productId, productId), eq(orders.customerId, customerId)))
          .orderBy(desc(orders.id))
          .limit(5)
      : Promise.resolve([]),
    db
      .select(saleCols)
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(
        and(
          eq(saleItems.productId, productId),
          isNull(sales.voidedAt),
          customerId ? or(isNull(sales.customerId), ne(sales.customerId, customerId)) : undefined,
        ),
      )
      .orderBy(desc(sales.id))
      .limit(8),
    canSeeCost(s)
      ? db
          .select({
            id: purchases.id,
            date: purchases.date,
            number: purchases.number,
            party: suppliers.name,
            qty: purchaseItems.qty,
            price: purchaseItems.unitCost,
          })
          .from(purchaseItems)
          .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
          .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
          .where(eq(purchaseItems.productId, productId))
          .orderBy(desc(purchases.id))
          .limit(5)
      : Promise.resolve(null),
  ]);

  const row = (base: string) => (r: { id: number; date: Date; number: string; party: string | null; qty: number; price: number; taxType?: "INCLUDED" | "EXCLUDED" }): PriceRow => ({
    date: r.date.toISOString(),
    number: r.number,
    href: `${base}/${r.id}`,
    party: r.party ?? "散客",
    qty: r.qty,
    price: r.price,
    taxType: r.taxType ?? "INCLUDED",
  });

  const customer = [...mine.map(row("/sales")), ...myQuotes.map(row("/orders"))]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const body: PriceHistory = {
    customer,
    others: others.map(row("/sales")),
    purchases: buys ? buys.map(row("/purchases")) : null,
  };
  return NextResponse.json(body);
}
