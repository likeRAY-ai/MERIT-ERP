"use client";

// 客戶／供應商共用表單
import { useFormAction } from "@/lib/useFormAction";
import type { ActionState } from "@/lib/action";
import { Field, FormMessage } from "./FormState";

type Party = {
  type?: "PERSONAL" | "COMPANY";
  code?: string | null;
  mobile?: string | null;
  fax?: string | null;
  taxType?: "INCLUDED" | "EXCLUDED" | null;
  name: string;
  taxId: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  active: boolean;
};

export default function PartyForm({
  action: serverAction,
  party,
  isCustomer,
  readOnly,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  party?: Party;
  isCustomer: boolean;
  readOnly?: boolean;
}) {
  const [state, action, pending] = useFormAction(serverAction);
  const p = party;
  return (
    <form onSubmit={action} className="card space-y-4">
      <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-2">
        {isCustomer && (
          <Field label="類型">
            <select name="type" defaultValue={p?.type ?? "PERSONAL"} className="input">
              <option value="PERSONAL">一般消費者</option>
              <option value="COMPANY">公司行號</option>
            </select>
          </Field>
        )}
        <Field label="名稱 *" className={isCustomer ? "" : "sm:col-span-2"}>
          <input name="name" defaultValue={p?.name} className="input" required />
        </Field>
        <Field label={isCustomer ? "客戶編號" : "廠商編號"} hint="選填，舊系統的編號">
          <input name="code" defaultValue={p?.code ?? ""} className="input" />
        </Field>
        {isCustomer && (
          <>
            <Field label="開單預設稅別">
              <select name="taxType" defaultValue={p?.taxType ?? ""} className="input">
                <option value="">依類型（公司外加稅、個人含稅）</option>
                <option value="INCLUDED">含稅價</option>
                <option value="EXCLUDED">外加稅 5%</option>
              </select>
            </Field>
          </>
        )}
        <Field label="統一編號">
          <input name="taxId" defaultValue={p?.taxId ?? ""} className="input" inputMode="numeric" maxLength={8} />
        </Field>
        <Field label="聯絡人">
          <input name="contact" defaultValue={p?.contact ?? ""} className="input" />
        </Field>
        <Field label="電話">
          <input name="phone" defaultValue={p?.phone ?? ""} className="input" inputMode="tel" />
        </Field>
        <Field label="手機">
          <input name="mobile" defaultValue={p?.mobile ?? ""} className="input" inputMode="tel" />
        </Field>
        <Field label="傳真">
          <input name="fax" defaultValue={p?.fax ?? ""} className="input" inputMode="tel" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={p?.email ?? ""} className="input" />
        </Field>
        <Field label="地址" className="sm:col-span-2">
          <input name="address" defaultValue={p?.address ?? ""} className="input" />
        </Field>
        <Field label="備註" className="sm:col-span-2">
          <textarea name="note" defaultValue={p?.note ?? ""} className="input" rows={2} />
        </Field>
        {p && (
          <label className="flex items-center gap-2 text-sm">
            <input type="hidden" name="hasActive" value="1" />
            <input type="checkbox" name="active" defaultChecked={p.active} className="h-4 w-4" />
            啟用
          </label>
        )}
      </fieldset>
      <FormMessage state={state} />
      {!readOnly && (
        <button className="btn-primary w-full sm:w-auto" disabled={pending}>
          {pending ? "儲存中…" : "儲存"}
        </button>
      )}
    </form>
  );
}
