import { NextResponse } from "next/server";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { products, serialNumbers } from "@/db/schema";
import { getSession, canSeeCost } from "@/lib/auth";
import { normalizeSerial } from "@/lib/services/inventory";

export type ProductHit = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  trackSerial: boolean;
  stockQty: number;
  retailPrice: number;
  businessPrice: number;
  avgCost: number | null;
  matchedSerial?: string; // 輸入的是在庫序號時，直接帶出
};

// 開單時搜尋商品：名稱、編號、品牌、條碼，或直接掃描在庫序號
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json([]);
  const showCost = canSeeCost(s);

  const cols = {
    id: products.id,
    sku: products.sku,
    name: products.name,
    unit: products.unit,
    trackSerial: products.trackSerial,
    stockQty: products.stockQty,
    retailPrice: products.retailPrice,
    businessPrice: products.businessPrice,
    avgCost: products.avgCost,
  };

  const serial = normalizeSerial(q);
  const [bySerial, rows] = await Promise.all([
    db
      .select({ ...cols, matchedSerial: serialNumbers.serial })
      .from(serialNumbers)
      .innerJoin(products, eq(serialNumbers.productId, products.id))
      .where(and(eq(serialNumbers.serial, serial), eq(serialNumbers.status, "IN_STOCK")))
      .limit(5),
    db
      .select(cols)
      .from(products)
      .where(
        and(
          eq(products.active, true),
          or(
            eq(products.barcode, q),
            ilike(products.sku, `%${q}%`),
            ilike(products.name, `%${q}%`),
            ilike(products.brand, `%${q}%`),
          ),
        ),
      )
      .orderBy(asc(products.name))
      .limit(20),
  ]);

  // 條碼或編號完全相符的排最前面
  const exact = (p: { sku: string }) => p.sku.toUpperCase() === q.toUpperCase();
  rows.sort((a, b) => Number(exact(b)) - Number(exact(a)));

  const hits: ProductHit[] = [...bySerial, ...rows].map((p) => ({ ...p, avgCost: showCost ? p.avgCost : null }));
  return NextResponse.json(hits);
}
