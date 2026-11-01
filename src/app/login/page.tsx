"use client";

import { useFormAction } from "@/lib/useFormAction";
import { login } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useFormAction(login);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={action} className="card w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-2 h-12 w-12" />
          <h1 className="text-xl font-bold">MERIT ERP</h1>
          <p className="text-sm text-gray-500">請登入</p>
        </div>
        <div>
          <label className="label" htmlFor="username">帳號</label>
          <input id="username" name="username" className="input" autoComplete="username" autoCapitalize="none" required />
        </div>
        <div>
          <label className="label" htmlFor="password">密碼</label>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "登入中…" : "登入"}
        </button>
      </form>
    </main>
  );
}
