"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/useFormAction";
import LineItems, { type Line } from "@/components/LineItems";
import { Field, FormMessage } from "@/components/FormState";
import { money, calcTotals, convertPrice, type TaxType } from "@/lib/format";
import { submitSale } from "../actions";

export type SaleCustomer = {
  id: number;
  name: string;
  type: "PERSONAL" | "COMPANY";
  taxId: string | null;
  phone: string | null;
  mobile: string | null;
  code: string | null;
  contact: string | null;
  address: string | null;
  taxType: TaxType | null;
};

// 開單初始值：由訂單轉入或複製舊單
export type SaleInit = {
  orderId?: number;
  orderNumber?: string;
  customerId: number | "";
  buyerTaxId: string;
  taxType: TaxType;
  paymentMethod: string;
  salespersonId: number | "";
  contact: string;
  deliveryMethod: string;
  deliveryAddress: string;
  note: string;
  lines: Line[];
};

export const DELIVERY_METHODS = ["門市自取", "送貨", "宅配", "郵寄", "到府安裝"];

export default function SaleForm({
  customers,
  staff,
  init,
}: {
  customers: SaleCustomer[];
  staff: { id: number; name: string }[];
  init: SaleInit;
}) {
  const fromOrder = !!init.orderId;
  const [state, action, pending] = useFormAction(submitSale);
  const [lines, setLines] = useState<Line[]>(init.lines);
  const [customerId, setCustomerId] = useState<number | "">(init.customerId);
  const [filter, setFilter] = useState("");
  const customer = customers.find((c) => c.id === customerId);
  const [taxId, setTaxId] = useState(init.buyerTaxId);
  const [payment, setPayment] = useState(init.paymentMethod);
  const [taxType, setTaxType] = useState<TaxType>(init.taxType);
  const [contact, setContact] = useState(init.contact);
  const [address, setAddress] = useState(init.deliveryAddress);
  const [discount, setDiscount] = useState(0);
  const [paidInput, setPaidInput] = useState<string | null>(null); // null：自動（月結 0、其他全額）

  const business = customer?.type === "COMPANY";
  const lineSum = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const t = calcTotals(Math.max(lineSum - discount, 0), taxType);
  const total = t.total;
  const paid = paidInput === null ? (payment === "CREDIT" ? 0 : total) : Number(paidInput) || 0;
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
  const tooMuchDiscount = discount > lineSum;
  const tooMuchPaid = paid > total;

  function changeTax(next: TaxType) {
    setLines((ls) => ls.map((l) => ({ ...l, price: convertPrice(l.price, taxType, next) })));
    setDiscount((d) => convertPrice(d, taxType, next));
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
    setContact(c?.contact ?? "");
    setAddress(c?.address ?? "");
    // 客戶有設定預設稅別時自動切換（一般門市散客維持含稅）
    if (c?.taxType) changeTax(c.taxType);
  }

  return (
    <form
      onSubmit={action}
      className="space-y-4"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="客戶" hint={business ? "公司行號：自動使用公司價" : "空白表示門市散客"}>
          <input
            className="input mb-1"
            placeholder="輸入名稱、電話、統編或編號篩選"
            value={filter}
            disabled={fromOrder}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="input"
            disabled={fromOrder}
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
        <Field label="聯絡人">
          <input name="contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <Field label="業務人員">
          <select name="salespersonId" className="input" defaultValue={init.salespersonId}>
            <option value="">—</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </Field>
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
        <Field label="發票號碼" hint="可開單後再補填">
          <input name="invoiceNo" className="input uppercase" placeholder="例如 AB12345678" maxLength={12} />
        </Field>
        <Field label="付款方式">
          <select
            name="paymentMethod"
            className="input"
            value={payment}
            onChange={(e) => {
              setPayment(e.target.value);
              setPaidInput(null);
            }}
          >
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
            disabled={fromOrder}
            onChange={(e) => changeTax(e.target.value as TaxType)}
          >
            <option value="INCLUDED">含稅價</option>
            <option value="EXCLUDED">外加稅 5%</option>
          </select>
          {fromOrder && <input type="hidden" name="taxType" value={taxType} />}
        </Field>
        <Field label="送貨方式">
          <input name="deliveryMethod" className="input" list="delivery" defaultValue={init.deliveryMethod} />
          <datalist id="delivery">
            {DELIVERY_METHODS.map((x) => <option key={x} value={x} />)}
          </datalist>
        </Field>
        <Field label="送貨地址">
          <input name="deliveryAddress" className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="備註" className="sm:col-span-2 lg:col-span-3">
          <input name="note" className="input" placeholder="例如：組裝需求、交貨時間" defaultValue={init.note} />
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
          <div className="mt-3 ml-auto max-w-sm space-y-2 text-sm">
            <label className="flex items-center justify-between gap-2">
              <span className="text-gray-600">折扣金額{taxType === "EXCLUDED" ? "（未稅）" : ""}</span>
              <input
                name="discount"
                className="input w-32 text-right"
                inputMode="numeric"
                value={discount || ""}
                placeholder="0"
                onChange={(e) => setDiscount(parseInt(e.target.value.replace(/\D/g, "") || "0", 10))}
              />
            </label>
            <div className="flex justify-between text-gray-600"><span>未稅金額</span>{money(t.subtotal)}</div>
            <div className="flex justify-between text-gray-600"><span>營業稅 5%</span>{money(t.tax)}</div>
            <div className="flex justify-between border-t border-gray-200 pt-1 text-lg font-bold">
              <span>應收總計</span>{money(total)}
            </div>
            <label className="flex items-center justify-between gap-2">
              <span className="text-gray-600">已收金額</span>
              <input
                name="paidAmount"
                className="input w-32 text-right"
                inputMode="numeric"
                value={paid}
                onChange={(e) => setPaidInput(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            {total - paid > 0 && (
              <div className="flex justify-between font-semibold text-red-600"><span>未收金額</span>{money(total - paid)}</div>
            )}
            {cost !== null && <div className="text-right text-gray-500">預估毛利 {money(total - cost)}</div>}
          </div>
        )}
      </div>

      <input type="hidden" name="items" value={JSON.stringify(items)} />
      {fromOrder && <input type="hidden" name="orderId" value={init.orderId} />}
      <FormMessage state={state} />
      {missingSerial && <p className="text-sm text-amber-700">「{missingSerial.product.name}」需要選擇出貨序號</p>}
      {payment === "CREDIT" && !customerId && <p className="text-sm text-amber-700">月結請選擇客戶</p>}
      {tooMuchDiscount && <p className="text-sm text-red-600">折扣金額不可大於商品合計</p>}
      {tooMuchPaid && <p className="text-sm text-red-600">已收金額不可大於應收總計</p>}
      <button
        className="btn-primary w-full py-3 text-base sm:w-auto"
        disabled={
          pending ||
          !lines.length ||
          !!missingSerial ||
          !!zeroQty ||
          tooMuchDiscount ||
          tooMuchPaid ||
          (payment === "CREDIT" && !customerId)
        }
      >
        {pending ? "處理中…" : `確認銷貨 ${money(total)}`}
      </button>
    </form>
  );
}
