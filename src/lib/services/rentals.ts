// 租賃：出租設備、租約、每期自動產生銷貨單、退租與押金
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB, Tx } from "@/db";
import {
  customers,
  products,
  rentalAssets,
  rentalBills,
  rentalContracts,
  rentalItems,
  rentalQuotes,
  serialNumbers,
  stockMovements,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  addDaysTW,
  addMonthsTW,
  daysInclusiveTW,
  dateStr,
  monthsDiffTW,
  startOfTaipeiDay,
  type TaxType,
} from "@/lib/format";
import { createSale, normalizeSerial } from "./inventory";
import { nextNumber } from "./numbering";

type Contract = typeof rentalContracts.$inferSelect;
type Item = typeof rentalItems.$inferSelect;

// ───────── 出租設備 ─────────

export type AssetInput = {
  code: string;
  name: string;
  monthlyRate: number;
  dailyRate: number;
  cost?: number; // 未提供（無權限看成本）時保留原值
  acquiredAt?: Date | null;
  note?: string | null;
  status?: "AVAILABLE" | "MAINTENANCE" | "RETIRED";
};

function checkAsset(a: AssetInput) {
  if (!a.code.trim()) throw new AppError("請填寫設備編號");
  if (!a.name.trim()) throw new AppError("請填寫設備名稱");
  for (const [k, v] of [["月租", a.monthlyRate], ["日租", a.dailyRate], ["成本", a.cost ?? 0]] as const) {
    if (!Number.isInteger(v) || v < 0) throw new AppError(`${k}必須是 0 以上的整數`);
  }
}

export async function saveAsset(db: DB, input: AssetInput, id?: number) {
  checkAsset(input);
  const code = normalizeSerial(input.code);
  const dup = await db.query.rentalAssets.findFirst({ where: eq(rentalAssets.code, code) });
  if (dup && dup.id !== id) throw new AppError(`設備編號 ${code} 已存在`);
  const data = {
    code,
    name: input.name.trim(),
    monthlyRate: input.monthlyRate,
    dailyRate: input.dailyRate,
    ...(input.cost !== undefined ? { cost: input.cost } : {}),
    acquiredAt: input.acquiredAt ?? null,
    note: input.note?.trim() || null,
  };
  if (id) {
    const cur = await db.query.rentalAssets.findFirst({ where: eq(rentalAssets.id, id) });
    if (!cur) throw new AppError("找不到設備");
    // 出租中的設備狀態由租約控制
    const status = cur.status === "RENTED" ? "RENTED" : (input.status ?? cur.status);
    await db.update(rentalAssets).set({ ...data, status }).where(eq(rentalAssets.id, id));
    return { id };
  }
  const [a] = await db.insert(rentalAssets).values(data).returning({ id: rentalAssets.id });
  return a;
}

// 由庫存序號轉為出租設備：庫存減 1、序號狀態改為「出租設備」
export async function assetFromStock(
  db: DB,
  input: { serial: string; name?: string; monthlyRate: number; dailyRate: number },
  userId: number,
) {
  const serial = normalizeSerial(input.serial);
  if (!serial) throw new AppError("請輸入序號");
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(serialNumbers)
      .where(and(eq(serialNumbers.serial, serial), eq(serialNumbers.status, "IN_STOCK")))
      .for("update");
    if (!rows.length) throw new AppError(`序號 ${serial} 不在庫存中`);
    if (rows.length > 1) throw new AppError(`序號 ${serial} 對應多項商品，請手動新增設備`);
    const sn = rows[0];
    const [p] = await tx.select().from(products).where(eq(products.id, sn.productId)).for("update");
    const dup = await tx.query.rentalAssets.findFirst({ where: eq(rentalAssets.code, serial) });
    if (dup) throw new AppError(`設備編號 ${serial} 已存在`);
    const newQty = p.stockQty - 1;
    await tx.update(products).set({ stockQty: newQty, updatedAt: new Date() }).where(eq(products.id, p.id));
    await tx.update(serialNumbers).set({ status: "RENTAL" }).where(eq(serialNumbers.id, sn.id));
    await tx.insert(stockMovements).values({
      productId: p.id,
      type: "ADJUST",
      qty: -1,
      balanceAfter: newQty,
      unitCost: p.avgCost,
      refNumber: serial,
      note: "轉為出租設備",
      createdById: userId,
    });
    const [a] = await tx
      .insert(rentalAssets)
      .values({
        code: serial,
        name: input.name?.trim() || p.name,
        monthlyRate: input.monthlyRate,
        dailyRate: input.dailyRate,
        cost: p.avgCost,
        serialId: sn.id,
        acquiredAt: sn.purchasedAt,
      })
      .returning({ id: rentalAssets.id });
    return a;
  });
}

