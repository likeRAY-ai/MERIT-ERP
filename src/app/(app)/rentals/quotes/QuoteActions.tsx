"use client";

import { useFormAction } from "@/lib/useFormAction";
import { FormMessage } from "@/components/FormState";
import { rentalQuoteStatus } from "./actions";

export default function QuoteActions({ id, op, label, confirm }: { id: number; op: "lose" | "reopen"; label: string; confirm?: string }) {
  const [state, action, pending] = useFormAction(rentalQuoteStatus);
  return (
    <form
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
          return;
        }
        action(e);
      }}
      className="inline-flex flex-col gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <button className="btn" disabled={pending}>{label}</button>
      <FormMessage state={state} />
    </form>
  );
}
