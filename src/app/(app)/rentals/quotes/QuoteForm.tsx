"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/useFormAction";
import { Field, FormMessage } from "@/components/FormState";
import { money, type TaxType } from "@/lib/format";
import { quoteTotals } from "@/lib/services/rentalQuotesCalc";
import type { QuoteFormData } from "./load";
import { submitRentalQuote } from "./actions";

type Mode = "MONTH" | "PREPAY" | "DAY";
type Line = { key: number; kind: "RENT" | "FEE"; name: string; description: string; qty: number; unitPrice: number };

export type QuoteInit = {
  id?: number;
  date: string;
  validUntil: string;
  customerId: number | "";
  customerName: string;
  contact: string;
  phone: string;
  buyerTaxId: string;
  address: string;
  salespersonId: number | "";
  mode: Mode;
  months: number;
  term: string;
  plannedStart: string;
  taxType: TaxType;
  deposit: string;
  note: string;
  lines: Omit<Line, "key">[];
};

let seq = 1;
const newLine = (l: Partial<Line> = {}): Line => ({
  key: seq++,
  kind: "RENT",
  name: "",
  description: "",
  qty: 1,
  unitPrice: 0,
  ...l,
});

export default function QuoteForm({ init, data }: { init: QuoteInit; data: QuoteFormData }) {
  const { customers, staff, models } = data;
  const [state, action, pending] = useFormAction(submitRentalQuote);
  const [customerId, setCustomerId] = useState<number | "">(init.customerId);
  const [filter, setFilter] = useState("");
  const [contact, setContact] = useState(init.contact);
  const [phone, setPhone] = useState(init.phone);
  const [taxId, setTaxId] = useState(init.buyerTaxId);
  const [address, setAddress] = useState(init.address);
  const [taxType, setTaxType] = useState<TaxType>(init.taxType);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [months, setMonths] = useState(init.months);
  const [term, setTerm] = useState(init.term);
  const [deposit, setDeposit] = useState(init.deposit);
  const [lines, setLines] = useState<Line[]>(() =>
    init.lines.length ? init.lines.map((l) => newLine(l)) : [newLine()],
  );
  const daily = mode === "DAY";

  const shown = filter
    ? customers.filter(
        (c) => c.name.includes(filter) || c.phone?.includes(filter) || c.mobile?.includes(filter) || c.code?.includes(filter) || c.taxId?.includes(filter),
      )
    : customers;

  function pickCustomer(id: number | "") {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    setContact(c.contact ?? "");
    setPhone(c.phone ?? c.mobile ?? "");
    setTaxId(c.taxId ?? "");
    setAddress(c.address ?? "");
    setTaxType(c.taxType ?? (c.type === "COMPANY" ? "EXCLUDED" : "INCLUDED"));
  }

  function changeMode(m: Mode) {
    // 按月／按天切換時，從設備機型帶入的租金改用對應的預設值
    if ((m === "DAY") !== daily) {
      setLines((ls) =>
        ls.map((l) => {
          const md = l.kind === "RENT" ? models.find((x) => x.name === l.name) : undefined;
          return md ? { ...l, unitPrice: m === "DAY" ? md.dailyRate : md.monthlyRate } : l;
        }),
      );
      setTerm("");
    }
    setMode(m);
  }

  function addModel(name: string) {
    const md = models.find((x) => x.name === name);
    if (!md) return;
    const ex = lines.find((l) => l.kind === "RENT" && l.name === md.name);
    if (ex) {
      setLines(lines.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l)));
      return;
    }
    const line = newLine({ name: md.name, unitPrice: daily ? md.dailyRate : md.monthlyRate });
    // 取代最後一列空白
    const last = lines[lines.length - 1];
    setLines(last && !last.name.trim() && last.kind === "RENT" ? [...lines.slice(0, -1), line] : [...lines, line]);
  }

  const upd = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const numIn = (v: string) => parseInt(v.replace(/\D/g, "") || "0", 10);

  const valid = lines.filter((l) => l.name.trim());
  const t = quoteTotals({ billingType: daily ? "DAILY" : "MONTHLY", term: Number(term) || null, taxType }, valid);
  const unit = daily ? "日" : "月";

  return (
    <form
      onSubmit={action}
      className="space-y-4"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      {init.id && <input type="hidden" name="id" value={init.id} />}

      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="客戶">
          <input className="input mb-1" placeholder="輸入名稱、電話或統編篩選" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select className="input" value={customerId} onChange={(e) => pickCustomer(e.target.value ? Number(e.target.value) : "")}>
            <option value="">未建檔客戶（直接輸入名稱）</option>
            {shown.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.type === "COMPANY" ? "（公司）" : ""}{c.phone || c.mobile ? ` ${c.phone ?? c.mobile}` : ""}
              </option>
            ))}
          </select>
          <input type="hidden" name="customerId" value={customerId} />
        </Field>
        {!customerId && (
          <Field label="客戶名稱 *">
            <input name="customerName" className="input" defaultValue={init.customerName} placeholder="例如：○○活動公司" />
          </Field>
        )}
        <Field label="聯絡人">
          <input name="contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <Field label="電話">
          <input name="phone" className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="統一編號">
          <input name="buyerTaxId" className="input" inputMode="numeric" maxLength={8} value={taxId} onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="設備放置地點">
          <input name="address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="報價日期">
          <input type="date" name="date" className="input" defaultValue={init.date} />
        </Field>
        <Field label="報價有效期限">
          <input type="date" name="validUntil" className="input" defaultValue={init.validUntil} />
        </Field>
        <Field label="業務人員">
          <select name="salespersonId" className="input" defaultValue={init.salespersonId}>
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
          <Field label={daily ? "租用天數 *" : "租期（月）"} hint={daily ? undefined : "空白＝不定期，按月持續收費"}>
            <input
              name="term"
              className="input"
              inputMode="numeric"
              value={term}
              required={daily}
              onChange={(e) => setTerm(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="預定起租日">
            <input type="date" name="plannedStart" className="input" defaultValue={init.plannedStart} />
          </Field>
          <Field label="營業稅">
            <select name="taxType" className="input" value={taxType} onChange={(e) => setTaxType(e.target.value as TaxType)}>
              <option value="INCLUDED">金額含稅</option>
              <option value="EXCLUDED">外加稅 5%</option>
            </select>
          </Field>
          <Field label="押金">
            <input name="deposit" className="input" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">報價明細</h2>
          {models.length > 0 && (
            <select className="input w-full min-w-0 sm:w-auto sm:max-w-md" value="" onChange={(e) => addModel(e.target.value)}>
              <option value="">＋ 從出租設備帶入機型…</option>
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}（可出租 {m.available}／{m.total} 台・月租 {money(m.monthlyRate)}・日租 {money(m.dailyRate)}）
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => {
            const md = l.kind === "RENT" ? models.find((x) => x.name === l.name) : undefined;
            return (
              <div key={l.key} className="rounded-lg border border-gray-200 p-2">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="pt-2 text-sm text-gray-500">{i + 1}.</span>
                  <select
                    className="input w-auto"
                    value={l.kind}
                    onChange={(e) => upd(l.key, { kind: e.target.value as Line["kind"] })}
                    aria-label="類別"
                  >
                    <option value="RENT">租金</option>
                    <option value="FEE">一次性費用</option>
                  </select>
                  <input
                    className="input min-w-0 flex-1 basis-48"
                    placeholder={l.kind === "RENT" ? "設備名稱，例如：文書機 i5/8G/256G" : "例如：安裝及運費"}
                    value={l.name}
                    onChange={(e) => upd(l.key, { name: e.target.value })}
                    aria-label="品名"
                  />
                  <label className="flex items-center gap-1 text-sm">
                    數量
                    <input className="input w-16 text-right" inputMode="numeric" value={l.qty} onChange={(e) => upd(l.key, { qty: numIn(e.target.value) })} />
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    {l.kind === "RENT" ? `${unit}租` : "單價"}
                    <input className="input w-24 text-right" inputMode="numeric" value={l.unitPrice} onChange={(e) => upd(l.key, { unitPrice: numIn(e.target.value) })} />
                  </label>
                  <span className="w-24 pt-2 text-right text-sm font-semibold">{money(l.qty * l.unitPrice)}</span>
                  <button
                    type="button"
                    className="btn px-2"
                    aria-label="刪除"
                    onClick={() => setLines(lines.length > 1 ? lines.filter((x) => x.key !== l.key) : [newLine()])}
                  >
                    ✕
                  </button>
                </div>
                <input
                  className="input mt-2 text-sm"
                  placeholder="規格說明（列印在報價單上），例如：含 Office、到府安裝"
                  value={l.description}
                  onChange={(e) => upd(l.key, { description: e.target.value })}
                />
                {md && l.qty > md.available && (
                  <p className="mt-1 text-xs text-amber-700">目前可出租 {md.available} 台，不足 {l.qty - md.available} 台</p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setLines([...lines, newLine()])}>＋ 租金項目</button>
          <button type="button" className="btn" onClick={() => setLines([...lines, newLine({ kind: "FEE" })])}>＋ 一次性費用</button>
        </div>

        <div className="ml-auto max-w-sm space-y-1 border-t border-gray-200 pt-2 text-sm">
          <Row label={`每${unit}租金（${t.units} 台）`} value={money(t.period.total)} sub={taxType === "EXCLUDED" ? `未稅 ${money(t.rent)}＋稅 ${money(t.period.tax)}` : undefined} />
          {mode === "PREPAY" && <Row label={`每次收款（${months} 個月）`} value={money(t.period.total * months)} />}
          {t.fees > 0 && <Row label="一次性費用" value={money(t.feeT.total)} />}
          {t.grand && <Row label={`租期 ${term} ${daily ? "天" : "個月"}合計`} value={money(t.grand.total)} strong />}
          {Number(deposit) > 0 && <Row label="押金（另收，可退還）" value={money(Number(deposit))} />}
        </div>
      </div>

      <div className="card">
        <Field label="備註（列印在報價單上）">
          <textarea name="note" className="input min-h-20" defaultValue={init.note} placeholder="例如：含到府安裝設定、故障 24 小時內到場" />
        </Field>
      </div>

      <input
        type="hidden"
        name="items"
        value={JSON.stringify(valid.map(({ kind, name, description, qty, unitPrice }) => ({ kind, name, description, qty, unitPrice })))}
      />
      <FormMessage state={state} />
      <button className="btn-primary py-3 text-base" disabled={pending}>
        {pending ? "儲存中…" : init.id ? "儲存修改" : "建立報價單"}
      </button>
    </form>
  );
}

function Row({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-lg font-bold" : ""}`}>
      <span className="text-gray-600">
        {label}
        {sub && <span className="block text-xs text-gray-400">{sub}</span>}
      </span>
      <span>{value}</span>
    </div>
  );
}
