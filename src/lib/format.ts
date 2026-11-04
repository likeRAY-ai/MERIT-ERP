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

// ───────── 台灣日期計算（以台灣當天 00:00 表示一天） ─────────
function twParts(d: Date) {
  const s = ymd(d);
  return { y: Number(s.slice(0, 4)), m: Number(s.slice(4, 6)), d: Number(s.slice(6, 8)) };
}
function twDate(y: number, m: number, d: number) {
  return new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+08:00`);
}

// 加 n 個月（月底自動對齊，例如 1/31 + 1 個月 = 2/28）
export function addMonthsTW(d: Date, n: number): Date {
  const p = twParts(d);
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return twDate(y, m, Math.min(p.d, last));
}

export function addDaysTW(d: Date, n: number): Date {
  const p = twParts(d);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return twDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// 兩個日期相差幾個月（只看年月）
export function monthsDiffTW(a: Date, b: Date): number {
  const pa = twParts(a);
  const pb = twParts(b);
  return (pb.y - pa.y) * 12 + (pb.m - pa.m);
}

// 包含頭尾的天數
export function daysInclusiveTW(a: Date, b: Date): number {
  const pa = twParts(a);
  const pb = twParts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400_000) + 1;
}

// ───────── 租賃 ─────────
export const ASSET_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "可出租",
  RENTED: "出租中",
  MAINTENANCE: "維修中",
  RETIRED: "停用",
};

export function billingLabel(c: { billingType: string; billingMonths: number }) {
  if (c.billingType === "DAILY") return "按天計租";
  return c.billingMonths === 1 ? "每月收款" : `每 ${c.billingMonths} 個月收一次`;
}

// 金額大寫（新台幣），例如 12345 → 壹萬貳仟參佰肆拾伍元整
export function chineseAmount(n: number): string {
  const digits = "零壹貳參肆伍陸柒捌玖";
  const small = ["", "拾", "佰", "仟"];
  const big = ["", "萬", "億", "兆"];
  if (!Number.isFinite(n)) return "";
  const neg = n < 0;
  let v = Math.round(Math.abs(n));
  if (v === 0) return "零元整";
  const groups: number[] = [];
  while (v > 0) {
    groups.push(v % 10000);
    v = Math.floor(v / 10000);
  }
  let out = "";
  let needZero = false;
  for (let g = groups.length - 1; g >= 0; g--) {
    const grp = groups[g];
    if (grp === 0) {
      needZero = out !== "";
      continue;
    }
    if (needZero || (out !== "" && grp < 1000)) out += "零";
    needZero = false;
    let s = "";
    let zero = false;
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(grp / 10 ** i) % 10;
      if (d === 0) {
        zero = s !== "";
      } else {
        if (zero) s += "零";
        zero = false;
        s += digits[d] + small[i];
      }
    }
    out += s + big[g];
  }
  return (neg ? "負" : "") + out + "元整";
}

export const RENTAL_QUOTE_STATUS_LABELS: Record<string, string> = {
  QUOTE: "報價中",
  ACCEPTED: "已成交・已轉租約",
  LOST: "未成交",
};
