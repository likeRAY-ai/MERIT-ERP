"use client";

import { useFormAction } from "@/lib/useFormAction";
import { FormMessage } from "@/components/FormState";
import { changeOrderStatus } from "../actions";

type Btn = { op: string; label: string; primary?: boolean; danger?: boolean; confirm?: string };

export default function OrderActions({ id, buttons }: { id: number; buttons: Btn[] }) {
  const [state, action, pending] = useFormAction(changeOrderStatus);
  if (!buttons.length) return null;
  return (
    <div className="no-print space-y-2">
      <form
        onSubmit={(e) => {
          const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const msg = btn?.dataset.confirm;
          if (msg && !window.confirm(msg)) {
            e.preventDefault();
            return;
          }
          action(e);
        }}
        className="flex flex-wrap gap-2"
      >
        <input type="hidden" name="id" value={id} />
        {buttons.map((b) => (
          <button
            key={b.op}
            name="op"
            value={b.op}
            data-confirm={b.confirm}
            disabled={pending}
            className={b.primary ? "btn-primary" : b.danger ? "btn-danger" : "btn"}
          >
            {b.label}
          </button>
        ))}
      </form>
      <FormMessage state={state} />
    </div>
  );
}
