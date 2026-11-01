import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, serialNumbers, stockMovements, users } from "@/db/schema";
import { requireUser, canSeeCost } from "@/lib/auth";
import { money, dateTimeStr, MOVEMENT_LABELS } from "@/lib/format";
import { PageHeader, TableWrap, Empty } from "@/components/ui";
import ProductForm from "../ProductForm";
import AdjustForm from "./AdjustForm";

export const metadata = { title: "商品資料" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser();
  const showCost = canSeeCost(s);
  const id = Number((await params).id);
  const p = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!p) notFound();

  const [cats, serials, moves] = await Promise.all([
    db.select().from(categories).orderBy(categories.sort),
    p.trackSerial
      ? db
          .select({ serial: serialNumbers.serial, purchasedAt: serialNumbers.purchasedAt })
          .from(serialNumbers)
          .where(and(eq(serialNumbers.productId, id), eq(serialNumbers.status, "IN_STOCK")))
          .orderBy(serialNumbers.createdAt)
      : Promise.resolve([]),
    db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        qty: stockMovements.qty,
        balanceAfter: stockMovements.balanceAfter,
        unitCost: stockMovements.unitCost,
        refNumber: stockMovements.refNumber,
        note: stockMovements.note,
        createdAt: stockMovements.createdAt,
        user: users.name,
      })
      .from(stockMovements)
      .leftJoin(users, eq(stockMovements.createdById, users.id))
      .where(eq(stockMovements.productId, id))
      .orderBy(desc(stockMovements.id))
      .limit(50),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={p.name} back="/products" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card">
          <div className="text-sm text-gray-500">目前庫存</div>
          <div className="text-2xl font-bold">{p.stockQty} <span className="text-sm font-normal">{p.unit}</span></div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">零售價</div>
          <div className="text-2xl font-bold">{money(p.retailPrice)}</div>
        </div>
        {showCost && (
          <>
            <div className="card">
              <div className="text-sm text-gray-500">平均成本</div>
              <div className="text-2xl font-bold">{money(p.avgCost)}</div>
            </div>
            <div className="card">
              <div className="text-sm text-gray-500">庫存價值</div>
              <div className="text-2xl font-bold">{money(p.avgCost * p.stockQty)}</div>
            </div>
          </>
        )}
      </div>

      {s.role !== "ACCOUNTANT" && <ProductForm product={p} categories={cats} />}

      {p.trackSerial && (
        <section>
          <h2 className="mb-2 font-semibold">在庫序號（{serials.length}）</h2>
          <div className="card">
            {serials.length ? (
              <div className="flex flex-wrap gap-2">
                {serials.map((x) => (
                  <Link key={x.serial} href={`/serials?q=${encodeURIComponent(x.serial)}`} className="badge bg-gray-100 font-mono text-sm text-gray-800 hover:bg-gray-200">
                    {x.serial}
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>目前沒有在庫序號</Empty>
            )}
          </div>
        </section>
      )}

      {s.role === "OWNER" && !p.trackSerial && <AdjustForm productId={p.id} />}

      <section>
        <h2 className="mb-2 font-semibold">庫存異動紀錄（最近 50 筆）</h2>
        <TableWrap>
          {moves.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>類型</th>
                  <th className="text-right">數量</th>
                  <th className="text-right">結存</th>
                  {showCost && <th className="text-right">成本</th>}
                  <th>單號／原因</th>
                  <th className="hidden sm:table-cell">人員</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{dateTimeStr(m.createdAt)}</td>
                    <td>{MOVEMENT_LABELS[m.type]}</td>
                    <td className={`text-right ${m.qty < 0 ? "text-red-600" : "text-green-700"}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                    <td className="text-right">{m.balanceAfter}</td>
                    {showCost && <td className="text-right">{money(m.unitCost)}</td>}
                    <td>{m.refNumber ?? m.note}</td>
                    <td className="hidden sm:table-cell">{m.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>尚無異動</Empty>
          )}
        </TableWrap>
      </section>
    </div>
  );
}
