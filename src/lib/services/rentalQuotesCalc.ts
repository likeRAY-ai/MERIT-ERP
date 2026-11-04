// 租賃報價單試算（前端與伺服器共用，不可引用資料庫）
import { addDaysTW, addMonthsTW, calcTotals, type TaxType } from "@/lib/format";

export type QuoteLine = {
  kind: "RENT" | "FEE";
  name: string;
  description?: string | null;
  qty: number;
  unitPrice: number;
};

// 報價金額試算
export function quoteTotals(
  q: { billingType: "MONTHLY" | "DAILY"; term: number | null; taxType: TaxType },
  items: QuoteLine[],
) {
  const rent = items.filter((i) => i.kind === "RENT").reduce((s, i) => s + i.qty * i.unitPrice, 0); // 每月（每天）租金
  const fees = items.filter((i) => i.kind === "FEE").reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const units = items.filter((i) => i.kind === "RENT").reduce((s, i) => s + i.qty, 0);
  const period = calcTotals(rent, q.taxType);
  const feeT = calcTotals(fees, q.taxType);
  const termRent = q.term ? rent * q.term : null;
  const grand = termRent !== null ? calcTotals(termRent + fees, q.taxType) : null;
  return { rent, fees, units, period, feeT, termRent, grand };
}

// 依租期推算到期日（開始日起算 N 個月或 N 天，含開始日）
export function quoteEndDate(start: Date, billingType: "MONTHLY" | "DAILY", term: number | null) {
  if (!term) return null;
  return billingType === "DAILY" ? addDaysTW(start, term - 1) : addDaysTW(addMonthsTW(start, term), -1);
}

