"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/useFormAction";
import LineItems, { type Line } from "@/components/LineItems";
import { Field, FormMessage } from "@/components/FormState";
import { money, calcTotals, convertPrice, type TaxType } from "@/lib/format";
import { submitOrder } from "./actions";

export type OrderCustomer = {
  id: number;
  name: string;
  type: "PERSONAL" | "COMPANY";
  taxId: string | null;
  contact: string | null;
  phone: string | null;
};

export type OrderInit = {
  id?: number;
  status?: string;
  date: string;
  validUntil: string;
  deliveryDate: string;
  customerId: number | "";
  customerName: string;
  contact: string;
  phone: string;
  buyerTaxId: string;
  salespersonId: number | "";
  customerPo: string;
  paymentTerms: string;
  taxType: TaxType;
  note: string;
  lines: Line[];
};

const TERMS = ["現金", "刷卡", "匯款", "貨到付款", "訂金 30%，交貨付清", "月結 30 天", "月結 60 天"];

export default function OrderForm({
  init,
  customers,
  staff,
}: {
  init: OrderInit;
  customers: OrderCustomer[];
  staff: { id: number; name: string }[];
}) {
  const [state, action, pending] = useFormAction(submitOrder);
  const [lines, setLines] = useState<Line[]>(init.lines);
  const [customerId, setCustomerId] = useState<number | "">(init.customerId);
  const [filter, setFilter] = useState("");
  const [contact, setContact] = useState(init.contact);
  const [phone, setPhone] = useState(init.phone);
  const [taxId, setTaxId] = useState(init.buyerTaxId);
  const [taxType, setTaxType] = useState<TaxType>(init.taxType);

  const customer = customers.find((c) => c.id === customerId);
  const business = customer?.type === "COMPANY";
  const lineSum = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const t = calcTotals(lineSum, taxType);
  const cost = lines.every((l) => l.product.avgCost !== null)
    ? lines.reduce((s, l) => s + l.qty * (l.product.avgCost ?? 0), 0)
    : null;
  const items = lines.map((l) => ({
    productId: l.product.id,
    qty: l.qty,
    unitPrice: l.price,
    description: l.description || null,
  }));
  const isQuote = !init.status || init.status === "QUOTE";

  const shown = filter
    ? customers.filter((c) => c.name.includes(filter) || c.phone?.includes(filter) || c.taxId?.includes(filter))
    : customers;

  function pickCustomer(id: number | "") {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    setContact(c?.contact ?? "");
    setPhone(c?.phone ?? "");
    setTaxId(c?.taxId ?? "");
    if (c?.type === "COMPANY" && taxType === "INCLUDED" && !lines.length) setTaxType("EXCLUDED");
  }

  function changeTax(next: TaxType) {
    // 切換稅別時把單價換算過去，總金額不變
    setLines((ls) => ls.map((l) => ({ ...l, price: convertPrice(l.price, taxType, next) })));
    setTaxType(next);
  }

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
        <Field label="客戶" hint={business ? "公司行號：自動使用公司價" : undefined}>
          <input
            className="input mb-1"
            placeholder="輸入名稱、電話或統編篩選"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="input"
            value={customerId}
            onChange={(e) => pickCustomer(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">未建檔客戶（直接輸入名稱）</option>
            {shown.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.type === "COMPANY" ? "（公司）" : ""}
                {c.phone ? ` ${c.phone}` : ""}
              </option>
            ))}
          </select>
          <input type="hidden" name="customerId" value={customerId} />
        </Field>
        {!customerId ? (
          <Field label="客戶名稱">
            <input name="customerName" className="input" defaultValue={init.customerName} placeholder="例如：王先生" />
          </Field>
        ) : null}
        <Field label="聯絡人">
          <input name="contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <Field label="電話">
          <input name="phone" className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="統一編號">
          <input
            name="buyerTaxId"
            className="input"
            inputMode="numeric"
            maxLength={8}
            value={taxId}
            onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field label="業務人員">
          <select name="salespersonId" className="input" defaultValue={init.salespersonId}>
            <option value="">—</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </Field>
        <Field label="日期">
          <input type="date" name="date" className="input" defaultValue={init.date} />
        </Field>
        <Field label="報價有效期限">
          <input type="date" name="validUntil" className="input" defaultValue={init.validUntil} />
        </Field>
        <Field label="交貨日期">
          <input type="date" name="deliveryDate" className="input" defaultValue={init.deliveryDate} />
        </Field>
        <Field label="營業稅">
          <div className="flex gap-2">
            {(["INCLUDED", "EXCLUDED"] as const).map((v) => (
              <label
                key={v}
                className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${
                  taxType === v ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-gray-300"
                }`}
              >
                <input type="radio" name="taxType" value={v} checked={taxType === v} onChange={() => changeTax(v)} className="sr-only" />
                {v === "INCLUDED" ? "含稅價" : "外加稅 5%"}
              </label>
            ))}
          </div>
        </Field>
        <Field label="客戶訂單號">
          <input name="customerPo" className="input" defaultValue={init.customerPo} placeholder="客戶的採購單號（選填）" />
        </Field>
        <Field label="付款條件">
          <input name="paymentTerms" className="input" list="terms" defaultValue={init.paymentTerms} />
          <datalist id="terms">
            {TERMS.map((x) => <option key={x} value={x} />)}
          </datalist>
        </Field>
        <Field label="備註" className="sm:col-span-2 lg:col-span-3">
          <input name="note" className="input" defaultValue={init.note} placeholder="例如：組裝需求、保固說明" />
        </Field>
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">商品明細</h2>
        <LineItems
          mode="order"
          lines={lines}
          setLines={setLines}
          business={business}
          taxType={taxType}
          customerId={customerId || undefined}
        />
        {lines.length > 0 && (
          <div className="mt-2 space-y-0.5 text-right text-sm text-gray-600">
            <div>未稅合計 {money(t.subtotal)}・營業稅 {money(t.tax)}</div>
            <div className="text-lg font-bold text-gray-900">總計 {money(t.total)}</div>
            {cost !== null && (
              <div>
                預估毛利 {money(t.total - cost)}
                {t.total > 0 && `（${(((t.total - cost) / t.total) * 100).toFixed(1)}%）`}
              </div>
            )}
          </div>
        )}
      </div>

      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        {isQuote ? (
          <>
            <button className="btn-primary py-3 text-base" disabled={pending || !lines.length}>
              {pending ? "處理中…" : "儲存報價單"}
            </button>
            <button name="confirm" value="1" className="btn py-3 text-base" disabled={pending || !lines.length}>
              儲存並成交
            </button>
          </>
        ) : (
          <button className="btn-primary py-3 text-base" disabled={pending || !lines.length}>
            {pending ? "處理中…" : "儲存訂單"}
          </button>
        )}
      </div>
    </form>
  );
}
