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
