"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/useFormAction";
import { FormMessage } from "@/components/FormState";
import { calcTotals, money, type TaxType } from "@/lib/format";
import AssetChooser, { type FreeAsset, type Picked } from "../AssetChooser";
import { contractAction } from "../actions";

function useOp() {
  return useFormAction(contractAction);
}

export type BillLine = { id: number; label: string; rate: number };

// 產生本期帳單；可展開「調整本期金額」：改單價、加收、折讓（只影響這一張帳單）
export function BillButton({
  id,
  label,
  due,
  lines,
  units,
  unitLabel,
  taxType,
}: {
  id: number;
  label: string;
  due: boolean;
  lines: BillLine[];
  units: number;
  unitLabel: string;
  taxType: TaxType;
}) {
  const [state, action, pending] = useOp();
  const [open, setOpen] = useState(false);
  const [rates, setRates] = useState<Record<number, string>>({});
  const [extraLabel, setExtraLabel] = useState("");
  const [extra, setExtra] = useState("");
  const [discLabel, setDiscLabel] = useState("");
  const [disc, setDisc] = useState("");
  const rateOf = (l: BillLine) => (rates[l.id] === undefined || rates[l.id] === "" ? l.rate : Number(rates[l.id]));
  const sum = lines.reduce((a, l) => a + rateOf(l) * units, 0) + (Number(extra) || 0) - (Number(disc) || 0);
  const t = calcTotals(Math.max(sum, 0), taxType);
  const adjust = open
    ? JSON.stringify({
        rates: Object.fromEntries(lines.filter((l) => rateOf(l) !== l.rate).map((l) => [l.id, rateOf(l)])),
        extra: Number(extra) ? { label: extraLabel, amount: Number(extra) } : null,
        discount: Number(disc) ? { label: discLabel, amount: Number(disc) } : null,
      })
    : "";
  const digits = (v: string) => v.replace(/\D/g, "");
  const excl = taxType === "EXCLUDED";

  return (
    <form onSubmit={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="bill" />
      <input type="hidden" name="adjust" value={adjust} />
      {open && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-xs text-gray-600">
            這裡的調整只影響這一期的帳單，不會改到租約。要長期調整租金，請用「出租設備」的「調整租金」。
            {excl && "以下金額皆為未稅。"}
          </p>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>設備</th><th className="hidden text-right sm:table-cell">原單價</th><th className="text-right">本期單價</th><th className="hidden text-right sm:table-cell">金額（×{units}{unitLabel === "天" ? "天" : "月"}）</th></tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="min-w-32">
                      {l.label}
                      <div className="text-xs text-gray-500 sm:hidden">原 {money(l.rate)}・小計 {money(rateOf(l) * units)}</div>
                    </td>
                    <td className="hidden text-right text-gray-500 sm:table-cell">{money(l.rate)}</td>
                    <td className="text-right">
                      <input
                        value={rates[l.id] ?? String(l.rate)}
                        onChange={(e) => setRates({ ...rates, [l.id]: digits(e.target.value) })}
                        className="input ml-auto w-20 text-right sm:w-24"
                        inputMode="numeric"
                        aria-label={`${l.label} 本期單價`}
                      />
                    </td>
                    <td className="hidden text-right sm:table-cell">{money(rateOf(l) * units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex gap-2">
              <input value={extraLabel} onChange={(e) => setExtraLabel(e.target.value)} placeholder="加收項目（例如：維修費、運費）" className="input min-w-0 flex-1" />
              <input value={extra} onChange={(e) => setExtra(digits(e.target.value))} placeholder="金額" className="input w-24 text-right" inputMode="numeric" aria-label="加收金額" />
            </div>
            <div className="flex gap-2">
              <input value={discLabel} onChange={(e) => setDiscLabel(e.target.value)} placeholder="折讓原因（例如：故障停機 5 天）" className="input min-w-0 flex-1" />
              <input value={disc} onChange={(e) => setDisc(digits(e.target.value))} placeholder="折讓" className="input w-24 text-right" inputMode="numeric" aria-label="折讓金額" />
            </div>
          </div>
          <p className="text-right text-sm">
            {excl ? <>未稅 {money(t.subtotal)}＋稅 {money(t.tax)}＝</> : "本期應收 "}
            <b className="text-base">{money(t.total)}</b>
            {sum < 0 && <span className="ml-2 text-red-600">折讓不可大於租金</span>}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={due ? "btn-primary" : "btn"} disabled={pending || sum < 0}>{pending ? "產生中…" : label}</button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setOpen(!open);
            setRates({});
            setExtra("");
            setDisc("");
          }}
        >
          {open ? "取消調整" : "調整本期金額"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

// 調整租金：下一期起生效，並留下紀錄
export function RatesForm({ id, items, daily }: { id: number; items: { id: number; label: string; rate: number }[]; daily: boolean }) {
  const [state, action, pending] = useOp();
  const [open, setOpen] = useState(false);
  const [rates, setRates] = useState<Record<number, string>>({});
  if (!items.length) return null;
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>調整租金</button>;
  const changes = items
    .filter((i) => rates[i.id] !== undefined && rates[i.id] !== "" && Number(rates[i.id]) !== i.rate)
    .map((i) => ({ itemId: i.id, rate: Number(rates[i.id]) }));
  return (
    <form onSubmit={action} className="card w-full min-w-0 space-y-3">
      <h3 className="font-semibold">調整租金</h3>
      <p className="text-xs text-gray-500">修改後從下一張帳單（尚未開帳的期間）起生效，已開出的帳單不變。每次調整都會留下紀錄。</p>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="rates" />
      <input type="hidden" name="rates" value={JSON.stringify(changes)} />
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>設備</th><th className="hidden text-right sm:table-cell">目前{daily ? "日租" : "月租"}</th><th className="text-right">新{daily ? "日租" : "月租"}</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="min-w-32">
                  {i.label}
                  <div className="text-xs text-gray-500 sm:hidden">目前 {money(i.rate)}</div>
                </td>
                <td className="hidden text-right text-gray-500 sm:table-cell">{money(i.rate)}</td>
                <td className="text-right">
                  <input
                    value={rates[i.id] ?? String(i.rate)}
                    onChange={(e) => setRates({ ...rates, [i.id]: e.target.value.replace(/\D/g, "") })}
                    className="input ml-auto w-20 text-right sm:w-28"
                    inputMode="numeric"
                    aria-label={`${i.label} 新租金`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="block text-sm">
        <span className="label">調整原因（選填）</span>
        <input name="reason" maxLength={200} placeholder="例如：續約調降、合約到期調漲" className="input" />
      </label>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending || !changes.length}>{pending ? "儲存中…" : `儲存（${changes.length} 台）`}</button>
        <button type="button" className="btn" onClick={() => { setOpen(false); setRates({}); }}>取消</button>
      </div>
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
