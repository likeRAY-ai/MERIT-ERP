import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { money, dateStr, dateTimeStr } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "進貨單" };

export default async function PurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await requireUser();
  const id = Number((await params).id);
  const { created } = await searchParams;
  const p = await db.query.purchases.findFirst({
    where: eq(purchases.id, id),
    with: { supplier: true, createdBy: true, items: { with: { product: true, serials: true } } },
  });
  if (!p) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={`進貨單 ${p.number}`}
        back="/purchases"
        actions={
          <>
            <Link href="/purchases/new" className="btn">＋ 再開一張</Link>
            <Link href={`/print/purchase/${p.id}`} className="btn">🖨️ 列印</Link>
          </>
        }
      />
      {created && <p className="no-print rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">進貨完成，庫存已更新</p>}

      <div className="card space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><div className="text-gray-500">供應商</div><Link href={`/suppliers/${p.supplierId}`} className="link">{p.supplier.name}</Link></div>
          <div><div className="text-gray-500">日期</div>{dateStr(p.date)}</div>
          <div><div className="text-gray-500">經手人</div>{p.createdBy.name}</div>
          <div><div className="text-gray-500">建立時間</div>{dateTimeStr(p.createdAt)}</div>
        </div>
        {p.note && <p className="text-sm"><span className="text-gray-500">備註：</span>{p.note}</p>}

        <table className="table">
          <thead>
            <tr><th>商品</th><th className="text-right">數量</th><th className="text-right">進價</th><th className="text-right">小計</th></tr>
          </thead>
          <tbody>
            {p.items.map((it) => (
              <tr key={it.id}>
                <td>
                  <Link href={`/products/${it.productId}`} className="link">{it.product.name}</Link>
                  {it.serials.length > 0 && (
                    <div className="mt-1 font-mono text-xs text-gray-600">{it.serials.map((s) => s.serial).join("、")}</div>
                  )}
                </td>
                <td className="text-right">{it.qty}</td>
                <td className="text-right">{money(it.unitCost)}</td>
                <td className="text-right">{money(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} className="text-right font-semibold">合計</td><td className="text-right text-lg font-bold">{money(p.total)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
