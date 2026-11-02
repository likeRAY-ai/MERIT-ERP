import Link from "next/link";
import { and, asc, eq, gt, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { money } from "@/lib/format";
import { PageHeader, TableWrap, Empty } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

export const metadata = { title: "庫存" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; cat?: string }>;
}) {
  const s = await requireUser();
  const showCost = canSeeCost(s);
  const { view = "instock", cat } = await searchParams;

  const where: SQL[] = [eq(products.active, true), eq(products.isService, false)];
  if (view === "instock") where.push(gt(products.stockQty, 0));
  if (view === "low") where.push(sql`${products.safetyStock} > 0`, lte(products.stockQty, products.safetyStock));
  if (cat) where.push(eq(products.categoryId, Number(cat)));

  const [rows, cats, [totals]] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        stockQty: products.stockQty,
        safetyStock: products.safetyStock,
        avgCost: products.avgCost,
        unit: products.unit,
        category: categories.name,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...where))
      .orderBy(asc(categories.sort), asc(products.name)),
    db.select().from(categories).orderBy(categories.sort),
    db
      .select({
        qty: sql<number>`coalesce(sum(${products.stockQty}),0)::int`,
        value: sql<number>`coalesce(sum(${products.stockQty} * ${products.avgCost}),0)::bigint`,
      })
      .from(products)
      .where(and(eq(products.active, true), eq(products.isService, false), gt(products.stockQty, 0))),
  ]);

  const tabs = [
    { v: "instock", label: "有庫存" },
    { v: "low", label: "低於安全庫存" },
    { v: "all", label: "全部" },
  ];

  return (
    <div>
      <PageHeader title="庫存" actions={<PrintButton label="列印盤點表" />} />
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link
            key={t.v}
            href={`/inventory?view=${t.v}${cat ? `&cat=${cat}` : ""}`}
            className={view === t.v ? "btn-primary" : "btn"}
          >
            {t.label}
          </Link>
        ))}
        <form className="flex gap-2">
          <input type="hidden" name="view" value={view} />
          <select name="cat" defaultValue={cat ?? ""} className="input w-auto">
            <option value="">全部分類</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="btn">篩選</button>
        </form>
      </div>
      <div className="mb-3 text-sm text-gray-600">
        在庫總數 {totals.qty} 件{showCost && `，庫存總價值 ${money(Number(totals.value))}`}
      </div>
      <TableWrap>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>編號</th>
                <th>商品</th>
                <th className="hidden sm:table-cell">分類</th>
                <th className="text-right">庫存</th>
                {showCost && <th className="hidden text-right sm:table-cell">平均成本</th>}
                {showCost && <th className="text-right">庫存價值</th>}
                <th className="hidden w-24 print:table-cell">實盤數</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap text-gray-500">{p.sku}</td>
                  <td><Link href={`/products/${p.id}`} className="link">{p.name}</Link></td>
                  <td className="hidden sm:table-cell">{p.category ?? "—"}</td>
                  <td className={`text-right font-medium ${p.safetyStock > 0 && p.stockQty <= p.safetyStock ? "text-red-600" : ""}`}>
                    {p.stockQty} {p.unit}
                  </td>
                  {showCost && <td className="hidden text-right sm:table-cell">{money(p.avgCost)}</td>}
                  {showCost && <td className="text-right">{money(p.avgCost * p.stockQty)}</td>}
                  <td className="hidden border-b border-gray-400 print:table-cell"></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>沒有符合的商品</Empty>
        )}
      </TableWrap>
    </div>
  );
}