// ───────── 租約 ─────────

export type ContractInput = {
  customerId: number;
  contact?: string | null;
  phone?: string | null;
  address?: string | null;
  salespersonId?: number | null;
  billingType: "MONTHLY" | "DAILY";
  billingMonths: number;
  startDate: Date;
  endDate?: Date | null;
  taxType: TaxType;
  paymentMethod: "CASH" | "CARD" | "TRANSFER" | "CREDIT";
  deposit: number;
  depositReceived?: boolean;
  note?: string | null;
  items: { assetId: number; rate: number }[];
  quoteId?: number | null; // 由租賃報價單轉入
};

export async function createContract(db: DB, input: ContractInput, userId: number) {
  if (!input.items.length) throw new AppError("請至少選擇一台設備");
  if (new Set(input.items.map((i) => i.assetId)).size !== input.items.length) throw new AppError("設備重複");
  for (const it of input.items) {
    if (!Number.isInteger(it.rate) || it.rate < 0) throw new AppError("租金必須是 0 以上的整數");
  }
  if (!Number.isInteger(input.deposit) || input.deposit < 0) throw new AppError("押金必須是 0 以上的整數");
  if (input.billingType === "MONTHLY") {
    if (!Number.isInteger(input.billingMonths) || input.billingMonths < 1 || input.billingMonths > 36) {
      throw new AppError("每次收款月數必須是 1～36");
    }
  } else if (!input.endDate) {
    throw new AppError("按天計租請填寫結束日期");
  }
  if (input.endDate && input.endDate < input.startDate) throw new AppError("結束日期不可早於開始日期");

  return db.transaction(async (tx) => {
    const c = await tx.query.customers.findFirst({ where: eq(customers.id, input.customerId) });
    if (!c) throw new AppError("請選擇客戶");
    const ids = input.items.map((i) => i.assetId);
    const assets = await tx.select().from(rentalAssets).where(inArray(rentalAssets.id, ids)).orderBy(rentalAssets.id).for("update");
    if (assets.length !== ids.length) throw new AppError("找不到設備");
    const busy = assets.find((a) => a.status !== "AVAILABLE");
    if (busy) throw new AppError(`設備 ${busy.code} 目前不能出租（${busy.status === "RENTED" ? "出租中" : "維修中或停用"}）`);

    const number = await nextNumber(tx, "R", "rental_contracts", new Date());
    const [k] = await tx
      .insert(rentalContracts)
      .values({
        number,
        customerId: input.customerId,
        contact: input.contact?.trim() || null,
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
        salespersonId: input.salespersonId || null,
        billingType: input.billingType,
        billingMonths: input.billingType === "MONTHLY" ? input.billingMonths : 1,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        nextBillDate: input.startDate,
        taxType: input.taxType,
        paymentMethod: input.paymentMethod,
        deposit: input.deposit,
        depositReceivedAt: input.depositReceived && input.deposit > 0 ? new Date() : null,
        note: input.note?.trim() || null,
        createdById: userId,
      })
      .returning();
    await tx.insert(rentalItems).values(
      input.items.map((it) => ({ contractId: k.id, assetId: it.assetId, rate: it.rate, startDate: input.startDate })),
    );
    await tx.update(rentalAssets).set({ status: "RENTED" }).where(inArray(rentalAssets.id, ids));
    if (input.quoteId) {
      const [q] = await tx.select().from(rentalQuotes).where(eq(rentalQuotes.id, input.quoteId)).for("update");
      if (!q) throw new AppError("找不到租賃報價單");
      if (q.status !== "QUOTE") throw new AppError(`報價單 ${q.number} 已${q.status === "ACCEPTED" ? "轉成租約" : "標記未成交"}`);
      await tx
        .update(rentalQuotes)
        .set({ status: "ACCEPTED", contractId: k.id, customerId: input.customerId, customerName: null, updatedAt: new Date() })
        .where(eq(rentalQuotes.id, q.id));
    }
    return k;
  });
}

