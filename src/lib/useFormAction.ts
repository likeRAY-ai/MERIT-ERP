"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import type { ActionState } from "./action";

// 送出表單但不清空欄位：React 預設在送出後會重設表單，
// 遇到錯誤時使用者輸入的內容會消失，這裡改為手動送出以保留內容。
// resetOnSuccess：成功後清空表單（例如新增帳號）
export function useFormAction(
  action: (s: ActionState, fd: FormData) => Promise<ActionState>,
  { resetOnSuccess = false } = {},
) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement | null>(null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    formRef.current = e.currentTarget;
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);
  return [state, onSubmit, pending] as const;
}
