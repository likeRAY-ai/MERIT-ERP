"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/useFormAction";
import LineItems, { type Line } from "@/components/LineItems";
import { Field, FormMessage } from "@/components/FormState";
import { money, taxFromTotal } from "@/lib/format";
import { submitSale } from "../actions";

type C = { id: number; name: string; type: "PERSONAL" | "COMPANY"; taxId: string | null; phone: string | null };

export default function SaleForm({ customers, defaultCustomer }: { customers: C[]; defaultCustomer?: number }) {
  const [state, action, pending] = useFormAction(submitSale);
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState<number | "">(defaultCustomer ?? "");
  const [filter, setFilter] = useState("");
  const customer = customers.find((c) => c.id === customerId);
  const [taxId, setTaxId] = useState(customer?.taxId ?? "");
  const [payment, setPayment] = useState("CASH");

  const business = customer?.type === "COMPANY";
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const cost = lines.every((l) => l.product.avgCost !== null)
    ? lines.reduce((s, l) => s + l.qty * (l.product.avgCost ?? 0), 0)
    : null;
  const missingSerial = lines.find((l) => l.product.trackSerial && l.serials.length === 0);
  const items = lines.map((l) => ({ productId: l.product.id, qty: l.qty, unitPrice: l.price, serials: l.serials }));

  const shown = filter
    ? customers.filter((c) => c.name.includes(filter) || c.phone?.includes(filter) || c.taxId?.includes(filter))
    : customers;

  function pickCustomer(id: number | "") {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    setTaxId(c?.taxId ?? "");
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
            value={customerId}
            onChange={(e) => pickCustomer(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">門市散客</option>
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
        </div>
        <Field label="備註" className="sm:col-span-2">
          <input name="note" className="input" placeholder="例如：組裝需求、交貨時間" />
        </Field>
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">銷售商品</h2>
        <LineItems mode="sale" lines={lines} setLines={setLines} business={business} />
        {lines.length > 0 && (
          <div className="mt-2 text-right text-sm text-gray-600">
            含稅 {money(total)}（未稅 {money(total - taxFromTotal(total))}，稅額 {money(taxFromTotal(total))}）
            {cost !== null && <div>預估毛利 {money(total - cost)}</div>}
          </div>
        )}
      </div>

      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <FormMessage state={state} />
      {missingSerial && <p className="text-sm text-amber-700">「{missingSerial.product.name}」需要選擇出貨序號</p>}
      {payment === "CREDIT" && !customerId && <p className="text-sm text-amber-700">月結請選擇客戶</p>}
      <button
        className="btn-primary w-full py-3 text-base sm:w-auto"
        disabled={pending || !lines.length || !!missingSerial || (payment === "CREDIT" && !customerId)}
      >
        {pending ? "處理中…" : `確認銷貨 ${money(total)}`}
      </button>
    </form>
  );
}