// 計算下一期：期間、每台計費數量（月數或天數）
export function nextPeriod(c: Pick<Contract, "billingType" | "billingMonths" | "startDate" | "endDate" | "nextBillDate">) {
  if (!c.nextBillDate) return null;
  const start = c.nextBillDate;
  if (c.endDate && start > c.endDate) return null;
  if (c.billingType === "DAILY") {
    const end = c.endDate ?? start;
    return { start, end, units: daysInclusiveTW(start, end), unitLabel: "天", next: null as Date | null };
  }
  // 以租約起始日為基準計算，避免月底日期越算越偏
  const offset = monthsDiffTW(c.startDate, start);
  let months = c.billingMonths;
  let nextStart = addMonthsTW(c.startDate, offset + months);
  let end = addDaysTW(nextStart, -1);
  if (c.endDate && end > c.endDate) {
    // 最後一期：收到約定到期日為止（不足一個月以一個月計）
    months = 1;
    while (addDaysTW(addMonthsTW(c.startDate, offset + months), -1) < c.endDate) months++;
    nextStart = addMonthsTW(c.startDate, offset + months);
    end = c.endDate;
  }
  const next = c.endDate && nextStart > c.endDate ? null : nextStart;
  return { start, end, units: months, unitLabel: "個月", next };
}

// 這一期要收費的設備：開始日在本期結束前、且在本期開始前尚未收回
export function billableItems<T extends Item>(items: T[], period: { start: Date; end: Date }): T[] {
  return items.filter((i) => i.startDate <= period.end && (!i.returnedAt || i.returnedAt > period.start));
}

async function rentalProductId(tx: Tx) {
  await tx
    .insert(products)
    .values({ sku: "RENTAL", name: "設備租金", unit: "期", isService: true, warrantyMonths: 0 })
    .onConflictDoNothing({ target: products.sku });
  const [p] = await tx.select({ id: products.id, isService: products.isService }).from(products).where(eq(products.sku, "RENTAL"));
  if (!p.isService) await tx.update(products).set({ isService: true }).where(eq(products.id, p.id));
  return p.id;
}

// 產生下一期租金：建立銷貨單並記錄帳單
export async function billContract(db: DB, contractId: number, userId: number) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(rentalContracts).where(eq(rentalContracts.id, contractId)).for("update");
    if (!c) throw new AppError("找不到租約");
    const period = nextPeriod(c);
    if (!period) throw new AppError("這份租約已經沒有待收的租期");
    const items = await tx.query.rentalItems.findMany({
      where: eq(rentalItems.contractId, contractId),
      with: { asset: true },
    });
    const active = billableItems(items, period);
    if (!active.length) throw new AppError("這一期沒有出租中的設備");

    const productId = await rentalProductId(tx);
    const customer = await tx.query.customers.findFirst({ where: eq(customers.id, c.customerId) });
    const range = `${dateStr(period.start)}～${dateStr(period.end)}`;
    const unitName = c.billingType === "DAILY" ? "日租" : "月租";
    const sale = await createSale(
      tx as unknown as DB,
      {
        customerId: c.customerId,
        buyerTaxId: customer?.taxId ?? null,
        paymentMethod: c.paymentMethod,
        taxType: c.taxType,
        salespersonId: c.salespersonId,
        contact: c.contact,
        deliveryAddress: c.address,
        date: new Date(),
        note: `租約 ${c.number} 租金 ${range}`,
        items: active.map((i) => ({
          productId,
          qty: period.units,
          unitPrice: i.rate,
          description: `${i.asset.code} ${i.asset.name}｜${range}（${period.units} ${period.unitLabel}，${unitName} ${i.rate}）`,
        })),
      },
      userId,
    );
    await tx.insert(rentalBills).values({ contractId, periodStart: period.start, periodEnd: period.end, saleId: sale.id });
    await tx.update(rentalContracts).set({ nextBillDate: period.next }).where(eq(rentalContracts.id, contractId));
    return sale;
  });
}

// 應開帳：租約中、下一期起始日已到（含今天）
export async function dueContracts(db: DB, asOf: Date = new Date()) {
  const end = addDaysTW(startOfTaipeiDay(asOf), 1);
  return db
    .select({ id: rentalContracts.id })
    .from(rentalContracts)
    .where(
      and(
        eq(rentalContracts.status, "ACTIVE"),
        sql`${rentalContracts.nextBillDate} is not null and ${rentalContracts.nextBillDate} < ${end}`,
        sql`(${rentalContracts.endDate} is null or ${rentalContracts.nextBillDate} <= ${rentalContracts.endDate})`,
      ),
    );
}

