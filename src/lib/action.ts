import { AppError } from "./errors";

export type ActionState = { error?: string; ok?: string } | undefined;

// 將 AppError 轉成畫面上的錯誤訊息；其他錯誤記錄後顯示通用訊息
export async function runAction(fn: () => Promise<void | string>): Promise<ActionState> {
  try {
    const ok = await fn();
    return ok ? { ok } : {};
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    // redirect() 會以例外方式運作，需要繼續往外丟
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_")) {
      throw e;
    }
    console.error(e);
    return { error: "發生未預期的錯誤，請稍後再試" };
  }
}

// 表單欄位讀取
export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
export function optStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}
export function int(fd: FormData, key: string, label: string, { min = 0 } = {}): number {
  const raw = str(fd, key).replace(/,/g, "");
  if (raw === "") return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new AppError(`${label}必須是 ${min} 以上的整數`);
  return n;
}
export function required(fd: FormData, key: string, label: string): string {
  const v = str(fd, key);
  if (!v) throw new AppError(`請填寫${label}`);
  return v;
}
