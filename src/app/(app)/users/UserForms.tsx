"use client";

import { useFormAction } from "@/lib/useFormAction";
import { createUser, updateUser, changeMyPassword } from "./actions";
import { Field, FormMessage } from "@/components/FormState";

const roleOptions = (
  <>
    <option value="STAFF">店員（進貨、銷貨，看不到成本與毛利）</option>
    <option value="ACCOUNTANT">會計（查詢與報表，可看成本）</option>
    <option value="OWNER">老闆（全部權限）</option>
  </>
);

export function NewUserForm() {
  const [state, action, pending] = useFormAction(createUser, { resetOnSuccess: true });
  return (
    <form onSubmit={action} className="card space-y-3">
      <h2 className="font-semibold">新增帳號</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="帳號"><input name="username" className="input" autoCapitalize="none" required /></Field>
        <Field label="姓名"><input name="name" className="input" required /></Field>
        <Field label="初始密碼" hint="至少 8 個字元"><input name="password" type="password" className="input" autoComplete="new-password" required /></Field>
        <Field label="角色"><select name="role" className="input" defaultValue="STAFF">{roleOptions}</select></Field>
      </div>
      <FormMessage state={state} />
      <button className="btn-primary" disabled={pending}>建立帳號</button>
    </form>
  );
}

export function EditUserForm({
  user,
}: {
  user: { id: number; username: string; name: string; role: string; active: boolean };
}) {
  const [state, action, pending] = useFormAction(updateUser.bind(null, user.id));
  return (
    <form onSubmit={action} className="card space-y-3">
      <div className="font-mono text-sm text-gray-500">{user.username}</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="姓名"><input name="name" defaultValue={user.name} className="input" required /></Field>
        <Field label="角色"><select name="role" defaultValue={user.role} className="input">{roleOptions}</select></Field>
        <Field label="重設密碼" hint="空白表示不變更"><input name="password" type="password" className="input" autoComplete="new-password" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={user.active} className="h-4 w-4" /> 啟用
      </label>
      <FormMessage state={state} />
      <button className="btn" disabled={pending}>儲存</button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useFormAction(changeMyPassword);
  return (
    <form onSubmit={action} className="card max-w-md space-y-3">
      <Field label="目前密碼"><input name="current" type="password" className="input" autoComplete="current-password" required /></Field>
      <Field label="新密碼" hint="至少 8 個字元"><input name="password" type="password" className="input" autoComplete="new-password" required /></Field>
      <Field label="再輸入一次新密碼"><input name="confirm" type="password" className="input" autoComplete="new-password" required /></Field>
      <FormMessage state={state} />
      <button className="btn-primary" disabled={pending}>更新密碼</button>
    </form>
  );
}
