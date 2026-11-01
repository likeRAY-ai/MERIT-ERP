import Link from "next/link";
import { desc, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { serialNumbers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dateStr, SERIAL_STATUS_LABELS } from "@/lib/format";
import { normalizeSerial } from "@/lib/services/inventory";
import { PageHeader, Empty, StatusBadge } from "@/components/ui";

export const metadata = { title: "序號查詢" };

export default async function SerialsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const key = q ? normalizeSerial(q) : "";

  const rows = key
    ? await db.query.serialNumbers.findMany({
        where: key.length >= 4 ? ilike(serialNumbers.serial, `%${key}%`) : eq(serialNumbers.serial, key),
        with: {
          product: true,
          purchaseItem: { with: { purchase: { with: { supplier: true } } } },
          saleItem: { with: { sale: { with: { customer: true } } } },
        },
        orderBy: desc(serialNumbers.id),
        limit: 30,
      })
    : [];

  const now = new Date();

  return (
    <div className="max-w-3xl">
      <PageHeader title="序號查詢" />
      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="輸入或掃描序號（至少 4 碼可模糊搜尋）"
          className="input"
          autoFocus
          autoCapitalize="characters"
        />
        <button className="btn-primary">查詢</button>
      </form>

      {key && rows.length === 0 && (
        <div className="card">
          <Empty>找不到序號「{key}」</Empty>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((r) => {
          const p = r.purchaseItem?.purchase;
          const s = r.saleItem?.sale;
          const inWarranty = r.warrantyUntil && r.warrantyUntil > now;
          return (
            <div key={r.id} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-lg font-bold">{r.serial}</div>
                  <Link href={`/products/${r.productId}`} className="link">{r.product.name}</Link>
                </div>
                <StatusBadge status={r.status} label={SERIAL_STATUS_LABELS[r.status]} />
              </div>

              {r.warrantyUntil && (
                <div className={`rounded-lg px-3 py-2 text-sm ${inWarranty ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                  {inWarranty ? "✅ 保固中" : "⚠️ 已過保固"}，保固到期日 {dateStr(r.warrantyUntil)}
                </div>
              )}

              <ol className="space-y-2 border-l-2 border-gray-200 pl-4 text-sm">
                {p && (
                  <li>
                    <div className="font-medium">📦 進貨　{dateStr(r.purchasedAt)}</div>
                    <div className="text-gray-600">
                      <Link href={`/purchases/${p.id}`} className="link">{p.number}</Link>・{p.supplier.name}
                    </div>
                  </li>
                )}
                {s && (
                  <li>
                    <div className="font-medium">🧾 售出　{dateStr(r.soldAt)}</div>
                    <div className="text-gray-600">
                      <Link href={`/sales/${s.id}`} className="link">{s.number}</Link>・
                      {s.customer ? <Link href={`/customers/${s.customerId}`} className="link">{s.customer.name}</Link> : "門市散客"}
                    </div>
                  </li>
                )}
              </ol>
            </div>
          );
        })}
      </div>
    </div>
  );
}
