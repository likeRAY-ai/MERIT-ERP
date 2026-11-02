"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/useFormAction";
import { FormMessage } from "@/components/FormState";
import { money } from "@/lib/format";
import { updateSaleInfoAction, voidSaleAction } from "../actions";

// 補登發票號碼、已收金額
export function SaleInfoForm({ id, invoiceNo, paidAmount, total }: { id: number; invoiceNo: string | null; paidAmount: number; total: number }) {
  const [state, action, pending] = useFormAction(updateSaleInfoAction);
  const [paid, setPaid] = useState(String(paidAmount));
  return (
    <form onSubmit={action} className="no-print card space-y-3">
      <h2 className="font-semibold">發票與收款</h2>
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">發票號碼</span>
          <input name="invoiceNo" defaultValue={invoiceNo ?? ""} className="input uppercase" maxLength={12} placeholder="例如 AB12345678" />
        </label>
        <label className="block">
          <span className="label">已收金額</span>
          <input name="paidAmount" value={paid} onChange={(e) => setPaid(e.target.value.replace(/\D/g, ""))} className="input" inputMode="numeric" />
        </label>
        <div className="flex items-end gap-2">
          <button type="button" className="btn" onClick={() => setPaid(String(total))}>收齊 {money(total)}</button>
        </div>
      </div>
      <FormMessage state={state} />
      <button className="btn-primary" disabled={pending}>{pending ? "儲存中…" : "儲存"}</button>
    </form>
  );
}

// 作廢（老闆）
export function VoidSaleForm({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useFormAction(voidSaleAction);
  if (!open) {
    return (
      <button type="button" className="btn-danger no-print" onClick={() => setOpen(true)}>
        作廢這張銷貨單
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        if (!window.confirm("確定作廢？庫存、序號會還原，此動作無法復原。")) {
          e.preventDefault();
          return;
        }
        action(e);
      }}
      className="no-print card space-y-3 border-red-200"
    >
      <h2 className="font-semibold text-red-700">作廢銷貨單</h2>
      <p className="text-sm text-gray-600">作廢後商品庫存加回、序號回到「在庫」，若是訂單出貨，訂單會回到「待出貨」。</p>
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="label">作廢原因 *</span>
        <input name="reason" className="input" required placeholder="例如：開錯客戶、客戶取消" />
      </label>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <button className="btn-danger" disabled={pending}>{pending ? "處理中…" : "確認作廢"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>取消</button>
      </div>
    </form>
  );
}
