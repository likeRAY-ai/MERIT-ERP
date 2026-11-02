"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/useFormAction";
import { FormMessage } from "@/components/FormState";
import { money } from "@/lib/format";
import AssetChooser, { type FreeAsset, type Picked } from "../AssetChooser";
import { contractAction } from "../actions";

function useOp() {
  return useFormAction(contractAction);
}

export function BillButton({ id, label, due }: { id: number; label: string; due: boolean }) {
  const [state, action, pending] = useOp();
  return (
    <form onSubmit={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="bill" />
      <button className={due ? "btn-primary" : "btn"} disabled={pending}>{pending ? "產生中…" : label}</button>
      <FormMessage state={state} />
    </form>
  );
}

export function DepositButton({ id, amount }: { id: number; amount: number }) {
  const [state, action, pending] = useOp();
  return (
    <form onSubmit={action} className="inline-block space-y-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="deposit" />
      <button className="btn" disabled={pending}>登記收到押金 {money(amount)}</button>
      <FormMessage state={state} />
    </form>
  );
}

export type ItemRow = {
  id: number;
  code: string;
  name: string;
  assetId: number;
  rate: number;
  start: string;
  returned: string | null;
};

export function ItemsTable({
  id,
  items,
  daily,
  active,
  today,
  canEdit,
}: {
  id: number;
  items: ItemRow[];
  daily: boolean;
  active: boolean;
  today: string;
  canEdit: boolean;
}) {
  const [state, action, pending] = useOp();
  const [sel, setSel] = useState<number[]>([]);
  const open = items.filter((i) => !i.returned);
  return (
    <form
      onSubmit={(e) => {
        if (!window.confirm(`確定收回 ${sel.length} 台設備？`)) {
          e.preventDefault();
          return;
        }
        action(e);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="return" />
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {active && canEdit && <th className="w-8" />}
              <th>設備</th><th className="text-right">{daily ? "日租" : "月租"}</th><th>出租日</th><th>收回日</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={i.returned ? "text-gray-400" : ""}>
                {active && canEdit && (
                  <td>
                    {!i.returned && (
                      <input
                        type="checkbox"
                        name="itemId"
                        value={i.id}
                        className="h-4 w-4"
                        checked={sel.includes(i.id)}
                        onChange={(e) => setSel(e.target.checked ? [...sel, i.id] : sel.filter((x) => x !== i.id))}
                      />
                    )}
                  </td>
                )}
                <td>
                  <a href={`/rentals/assets/${i.assetId}`} className="link font-mono">{i.code}</a> {i.name}
                </td>
                <td className="text-right">{money(i.rate)}</td>
                <td className="whitespace-nowrap">{i.start}</td>
                <td className="whitespace-nowrap">{i.returned ?? "出租中"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {active && canEdit && open.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="label">收回日期</span>
            <input type="date" name="date" defaultValue={today} className="input" />
          </label>
          <button className="btn" disabled={pending || !sel.length}>收回選取的設備（{sel.length}）</button>
        </div>
      )}
      <FormMessage state={state} />
    </form>
  );
}

export function AddItemsForm({ id, assets, daily, today }: { id: number; assets: FreeAsset[]; daily: boolean; today: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [state, action, pending] = useOp();
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>＋ 加租設備</button>;
  return (
    <form onSubmit={action} className="card space-y-3">
      <h3 className="font-semibold">加租設備</h3>
      <p className="text-xs text-gray-500">從開始日期起出租，下一期帳單起一併收費。</p>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="add" />
      <input type="hidden" name="items" value={JSON.stringify(picked)} />
      <AssetChooser assets={assets} daily={daily} picked={picked} setPicked={setPicked} />
      <label className="block text-sm">
        <span className="label">開始日期</span>
        <input type="date" name="date" defaultValue={today} className="input max-w-xs" />
      </label>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending || !picked.length}>加租 {picked.length} 台</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>取消</button>
      </div>
    </form>
  );
}

export function EndForm({ id, today, refundable }: { id: number; today: string; refundable: number | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useOp();
  if (!open) return <button type="button" className="btn-danger" onClick={() => setOpen(true)}>結束租約</button>;
  return (
    <form
      onSubmit={(e) => {
        if (!window.confirm("確定結束租約？所有設備會收回。")) {
          e.preventDefault();
          return;
        }
        action(e);
      }}
      className="card space-y-3 border-red-200"
    >
      <h3 className="font-semibold text-red-700">結束租約</h3>
      <p className="text-sm text-gray-600">所有未收回的設備會一併收回並改為「可出租」。請先確認最後一期租金已開帳。</p>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="end" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="label">結束日期</span>
          <input type="date" name="date" defaultValue={today} className="input" />
        </label>
        {refundable !== null && (
          <label className="block text-sm">
            <span className="label">退還押金（最多 {money(refundable)}，可扣損壞費用）</span>
            <input name="depositRefund" defaultValue={refundable} className="input" inputMode="numeric" />
          </label>
        )}
      </div>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <button className="btn-danger" disabled={pending}>{pending ? "處理中…" : "確認結束"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>取消</button>
      </div>
    </form>
  );
}