// 收回部分設備
export async function returnItems(db: DB, contractId: number, itemIds: number[], date: Date) {
  if (!itemIds.length) throw new AppError("請選擇要收回的設備");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(rentalContracts).where(eq(rentalContracts.id, contractId)).for("update");
    if (!c || c.status !== "ACTIVE") throw new AppError("租約不是租約中");
    const items = await tx
      .select()
      .from(rentalItems)
      .where(and(eq(rentalItems.contractId, contractId), inArray(rentalItems.id, itemIds), isNull(rentalItems.returnedAt)));
    if (items.length !== itemIds.length) throw new AppError("設備已收回或不屬於這份租約");
    if (items.some((i) => date < i.startDate)) throw new AppError("收回日期不可早於出租日期");
    await tx.update(rentalItems).set({ returnedAt: date }).where(inArray(rentalItems.id, itemIds));
    await tx
      .update(rentalAssets)
      .set({ status: "AVAILABLE" })
      .where(inArray(rentalAssets.id, items.map((i) => i.assetId)));
  });
}

// 加租設備（從指定日期開始，下一期起一併收費）
export async function addItems(db: DB, contractId: number, items: { assetId: number; rate: number }[], date: Date) {
  if (!items.length) throw new AppError("請選擇設備");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(rentalContracts).where(eq(rentalContracts.id, contractId)).for("update");
    if (!c || c.status !== "ACTIVE") throw new AppError("租約不是租約中");
    const ids = items.map((i) => i.assetId);
    const assets = await tx.select().from(rentalAssets).where(inArray(rentalAssets.id, ids)).orderBy(rentalAssets.id).for("update");
    const busy = assets.find((a) => a.status !== "AVAILABLE");
    if (assets.length !== ids.length || busy) throw new AppError(`設備 ${busy?.code ?? ""} 目前不能出租`);
    await tx.insert(rentalItems).values(items.map((i) => ({ contractId, assetId: i.assetId, rate: i.rate, startDate: date })));
    await tx.update(rentalAssets).set({ status: "RENTED" }).where(inArray(rentalAssets.id, ids));
  });
}

// 押金收取
export async function receiveDeposit(db: DB, contractId: number) {
  const c = await db.query.rentalContracts.findFirst({ where: eq(rentalContracts.id, contractId) });
  if (!c) throw new AppError("找不到租約");
  if (c.deposit <= 0) throw new AppError("這份租約沒有押金");
  if (c.depositReceivedAt) throw new AppError("押金已收");
  await db.update(rentalContracts).set({ depositReceivedAt: new Date() }).where(eq(rentalContracts.id, contractId));
}

// 結束租約：收回全部設備、記錄押金退還
export async function endContract(db: DB, contractId: number, input: { date: Date; depositRefund?: number | null }) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(rentalContracts).where(eq(rentalContracts.id, contractId)).for("update");
    if (!c) throw new AppError("找不到租約");
    if (c.status !== "ACTIVE") throw new AppError("租約已結束");
    if (input.date < c.startDate) throw new AppError("結束日期不可早於租約開始日期");
    if (c.nextBillDate && c.nextBillDate <= input.date && (!c.endDate || c.nextBillDate <= c.endDate)) {
      throw new AppError(`${dateStr(c.nextBillDate)} 起的租金尚未開帳，請先產生帳單再結束租約`);
    }
    let refund: number | null = null;
    if (c.depositReceivedAt && !c.depositRefundedAt) {
      refund = input.depositRefund ?? c.deposit;
      if (!Number.isInteger(refund) || refund < 0 || refund > c.deposit) {
        throw new AppError(`退還押金必須是 0～${c.deposit}`);
      }
    }
    const open = await tx
      .select()
      .from(rentalItems)
      .where(and(eq(rentalItems.contractId, contractId), isNull(rentalItems.returnedAt)));
    if (open.length) {
      await tx.update(rentalItems).set({ returnedAt: input.date }).where(inArray(rentalItems.id, open.map((i) => i.id)));
      await tx.update(rentalAssets).set({ status: "AVAILABLE" }).where(inArray(rentalAssets.id, open.map((i) => i.assetId)));
    }
    await tx
      .update(rentalContracts)
      .set({
        status: "ENDED",
        endedAt: input.date,
        nextBillDate: null,
        ...(refund !== null ? { depositRefund: refund, depositRefundedAt: new Date() } : {}),
      })
      .where(eq(rentalContracts.id, contractId));
  });
}
