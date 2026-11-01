"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/useFormAction";
import Link from "next/link";
import LineItems, { type Line } from "@/components/LineItems";
import { Field, FormMessage } from "@/components/FormState";
import { submitPurchase } from "../actions";

export default function PurchaseForm({
  suppliers,
  defaultSupplier,
  today,
}: {
  suppliers: { id: number; name: string }[];
  defaultSupplier?: number;
  today: string;
}) {
  const [state, action, pending] = useFormAction(submitPurchase);
  const [lines, setLines] = useState<Line[]>([]);

  const missingSerial = lines.find((l) => l.product.trackSerial && l.serials.length === 0);
  const items = lines.map((l) => ({ productId: l.product.id, qty: l.qty, unitCost: l.price, serials: l.serials }));

  return (
    <form onSubmit={action}
      className="space-y-4"
      onKeyDown={(e) => {
        // 避免掃描條碼的 Enter 送出整張單
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      <div className="card grid gap-3 sm:grid-cols-3">
        <Field label="供應商 *">
          <select name="supplierId" defaultValue={defaultSupplier ?? ""} className="input" required>
            <option value="">請選擇</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {suppliers.length === 0 && (
            <span className="mt-1 block text-xs text-amber-700">
              還沒有供應商，請先<Link href="/suppliers/new" className="link">新增供應商</Link>
            </span>
          )}
        </Field>
        <Field label="進貨日期">
          <input type="date" name="date" defaultValue={today} className="input" />
        </Field>
        <Field label="備註">
          <input name="note" className="input" placeholder="例如：廠商發票號碼" />
        </Field>
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">進貨商品</h2>
        <LineItems mode="purchase" lines={lines} setLines={setLines} />
      </div>

      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <FormMessage state={state} />
      {missingSerial && <p className="text-sm text-amber-700">「{missingSerial.product.name}」需要輸入序號</p>}
      <button className="btn-primary w-full py-3 text-base sm:w-auto" disabled={pending || !lines.length || !!missingSerial}>
        {pending ? "處理中…" : "確認進貨"}
      </button>
    </form>
  );
}
