"use client";

// 瀏覽商品清單後加入單據：依分類、關鍵字、有庫存篩選，顯示規格、庫存、可用量、售價、成本
import { useEffect, useRef, useState } from "react";
import type { BrowseItem, BrowseResult } from "@/app/api/products/browse/route";
import type { ProductHit } from "@/lib/services/products";
import { money } from "@/lib/format";

export default function ProductPicker({
  onAdd,
  onClose,
  addedIds,
  business,
}: {
  onAdd: (p: ProductHit) => void;
  onClose: () => void;
  addedIds: Map<number, number>; // 商品 id → 已加入數量
  business: boolean;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [inStock, setInStock] = useState(false);
  const [cats, setCats] = useState<BrowseResult["categories"]>([]);
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const first = useRef(true);

  async function load(offset: number) {
    setLoading(true);
    setErr("");
    const p = new URLSearchParams({ offset: String(offset) });
    if (q.trim()) p.set("q", q.trim());
    if (category) p.set("category", category);
    if (inStock) p.set("inStock", "1");
    if (first.current) p.set("withCategories", "1");
    try {
      const r = await fetch(`/api/products/browse?${p}`);
      if (!r.ok) throw new Error();
      const data: BrowseResult = await r.json();
      if (data.categories) {
        setCats(data.categories);
        first.current = false;
      }
      setItems((prev) => (offset ? [...prev, ...data.items] : data.items));
      setTotal(data.total);
    } catch {
      setErr("讀取失敗，請重試");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(0), q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, inStock]);

  // Esc 關閉
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const addedCount = [...addedIds.values()].filter((n) => n > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-5xl flex-col bg-white shadow-xl sm:max-h-[90vh] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="瀏覽商品"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="font-semibold">瀏覽商品</h2>
          <button type="button" className="btn-primary" onClick={onClose}>
            完成{addedCount ? `（已加入 ${addedCount} 項）` : ""}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-gray-200 px-4 py-3">
          <input
            autoFocus
            className="input min-w-0 basis-full sm:basis-auto sm:flex-1"
            placeholder="名稱、編號、品牌、規格"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="input w-auto min-w-0 flex-1 sm:flex-none" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">全部分類</option>
            {cats?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}（{c.count}）</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
            只看有庫存
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          {err && <p className="p-4 text-sm text-red-600">{err}</p>}
          {!loading && !items.length && !err && <p className="p-8 text-center text-sm text-gray-500">沒有符合的商品</p>}
          <ul className="divide-y divide-gray-100">
            {items.map((p) => {
              const price = business && p.businessPrice > 0 ? p.businessPrice : p.retailPrice;
              const free = p.stockQty - p.reservedQty;
              const added = addedIds.get(p.id) ?? 0;
              const expanded = open === p.id;
              return (
                <li key={p.id} className="px-4 py-2">
                  <div className="flex items-start gap-3">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(expanded ? null : p.id)}>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-gray-500">
                        {p.sku}
                        {p.categoryName && `・${p.categoryName}`}
                        {p.brand && `・${p.brand}`}
                        {p.trackSerial && "・序號"}
                      </div>
                      {p.spec && (
                        <div className={`mt-0.5 text-xs text-gray-700 ${expanded ? "whitespace-pre-wrap" : "line-clamp-1"}`}>{p.spec}</div>
                      )}
                    </button>
                    <div className="hidden w-28 shrink-0 text-right text-xs sm:block">
                      <div className={p.stockQty <= 0 ? "text-red-600" : "text-gray-900"}>庫存 {p.stockQty} {p.unit}</div>
                      {p.reservedQty > 0 && <div className="text-amber-700">預訂 {p.reservedQty}・可用 {free}</div>}
                    </div>
                    <div className="hidden w-28 shrink-0 text-right text-xs sm:block">
                      <div className="text-sm font-semibold">{price ? money(price) : "未定價"}</div>
                      {business && p.businessPrice > 0 && p.retailPrice > 0 && <div className="text-gray-500">零售 {money(p.retailPrice)}</div>}
                      {p.avgCost !== null && <div className="text-gray-500">成本 {money(p.avgCost)}</div>}
                    </div>
                    <button
                      type="button"
                      className={`shrink-0 ${added ? "btn" : "btn-primary"}`}
                      onClick={() => onAdd(p)}
                    >
                      {added ? `再加 ✓${added}` : "加入"}
                    </button>
                  </div>
                  {/* 手機：庫存與價格放在下面 */}
                  <div className="mt-1 flex gap-3 text-xs sm:hidden">
                    <span className={p.stockQty <= 0 ? "text-red-600" : ""}>庫存 {p.stockQty}</span>
                    {p.reservedQty > 0 && <span className="text-amber-700">可用 {free}</span>}
                    <span className="font-semibold">{price ? money(price) : "未定價"}</span>
                    {p.avgCost !== null && <span className="text-gray-500">成本 {money(p.avgCost)}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {items.length < total && (
            <div className="p-4 text-center">
              <button type="button" className="btn" disabled={loading} onClick={() => load(items.length)}>
                {loading ? "讀取中…" : `顯示更多（${items.length}／${total}）`}
              </button>
            </div>
          )}
          {loading && !items.length && <p className="p-8 text-center text-sm text-gray-500">讀取中…</p>}
        </div>
      </div>
    </div>
  );
}
