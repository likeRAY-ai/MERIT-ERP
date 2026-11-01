"use client";

import { useFormAction } from "@/lib/useFormAction";
import { adjustProductStock } from "../actions";
import { Field, FormMessage } from "@/components/FormState";

export default function AdjustForm({ productId }: { productId: number }) {
  const [state, action, pending] = useFormAction(adjustProductStock.bind(null, productId), { resetOnSuccess: true });
  return (
    <form onSubmit={action} className="card space-y-3">
      <h2 className="font-semibold">庫存調整</h2>
      <p className="text-xs text-gray-500">用於盤點差異、報廢、贈品等。增加輸入正數，減少輸入負數。</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="調整數量">
          <input name="qty" className="input" inputMode="numeric" placeholder="例如 -1" required />
        </Field>
        <Field label="原因" className="sm:col-span-2">
          <input name="note" className="input" placeholder="例如：盤點短少" required />
        </Field>
      </div>
      <FormMessage state={state} />
      <button className="btn" disabled={pending}>{pending ? "處理中…" : "確認調整"}</button>
    </form>
  );
}
