import { NextResponse } from "next/server";
import { and, asc, eq, gt, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { getSession, canSeeCost } from "@/lib/auth";
import { hitColumns, toHits, type ProductHit } from "@/lib/services/products";

export type BrowseItem = ProductHit & { brand: string | null; categoryName: string | null };
export type BrowseResult = {
  items: BrowseItem[];
  total: number;
  categories?: { id: number; name: string; count: number }[];
};

const PAGE = 50;

// 開單時瀏覽商品：依分類、關鍵字、是否有庫存篩選
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const categoryId = Number(sp.get("category")) || 0;
  const inStock = sp.get("inStock") === "1";
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const where: SQL[] = [eq(products.active, true)];
  if (categoryId) where.push(eq(products.categoryId, categoryId));
  if (inStock) where.push(gt(products.stockQty, 0));
  if (q) {
    const like = `%${q}%`;
    where.push(
      or(
        ilike(products.name, like),
        ilike(products.sku, like),
        ilike(products.brand, like),
        ilike(products.spec, like),
        ilike(products.altCode, like),
        eq(products.barcode, q),
      )!,
    );
  }

  const [rows, [{ total }], cats] = await Promise.all([
    db
      .select({ ...hitColumns, brand: products.brand, categoryName: categories.name })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...where))
      .orderBy(asc(categories.sort), asc(products.name))
      .limit(PAGE)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(products).where(and(...where)),
    sp.get("withCategories")
      ? db
          .select({ id: categories.id, name: categories.name, count: sql<number>`count(${products.id})::int` })
          .from(categories)
          .leftJoin(products, and(eq(products.categoryId, categories.id), eq(products.active, true)))
          .groupBy(categories.id)
          .having(sql`count(${products.id}) > 0`)
          .orderBy(asc(categories.sort), asc(categories.name))
      : Promise.resolve(undefined),
  ]);

  const hits = await toHits(db, rows, canSeeCost(s));
  const items: BrowseItem[] = hits.map((h, i) => ({ ...h, brand: rows[i].brand, categoryName: rows[i].categoryName }));
  const body: BrowseResult = { items, total, categories: cats };
  return NextResponse.json(body);
}
