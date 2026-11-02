"use client";

import { useFormAction } from "@/lib/useFormAction";
import { saveProduct } from "./actions";
import { Field, FormMessage } from "@/components/FormState";

type P = {
  id: number;
  sku: string;
  barcode: string | null;
  altCode?: string | null;
  name: string;
  brand: string | null;
  spec: string | null;
  unit: string;
  categoryId: number | null;
  trackSerial: boolean;
  isService?: boolean;
  warrantyMonths: number;
  retailPrice: number;
  businessPrice: number;
  safetyStock: number;
  active: boolean;
  note: string | null;
};

export default function ProductForm({
  product,
  categories,
}: {
  product?: P;
  categories: { id: number; name: string }[];
}) {
  const [state, action, pending] = useFormAction(saveProduct.bind(null, product?.id ?? null));
  const p = product;
  return (
    <form onSubmit={action} className="card space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="商品編號 *">
          <input name="sku" defaultValue={p?.sku} className="input" required autoCapitalize="characters" />
        </Field>
        <Field label="條碼">
          <input name="barcode" defaultValue={p?.barcode ?? ""} className="input" />
        </Field>
        <Field label="輔助編號" hint="舊系統的輔助編號，可用來搜尋">
          <input name="altCode" defaultValue={p?.altCode ?? ""} className="input" />
        </Field>
        <Field label="商品名稱 *" className="sm:col-span-2">
          <input name="name" defaultValue={p?.name} className="input" required />
        </Field>
        <Field label="分類">
          <select name="categoryId" defaultValue={p?.categoryId ?? ""} className="input">
            <option value="">（未分類）</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="品牌">
          <input name="brand" defaultValue={p?.brand ?? ""} className="input" />
        </Field>
        <Field label="規格" className="sm:col-span-2">
          <textarea name="spec" defaultValue={p?.spec ?? ""} className="input" rows={2} />
        </Field>
        <Field label="零售價（含稅）">
          <input name="retailPrice" defaultValue={p?.retailPrice ?? ""} className="input" inputMode="numeric" />
        </Field>
        <Field label="公司行號價（含稅）" hint="空白或 0 表示同零售價">
          <input name="businessPrice" defaultValue={p?.businessPrice || ""} className="input" inputMode="numeric" />
        </Field>
        <Field label="單位">
          <input name="unit" defaultValue={p?.unit ?? "個"} className="input" />
        </Field>
        <Field label="保固月數">
          <input name="warrantyMonths" defaultValue={p?.warrantyMonths ?? 12} className="input" inputMode="numeric" />
        </Field>
        <Field label="安全庫存" hint="庫存低於此數量會在首頁提醒，0 表示不提醒">
          <input name="safetyStock" defaultValue={p?.safetyStock ?? 0} className="input" inputMode="numeric" />
        </Field>
        <div className="flex flex-col justify-center gap-2 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="trackSerial" defaultChecked={p?.trackSerial ?? false} className="h-4 w-4" />
            需要序號管理（進貨、銷貨時要輸入序號）
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isService" defaultChecked={p?.isService ?? false} className="h-4 w-4" />
            服務／費用項目，不計庫存（例如組裝工資、維修費、租金）
          </label>
          {p && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={p.active} className="h-4 w-4" />
              啟用（取消後不會出現在開單選項）
            </label>
          )}
          {p && <input type="hidden" name="hasActive" value="1" />}
        </div>
        <Field label="備註" className="sm:col-span-2">
          <textarea name="note" defaultValue={p?.note ?? ""} className="input" rows={2} />
        </Field>
      </div>
      <FormMessage state={state} />
      <button className="btn-primary w-full sm:w-auto" disabled={pending}>
        {pending ? "儲存中…" : "儲存"}
      </button>
    </form>
  );
}
