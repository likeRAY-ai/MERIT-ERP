"use client";

// 進貨單／銷貨單共用的商品明細編輯器
// - 可輸入名稱、編號、條碼搜尋；條碼槍掃描後按 Enter 會自動加入
// - 銷貨時直接掃描序號，會自動帶出商品並登記該序號
// - 序號商品的數量 = 序號個數
import { useEffect, useRef, useState } from "react";
import type { ProductHit } from "@/app/api/products/search/route";
import { money } from "@/lib/format";

export type Line = {
  key: string;
  product: ProductHit;
  qty: number;
  price: number;
  serials: string[];
};

type Mode = "purchase" | "sale";

const norm = (s: string) => s.trim().toUpperCase();

function defaultPrice(p: ProductHit, mode: Mode, business: boolean) {
  if (mode === "purchase") return p.avgCost ?? 0;
  return business && p.businessPrice > 0 ? p.businessPrice : p.retailPrice;
}

export default function LineItems({
  mode,
  lines,
  setLines,
  business = false,
}: {
  mode: Mode;
  lines: Line[];
  setLines: (fn: (l: Line[]) => Line[]) => void;
  business?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  async function search(text: string): Promise<ProductHit[]> {
    if (!text.trim()) return [];
    setLoading(true);
    try {
      const r = await fetch(`/api/products/search?q=${encodeURIComponent(text.trim())}`);
      if (r.status === 401) {
        setMsg("登入已逾時，請重新整理頁面");
        return [];
      }
      return await r.json();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => setHits(await search(q)), 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  function add(p: ProductHit) {
    setMsg("");
    // 銷貨時掃描到的是序號：加到該商品的明細
    if (mode === "sale" && p.matchedSerial) {
      const sn = p.matchedSerial;
      if (lines.some((l) => l.serials.includes(sn))) {
        setMsg(`序號 ${sn} 已在單據中`);
      } else {
        setLines((ls) => {
          const i = ls.findIndex((l) => l.product.id === p.id);
          if (i >= 0) {
            const l = ls[i];
            const serials = [...l.serials, sn];
            return ls.map((x, j) => (j === i ? { ...l, serials, qty: serials.length } : x));
          }
          return [...ls, { key: crypto.randomUUID(), product: p, qty: 1, price: defaultPrice(p, mode, business), serials: [sn] }];
        });
      }
    } else {
      setLines((ls) => {
        const i = ls.findIndex((l) => l.product.id === p.id);
        // 一般商品重複加入就增加數量
        if (i >= 0 && !p.trackSerial) return ls.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x));
        if (i >= 0) return ls;
        return [
          ...ls,
          {
            key: crypto.randomUUID(),
            product: p,
            qty: p.trackSerial ? 0 : 1,
            price: defaultPrice(p, mode, business),
            serials: [],
          },
        ];
      });
    }
    setQ("");
    setHits([]);
    inputRef.current?.focus();
  }

  async function onEnter() {
    const list = hits.length ? hits : await search(q);
    if (list.length === 1 || (list.length && (list[0].matchedSerial || norm(list[0].sku) === norm(q)))) {
      add(list[0]);
    } else if (!list.length) {
      setMsg(`找不到「${q}」`);
    } else {
      setHits(list);
    }
  }

  const update = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder={mode === "sale" ? "搜尋商品，或直接掃描條碼／序號" : "搜尋商品名稱、編號，或掃描條碼"}
          className="input"
          autoComplete="off"
        />
        {loading && <span className="absolute top-2.5 right-3 text-xs text-gray-400">搜尋中…</span>}
        {hits.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {hits.map((h) => (
              <li key={`${h.id}-${h.matchedSerial ?? ""}`}>
                <button
                  type="button"
                  onClick={() => add(h)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50"
                >
                  <span>
                    {h.name}
                    <span className="ml-1 text-xs text-gray-500">{h.sku}</span>
                    {h.matchedSerial && <span className="badge ml-1 bg-green-100 text-green-800">序號 {h.matchedSerial}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">庫存 {h.stockQty}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {msg && <p className="text-sm text-amber-700">{msg}</p>}

      {lines.length === 0 && <p className="py-6 text-center text-sm text-gray-500">尚未加入商品</p>}

      {lines.map((l) => (
        <LineCard key={l.key} line={l} mode={mode} onChange={(p) => update(l.key, p)} onRemove={() => remove(l.key)} />
      ))}

      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
        <span className="text-sm text-gray-600">共 {lines.reduce((s, l) => s + l.qty, 0)} 件</span>
        <span className="text-lg font-bold">合計 {money(total)}</span>
      </div>
    </div>
  );
}

function LineCard({
  line: l,
  mode,
  onChange,
  onRemove,
}: {
  line: Line;
  mode: Mode;
  onChange: (p: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const [sn, setSn] = useState("");
  const [available, setAvailable] = useState<string[] | null>(null);
  const [err, setErr] = useState("");
  const p = l.product;

  useEffect(() => {
    if (mode === "sale" && p.trackSerial) {
      fetch(`/api/products/${p.id}/serials`)
        .then((r) => r.json())
        .then(setAvailable)
        .catch(() => setAvailable([]));
    }
  }, [mode, p.id, p.trackSerial]);

  function addSerials(text: string) {
    setErr("");
    const list = text.split(/[\s,，;；]+/).map(norm).filter(Boolean);
    const next = [...l.serials];
    for (const s of list) {
      if (next.includes(s)) {
        setErr(`序號 ${s} 重複`);
        continue;
      }
      if (mode === "sale" && available && !available.includes(s)) {
        setErr(`序號 ${s} 不在此商品的庫存中`);
        continue;
      }
      next.push(s);
    }
    onChange({ serials: next, qty: next.length });
    setSn("");
  }

  function toggle(s: string) {
    const next = l.serials.includes(s) ? l.serials.filter((x) => x !== s) : [...l.serials, s];
    onChange({ serials: next, qty: next.length });
  }

  const lowStock = mode === "sale" && l.qty > p.stockQty;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{p.name}</div>
          <div className="text-xs text-gray-500">
            {p.sku}・庫存 {p.stockQty}
            {mode === "sale" && p.avgCost !== null && `・成本 ${money(p.avgCost)}`}
          </div>
        </div>
        <button type="button" onClick={onRemove} className="text-sm text-red-600" aria-label="移除">
          移除
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="text-xs text-gray-600">
          數量
          <input
            className="input mt-0.5"
            inputMode="numeric"
            value={l.qty || ""}
            readOnly={p.trackSerial}
            title={p.trackSerial ? "序號商品的數量依序號個數自動計算" : undefined}
            onChange={(e) => onChange({ qty: Math.max(0, parseInt(e.target.value || "0", 10) || 0) })}
          />
        </label>
        <label className="text-xs text-gray-600">
          {mode === "purchase" ? "進價" : "售價"}
          <input
            className="input mt-0.5"
            inputMode="numeric"
            value={l.price}
            onChange={(e) => onChange({ price: Math.max(0, parseInt(e.target.value.replace(/\D/g, "") || "0", 10)) })}
          />
        </label>
        <div className="text-right text-xs text-gray-600">
          小計
          <div className="mt-2 text-base font-semibold text-gray-900">{money(l.qty * l.price)}</div>
        </div>
      </div>
      {lowStock && <p className="mt-1 text-xs text-red-600">庫存不足</p>}

      {p.trackSerial && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="輸入或掃描序號，按 Enter 加入（可一次貼上多個）"
              value={sn}
              onChange={(e) => setSn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSerials(sn);
                }
              }}
              onPaste={(e) => {
                const t = e.clipboardData.getData("text");
                if (/[\s,]/.test(t.trim())) {
                  e.preventDefault();
                  addSerials(t);
                }
              }}
            />
            <button type="button" className="btn" onClick={() => addSerials(sn)}>
              加入
            </button>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          {l.serials.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {l.serials.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggle(s)}
                  className="badge bg-brand-100 font-mono text-brand-800"
                  title="點一下移除"
                >
                  {s} ✕
                </button>
              ))}
            </div>
          )}
          {mode === "sale" && available && available.filter((s) => !l.serials.includes(s)).length > 0 && (
            <div>
              <div className="mb-1 text-xs text-gray-500">在庫序號（點選加入）：</div>
              <div className="flex flex-wrap gap-1">
                {available
                  .filter((s) => !l.serials.includes(s))
                  .map((s) => (
                    <button type="button" key={s} onClick={() => toggle(s)} className="badge bg-gray-100 font-mono text-gray-700 hover:bg-gray-200">
                      ＋ {s}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
