// 顯示格式（台灣時區、新台幣）
export const TZ = "Asia/Taipei";

export function money(n: number | null | undefined): string {
  return "$" + (n ?? 0).toLocaleString("zh-TW");
}

export function dateStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("zh-TW", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function dateTimeStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("zh-TW", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// 台灣日期 YYYYMMDD，用於單號
export function ymd(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}${get("month")}${get("day")}`;
}

// 台灣當天 00:00 對應的 Date
export function startOfTaipeiDay(d: Date = new Date()): Date {
  const s = ymd(d);
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00+08:00`);
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: "現金",
  CARD: "刷卡",
  TRANSFER: "轉帳",
  CREDIT: "月結",
};

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "老闆",
  STAFF: "店員",
  ACCOUNTANT: "會計",
};

export const SERIAL_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "在庫",
  SOLD: "已售出",
  RETURNED: "退回",
  RMA: "維修中",
  SCRAPPED: "報廢",
};

export const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: "進貨",
  SALE: "銷貨",
  ADJUST: "調整",
};

// 由含稅總額計算 5% 營業稅
export function taxFromTotal(total: number): number {
  return Math.round(total - total / 1.05);
}

// ───────── 稅別 ─────────
export type TaxType = "INCLUDED" | "EXCLUDED";

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  INCLUDED: "含稅",
  EXCLUDED: "外加稅",
};

// 由「數量 × 單價」的合計，依稅別算出未稅、稅額、含稅總額
export function calcTotals(lineSum: number, taxType: TaxType) {
  if (taxType === "EXCLUDED") {
    const tax = Math.round(lineSum * 0.05);
    return { subtotal: lineSum, tax, total: lineSum + tax };
  }
  const tax = taxFromTotal(lineSum);
  return { subtotal: lineSum - tax, tax, total: lineSum };
}

// 切換稅別時換算單價
export function convertPrice(price: number, from: TaxType, to: TaxType): number {
  if (from === to) return price;
  return to === "EXCLUDED" ? Math.round(price / 1.05) : Math.round(price * 1.05);
}

// ───────── 報價單／訂單狀態 ─────────
export const ORDER_STATUS_LABELS: Record<string, string> = {
  QUOTE: "報價中",
  CONFIRMED: "已成交・待出貨",
  COMPLETED: "已出貨結案",
  CLOSED: "手動結案",
  LOST: "未成交",
};

// yyyy-mm-dd（台灣日期），給 <input type="date"> 使用
export function isoDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const s = ymd(new Date(d));
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// 把 <input type="date"> 的值轉成台灣當天 00:00
export function parseDateInput(v: string | null | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T00:00:00+08:00`);
}

// 統一編號檢查碼（財政部規則：加權和可被 5 整除；第 7 碼為 7 時另有規則）
export function isValidTaxId(t: string | null | undefined): boolean {
  if (!t || !/^\d{8}$/.test(t)) return false;
  const w = [1, 2, 1, 2, 1, 2, 4, 1];
  const sum = w.reduce((s, x, i) => {
    const p = Number(t[i]) * x;
    return s + Math.floor(p / 10) + (p % 10);
  }, 0);
  return sum % 5 === 0 || (t[6] === "7" && (sum + 1) % 5 === 0);
}
