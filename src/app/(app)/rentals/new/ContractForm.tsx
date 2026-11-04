"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/useFormAction";
import { Field, FormMessage } from "@/components/FormState";
import { money, calcTotals, type TaxType } from "@/lib/format";
import AssetChooser, { type FreeAsset, type Picked } from "../AssetChooser";
import { submitContract } from "../actions";

type C = {
  id: number;
  name: string;
  type: "PERSONAL" | "COMPANY";
  phone: string | null;
  mobile: string | null;
  contact: string | null;
  address: string | null;
  taxId: string | null;
  code: string | null;
  taxType: TaxType | null;
};

type Mode = "MONTH" | "PREPAY" | "DAY";

// 由租賃報價單轉入的資料
export type QuoteSeed = {
  id: number;
  number: string;
  customerId: number | null;
  customerName: string | null;
  contact: string | null;
  phone: string | null;
  address: string | null;
  salespersonId: number | null;
  taxType: TaxType;
  mode: Mode;
  months: number;
  startDate: string;
  endDate: string;
  deposit: number;
  note: string | null;
  rent: { name: string; qty: number; rate: number }[];
  fees: { name: string; qty: number; rate: number }[];
};

export default function ContractForm({
  customers,
  staff,
  assets,
  today,
  uid,
  defaultCustomer,
  quote,
}: {
  customers: C[];
  staff: { id: number; name: string }[];
  assets: FreeAsset[];
  today: string;
  uid: number;
  defaultCustomer?: number;
  quote?: QuoteSeed;
}) {
  const [state, action, pending] = useFormAction(submitContract);
  const init = customers.find((c) => c.id === defaultCustomer);
  const [customerId, setCustomerId] = useState<number | "">(init?.id ?? "");
  const [filter, setFilter] = useState(quote && !quote.customerId ? (quote.customerName ?? "") : "");
  const [contact, setContact] = useState(quote?.contact ?? init?.contact ?? "");
  const [phone, setPhone] = useState(quote?.phone ?? init?.phone ?? init?.mobile ?? "");
  const [address, setAddress] = useState(quote?.address ?? init?.address ?? "");
  const [taxType, setTaxType] = useState<TaxType>(quote?.taxType ?? (init ? (init.taxType ?? (init.type === "COMPANY" ? "EXCLUDED" : "INCLUDED")) : "INCLUDED"));
  const [payment, setPayment] = useState(init?.type === "COMPANY" ? "CREDIT" : "TRANSFER");
  const [mode, setMode] = useState<Mode>(quote?.mode ?? "MONTH");
  const [months, setMonths] = useState(quote?.months ?? 3);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [deposit, setDeposit] = useState(quote?.deposit ? String(quote.deposit) : "");
  const rateHint = quote ? Object.fromEntries(quote.rent.map((r) => [r.name, r.rate])) : undefined;
  const daily = mode === "DAY";

  const shown = filter
    ? customers.filter((c) => c.name.includes(filter) || c.phone?.includes(filter) || c.mobile?.includes(filter) || c.code?.includes(filter))
    : customers;

  function pick(id: number | "") {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    setPayment(c?.type === "COMPANY" ? "CREDIT" : "TRANSFER");
    // 從報價單轉入時保留報價上的聯絡資料與稅別
    if (quote) return;
    setContact(c?.contact ?? "");
    setPhone(c?.phone ?? c?.mobile ?? "");
    setAddress(c?.address ?? "");
    if (c) setTaxType(c.taxType ?? (c.type === "COMPANY" ? "EXCLUDED" : "INCLUDED"));
  }

  function changeMode(m: Mode) {
    // 切換按月／按天時改用設備的預設租金
    if ((m === "DAY") !== daily) {
      setPicked(picked.map((p) => {
        const a = assets.find((x) => x.id === p.assetId)!;
        return { ...p, rate: m === "DAY" ? a.dailyRate : a.monthlyRate };
      }));
    }
    setMode(m);
  }

  const perPeriod = picked.reduce((s, p) => s + p.rate, 0) * (mode === "PREPAY" ? months : 1);
  const t = calcTotals(perPeriod, taxType);

  return (
    <form
      onSubmit={action}
      className="space-y-4"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      {quote && <input type="hidden" name="quoteId" value={quote.id} />}
      {quote && !quote.customerId && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          報價單上的客戶「{quote.customerName}」尚未建檔。請在下方選擇客戶；若還沒有資料，請先
          <a href="/customers/new" target="_blank" className="link">新增客戶</a>，再重新整理此頁。
        </p>
      )}
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="客戶 *">
          <input className="input mb-1" placeholder="輸入名稱、電話或編號篩選" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select className="input" value={customerId} onChange={(e) => pick(e.target.value ? Number(e.target.value) : "")} required>
            <option value="">請選擇</option>
            {shown.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.type === "COMPANY" ? "（公司）" : ""}{c.phone || c.mobile ? ` ${c.phone ?? c.mobile}` : ""}
              </option>
            ))}
          </select>
          <input type="hidden" name="customerId" value={customerId} />
        </Field>
        <Field label="聯絡人">
          <input name="contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <Field label="電話">
          <input name="phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="設備放置地點" className="sm:col-span-2">
          <input name="address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="業務人員">
          <select name="salespersonId" className="input" defaultValue={quote ? (quote.salespersonId ?? "") : uid}>
            <option value="">—</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">租期與收費</h2>
        <div className="flex flex-wrap gap-2">
          {([
            ["MONTH", "每月收款"],
            ["PREPAY", "一次預收多個月"],
            ["DAY", "短期按天計"],
          ] as const).map(([k, label]) => (
            <button
              type="button"
              key={k}
              onClick={() => changeMode(k)}
              className={`rounded-lg border px-3 py-2 text-sm ${mode === k ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-gray-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input type="hidden" name="billingType" value={daily ? "DAILY" : "MONTHLY"} />
        <input type="hidden" name="billingMonths" value={mode === "PREPAY" ? months : 1} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {mode === "PREPAY" && (
            <Field label="每次收幾個月">
              <select className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {[2, 3, 4, 6, 12, 24].map((m) => <option key={m} value={m}>{m} 個月</option>)}
              </select>
            </Field>
          )}
          <Field label="開始日期 *">
            <input type="date" name="startDate" className="input" defaultValue={quote?.startDate || today} required />
          </Field>
          <Field label={daily ? "結束日期 *" : "到期日"} hint={daily ? undefined : "空白＝不定期，按月持續收費"}>
            <input type="date" name="endDate" className="input" required={daily} defaultValue={quote?.endDate} />
          </Field>
          <Field label="營業稅">
            <select name="taxType" className="input" value={taxType} onChange={(e) => setTaxType(e.target.value as TaxType)}>
              <option value="INCLUDED">租金含稅</option>
              <option value="EXCLUDED">外加稅 5%</option>
            </select>
          </Field>
          <Field label="付款方式">
            <select name="paymentMethod" className="input" value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="CREDIT">月結（開帳時列為未收）</option>
              <option value="TRANSFER">轉帳</option>
              <option value="CASH">現金</option>
              <option value="CARD">刷卡</option>
            </select>
          </Field>
          <Field label="押金">
            <input name="deposit" className="input" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ""))} />
          </Field>
          {Number(deposit) > 0 && (
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" name="depositReceived" className="h-4 w-4" defaultChecked />
              押金已收
            </label>
          )}
          <Field label="備註" className="sm:col-span-2 lg:col-span-4">
            <input name="note" className="input" placeholder="例如：合約編號、維護條款" defaultValue={quote?.note ?? ""} />
          </Field>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">出租設備（已選 {picked.length} 台）</h2>
        {quote && (
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm">
            <div className="font-semibold">報價內容（勾選設備時自動帶入報價租金）</div>
            <ul className="mt-1 space-y-0.5">
              {quote.rent.map((r) => {
                const n = picked.filter((p) => assets.find((a) => a.id === p.assetId)?.name === r.name).length;
                return (
                  <li key={r.name}>
                    {r.name} × {r.qty}・{daily ? "日" : "月"}租 {money(r.rate)}
                    <span className={`ml-2 ${n >= r.qty ? "text-green-700" : "text-amber-700"}`}>已選 {n}／{r.qty}</span>
                  </li>
                );
              })}
            </ul>
            {quote.fees.length > 0 && (
              <p className="mt-1 text-xs text-gray-600">
                一次性費用（{quote.fees.map((f) => `${f.name} ${money(f.qty * f.rate)}`).join("、")}）不會算進租約，建立租約後請另開銷貨單收取。
              </p>
            )}
          </div>
        )}
        <AssetChooser assets={assets} daily={daily} picked={picked} setPicked={setPicked} rateHint={rateHint} />
        {picked.length > 0 && (
          <div className="text-right text-sm text-gray-700">
            {daily ? "每天" : mode === "PREPAY" ? `每 ${months} 個月` : "每月"}租金
            {taxType === "EXCLUDED" ? `（未稅 ${money(perPeriod)}＋稅 ${money(t.tax)}）` : ""}：
            <span className="text-lg font-bold">{money(t.total)}</span>
            {daily && <span className="text-gray-500">，依天數計算</span>}
          </div>
        )}
      </div>

      <input type="hidden" name="items" value={JSON.stringify(picked)} />
      <FormMessage state={state} />
      <button className="btn-primary py-3 text-base" disabled={pending || !picked.length || !customerId}>
        {pending ? "處理中…" : "建立租約"}
      </button>
    </form>
  );
}
