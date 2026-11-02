import Link from "next/link";
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { money } from "@/lib/format";
import { PageHeader, SearchBar, TableWrap, Empty } from "@/components/ui";

export const metadata = { title: "商品" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; all?: string }>;
}) {
  const s = await requireUser();
  const showCost = canSeeCost(s);
  const { q, cat, all } = await searchParams;

  const where: SQL[] = [];
  if (q) {
    const like = `%${q}%`;
    where.push(or(ilike(products.name, like), ilike(products.sku, like), ilike(products.brand, like), ilike(products.altCode, like), eq(products.barcode, q))!);
  }
  if (cat) where.push(eq(products.categoryId, Number(cat)));
  if (!all) where.push(eq(products.active, true));

  const [rows, cats] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        brand: products.brand,
        stockQty: products.stockQty,
        safetyStock: products.safetyStock,
        retailPrice: products.retailPrice,
        businessPrice: products.businessPrice,
        avgCost: products.avgCost,
        trackSerial: products.trackSerial,
        active: products.active,
        category: categories.name,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...where))
      .orderBy(asc(categories.sort), asc(products.name))
      .limit(300),
    db.select().from(categories).orderBy(categories.sort),
  ]);

  return (
    <div>
      <PageHeader title="商品" actions={<Link href="/products/new" className="btn-primary">＋ 新增商品</Link>} />
      <SearchBar q={q} placeholder="名稱、編號、品牌、條碼">
        <select name="cat" defaultValue={cat ?? ""} className="input w-auto">
          <option value="">全部分類</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="all" value="1" defaultChecked={!!all} /> 含停用
        </label>
      </SearchBar>
      <TableWrap>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>編號</th>
                <th>名稱</th>
                <th className="hidden sm:table-cell">分類</th>
                <th className="text-right">庫存</th>
                <th className="text-right">零售價</th>
                <th className="hidden text-right sm:table-cell">公司價</th>
                {showCost && <th className="hidden text-right md:table-cell">平均成本</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                  <td className="whitespace-nowrap text-gray-500">{p.sku}</td>
                  <td>
                    <Link href={`/products/${p.id}`} className="link">{p.name}</Link>
                    {p.trackSerial && <span className="badge ml-1 bg-brand-50 text-brand-800">序號</span>}
                    {p.brand && <div className="text-xs text-gray-500">{p.brand}</div>}
                  </td>
                  <td className="hidden sm:table-cell">{p.category ?? "—"}</td>
                  <td className={`text-right font-medium ${p.safetyStock > 0 && p.stockQty <= p.safetyStock ? "text-red-600" : ""}`}>
                    {p.stockQty}
                  </td>
                  <td className="text-right">{money(p.retailPrice)}</td>
                  <td className="hidden text-right sm:table-cell">{money(p.businessPrice || p.retailPrice)}</td>
                  {showCost && <td className="hidden text-right md:table-cell">{money(p.avgCost)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>
            沒有符合的商品。<Link href="/products/new" className="link">新增商品</Link>
          </Empty>
        )}
      </TableWrap>
    </div>
  );
}
