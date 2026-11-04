"use client";

import { useState } from "react";
import { money } from "@/lib/format";

export type FreeAsset = { id: number; code: string; name: string; monthlyRate: number; dailyRate: number };
export type Picked = { assetId: number; rate: number };

// 勾選可出租的設備並設定每台租金
export default function AssetChooser({
  assets,
  daily,
  picked,
  setPicked,
  rateHint,
}: {
  assets: FreeAsset[];
  daily: boolean;
  picked: Picked[];
  setPicked: (p: Picked[]) => void;
  rateHint?: Record<string, number>; // 報價單上的租金（依設備名稱）
}) {
  const [q, setQ] = useState("");
  const shown = q ? assets.filter((a) => a.code.includes(q.toUpperCase()) || a.name.includes(q)) : assets;
  const toggle = (a: FreeAsset) =>
    setPicked(
      picked.some((p) => p.assetId === a.id)
        ? picked.filter((p) => p.assetId !== a.id)
        : [...picked, { assetId: a.id, rate: rateHint?.[a.name] ?? (daily ? a.dailyRate : a.monthlyRate) }],
    );
  if (!assets.length) return <p className="text-sm text-amber-700">目前沒有可出租的設備，請先到「出租設備」新增。</p>;
  return (
    <div className="space-y-2">
      <input className="input" placeholder="篩選設備編號、名稱" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
        {shown.map((a) => {
          const p = picked.find((x) => x.assetId === a.id);
          return (
            <li key={a.id} className={`flex items-center gap-3 px-3 py-2 ${p ? "bg-brand-50" : ""}`}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={!!p} onChange={() => toggle(a)} />
                <span className="min-w-0">
                  <span className="font-mono text-sm">{a.code}</span> <span className="text-sm">{a.name}</span>
                  <span className="block text-xs text-gray-500">
                    預設 月租 {money(a.monthlyRate)}・日租 {money(a.dailyRate)}
                  </span>
                </span>
              </label>
              {p && (
                <label className="flex shrink-0 items-center gap-1 text-xs text-gray-600">
                  {daily ? "日租" : "月租"}
                  <input
                    className="input w-24 text-right"
                    inputMode="numeric"
                    value={p.rate}
                    onChange={(e) =>
                      setPicked(
                        picked.map((x) =>
                          x.assetId === a.id ? { ...x, rate: parseInt(e.target.value.replace(/\D/g, "") || "0", 10) } : x,
                        ),
                      )
                    }
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
