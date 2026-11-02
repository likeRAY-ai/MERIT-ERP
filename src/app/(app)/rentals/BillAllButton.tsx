"use client";

import { useFormAction } from "@/lib/useFormAction";
import { FormMessage } from "@/components/FormState";
import { billAllDue } from "./actions";

export default function BillAllButton({ count }: { count: number }) {
  const [state, action, pending] = useFormAction(billAllDue);
  return (
    <form
      onSubmit={(e) => {
        if (!window.confirm(`產生 ${count} 份租約的租金銷貨單？`)) {
          e.preventDefault();
          return;
        }
        action(e);
      }}
      className="space-y-2"
    >
      <button className="btn-primary" disabled={pending || !count}>
        {pending ? "產生中…" : `全部開帳（${count} 份）`}
      </button>
      <FormMessage state={state} />
    </form>
  );
}
