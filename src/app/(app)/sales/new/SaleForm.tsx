"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/useFormAction";
import LineItems, { type Line } from "@/components/LineItems";
import { Field, FormMessage } from "@/components/FormState";
import { money, calcTotals, convertPrice, type TaxType } from "@/lib/format";
import { submitSale } from "../actions";

type C = {
  id: number;
  name: string;
  type: "PERSONAL" | "COMPANY";
  taxId: string | null;
  phone: string | null;
  mobile: string | null;
  code: string | null;
  taxType: TaxType | null;
};

export type FromOrder = {
  id: number;
  number: string;
  customerId: number | null;
  buyerTaxId: string | null;
  taxType: TaxType;
  paymentTerms: string | null;
  lines: Line[];
};

export default function SaleForm({
  customers,
  defaultCustomer,
  fromOrder,
}: {
  customers: C[];
  defaultCustomer?: number;
  fromOrder?: FromOrder;
}) {
  const [state, action, pending] = useFormAction(submitSale);
  const [lines, setLines] = useState<Line[]>(fromOrder?.lines ?? []);
  const [customerId, setCustomerId] = useState<number | "">(fromOrder ? (fromOrder.customerId ?? "") : (defaultCustomer ?? ""));
  const [filter, setFilter] = useState("");
  const customer = customers.find((c) => c.id === customerId);
  const [taxId, setTaxId] = useState(fromOrder ? (fromOrder.buyerTaxId ?? "") : (customer?.taxId ?? ""));
  const [payment, setPayment] = useState(fromOrder?.paymentTerms?.includes("月結") && fromOrder.customerId ? "CREDIT" : "CASH");
  const [taxType, setTaxType] = useState<TaxType>(fromOrder?.taxType ?? "INCLUDED");

  const business = customer?.type === "COMPANY";
  const t = calcTotals(lines.reduce((s, l) => s + l.qty * l.price, 0), taxType);
  const total = t.total;
  const cost = lines.every((l) => l.product.avgCost !== null)
    ? lines.reduce((s, l) => s + l.qty * (l.product.avgCost ?? 0), 0)
    : null;
  const missingSerial = lines.find((l) => l.product.trackSerial && l.serials.length === 0);
  const items = lines.map((l) => ({
    productId: l.product.id,
    qty: l.qty,
    unitPrice: l.price,
    serials: l.serials,
    orderItemId: l.orderItemId ?? null,
  }));
  const zeroQty = lines.find((l) => l.qty <= 0 && !l.product.trackSerial);

  function changeTax(next: TaxType) {
    setLines((ls) => ls.map((l) => ({ ...l, price: convertPrice(l.price, taxType, next) })));
    setTaxType(next);
  }

  const shown = filter
    ? customers.filter(
        (c) =>
          c.name.includes(filter) ||
          c.phone?.includes(filter) ||
          c.mobile?.includes(filter) ||
          c.taxId?.includes(filter) ||
          c.code?.includes(filter),
      )
    : customers;

  function pickCustomer(id: number | "") {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    setTaxId(c?.taxId ?? "");
    // 客戶有設定預設稅別時自動切換（一般門市散客維持含稅）
    if (c?.taxType) changeTax(c.taxType);
  }

  return (
    <form onSubmit={action}
      className="space-y-4"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      <div className="card grid gap-3 sm:grid-cols-2">
        <Field label="客戶" hint={business ? "公司行號：自動使用公司價" : "空白表示門市散客"}>
          <input
            className="input mb-1"
            placeholder="輸入名稱、電話或統編篩選"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="input"
            disabled={!!fromOrder}
            value={customerId}
            onChange={(e) => pickCustomer(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">門市散客</option>
            {shown.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.type === "COMPANY" ? "（公司）" : ""}
                {c.phone || c.mobile ? ` ${c.phone ?? c.mobile}` : ""}
              </option>
            ))}
          </select>
          <input type="hidden" name="customerId" value={customerId} />
        </Field>
        <div className="space-y-3">
          <Field label="發票統編" hint="需要開立三聯式發票時填寫">
            <input
              name="buyerTaxId"
              className="input"
              inputMode="numeric"
              maxLength={8}
              value={taxId}
              onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="付款方式">
            <select name="paymentMethod" className="input" value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="CASH">現金</option>
              <option value="CARD">刷卡</option>
              <option value="TRANSFER">轉帳</option>
              <option value="CREDIT">月結</option>
            </select>
          </Field>
          <Field label="營業稅" hint={fromOrder ? "依訂單的稅別" : undefined}>
            <select
              name="taxType"
              className="input"
              value={taxType}
              disabled={!!fromOrder}
              onChange={(e) => changeTax(e.target.value as TaxType)}
            >
              <option value="INCLUDED">含稅價</option>
              <option value="EXCLUDED">外加稅 5%</option>
            </select>
            {fromOrder && <input type="hidden" name="taxType" value={taxType} />}
          </Field>
        </div>
        <Field label="備註" className="sm:col-span-2">
          <input
            name="note"
            className="input"
            placeholder="例如：組裝需求、交貨時間"
            defaultValue={fromOrder ? `訂單 ${fromOrder.number}` : undefined}
          />
        </Field>
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">銷售商品</h2>
        <LineItems
          mode="sale"
          lines={lines}
          setLines={setLines}
          business={business}
          taxType={taxType}
          customerId={customerId || undefined}
        />
        {lines.length > 0 && (
          <div className="mt-2 text-right text-sm text-gray-600">
            含稅 {money(total)}（未稅 {money(t.subtotal)}，稅額 {money(t.tax)}）
            {cost !== null && <div>預估毛利 {money(total - cost)}</div>}
          </div>
        )}
      </div>

      <input type="hidden" name="items" value={JSON.stringify(items)} />
      {fromOrder && <input type="hidden" name="orderId" value={fromOrder.id} />}
      <FormMessage state={state} />
      {missingSerial && <p className="text-sm text-amber-700">「{missingSerial.product.name}」需要選擇出貨序號</p>}
      {payment === "CREDIT" && !customerId && <p className="text-sm text-amber-700">月結請選擇客戶</p>}
      <button
        className="btn-primary w-full py-3 text-base sm:w-auto"
        disabled={pending || !lines.length || !!missingSerial || !!zeroQty || (payment === "CREDIT" && !customerId)}
      >
        {pending ? "處理中…" : `確認銷貨 ${money(total)}`}
      </button>
    </form>
  );
}
