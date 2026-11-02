"use client";

import { useFormAction } from "@/lib/useFormAction";
import { Field, FormMessage } from "@/components/FormState";
import { submitAsset, submitAssetFromStock } from "./actions";

export type AssetData = {
  id: number;
  code: string;
  name: string;
  status: string;
  monthlyRate: number;
  dailyRate: number;
  cost: number;
  acquiredAt: string;
  note: string | null;
};

export function AssetForm({ asset, showCost }: { asset?: AssetData; showCost: boolean }) {
  const [state, action, pending] = useFormAction(submitAsset.bind(null, asset?.id ?? null));
  return (
    <form onSubmit={action} className="card space-y-3">
      <h2 className="font-semibold">{asset ? "設備資料" : "新增出租設備"}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="設備編號／序號 *">
          <input name="code" defaultValue={asset?.code} className="input uppercase" required />
        </Field>
        <Field label="名稱 *" className="lg:col-span-2">
          <input name="name" defaultValue={asset?.name} className="input" required placeholder="例如：文書機 i5/8G/256G" />
        </Field>
        <Field label="預設月租">
          <input name="monthlyRate" defaultValue={asset?.monthlyRate ?? ""} className="input" inputMode="numeric" />
        </Field>
        <Field label="預設日租">
          <input name="dailyRate" defaultValue={asset?.dailyRate ?? ""} className="input" inputMode="numeric" />
        </Field>
        {showCost ? (
          <Field label="設備成本">
            <input name="cost" defaultValue={asset?.cost ?? ""} className="input" inputMode="numeric" />
          </Field>
        ) : (
          <input type="hidden" name="cost" value={asset?.cost ?? 0} />
        )}
        <Field label="取得日期">
          <input type="date" name="acquiredAt" defaultValue={asset?.acquiredAt} className="input" />
        </Field>
        {asset && asset.status !== "RENTED" && (
          <Field label="狀態">
            <select name="status" defaultValue={asset.status} className="input">
              <option value="AVAILABLE">可出租</option>
              <option value="MAINTENANCE">維修中</option>
              <option value="RETIRED">停用</option>
            </select>
          </Field>
        )}
        <Field label="備註" className="sm:col-span-2 lg:col-span-3">
          <input name="note" defaultValue={asset?.note ?? ""} className="input" placeholder="例如：配件、外觀狀況" />
        </Field>
      </div>
      <FormMessage state={state} />
      <button className="btn-primary" disabled={pending}>{pending ? "儲存中…" : asset ? "儲存" : "新增設備"}</button>
    </form>
  );
}

export function AssetFromStockForm() {
  const [state, action, pending] = useFormAction(submitAssetFromStock);
  return (
    <form onSubmit={action} className="card space-y-3">
      <h2 className="font-semibold">從庫存轉入</h2>
      <p className="text-xs text-gray-500">把庫存中有序號的機器轉成出租設備：庫存減 1，序號狀態改為「出租設備」，成本帶入平均成本。</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="序號 *">
          <input name="serial" className="input uppercase" required placeholder="掃描或輸入" />
        </Field>
        <Field label="名稱（空白用商品名稱）">
          <input name="name" className="input" />
        </Field>
        <Field label="預設月租">
          <input name="monthlyRate" className="input" inputMode="numeric" />
        </Field>
        <Field label="預設日租">
          <input name="dailyRate" className="input" inputMode="numeric" />
        </Field>
      </div>
      <FormMessage state={state} />
      <button className="btn" disabled={pending}>{pending ? "處理中…" : "轉入出租設備"}</button>
    </form>
  );
}
