// 報價單／訂單：同一張單，報價中 → 成交（訂單）→ 轉銷貨出貨
import { eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { customers, orders, orderItems, products, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { calcTotals, type TaxType } from "@/lib/format";
import { nextNumber } from "./numbering";
import { reservedQty } from "./products";

export type OrderInput = {
  date?: Date;
  validUntil?: Date | null;
  customerId?: number | null;
  customerName?: string | null;
  contact?: string | null;
  phone?: string | null;
  buyerTaxId?: string | null;
  salespersonId?: number | null;
  customerPo?: string | null;
  paymentTerms?: string | null;
  deliveryDate?: Date | null;
  taxType: TaxType;
  note?: string | null;
  confirm?: boolean; // 儲存後直接成交
  items: { productId: number; qty: number; unitPrice: number; description?: string | null }[];
};

const clean = (s: string | null | undefined) => s?.trim() || null;

function validate(input: OrderInput) {
  if (!input.items.length) throw new AppError("請至少加入一項商品");
  for (const it of input.items) {
    if (!Number.isInteger(it.qty) || it.qty <= 0) throw new AppError("數量必須是正整數");
    if (!Number.isInteger(it.unitPrice) || it.unitPrice < 0) throw new AppError("售價必須是 0 以上的整數");
  }
  if (input.taxType !== "INCLUDED" && input.taxType !== "EXCLUDED") throw new AppError("請選擇稅別");
  const taxId = clean(input.buyerTaxId);
  if (taxId && !/^\d{8}$/.test(taxId)) throw new AppError("統一編號必須是 8 位數字");
}

// 新增或修改（id 有值時為修改）
export async function saveOrder(db: DB, input: OrderInput, userId: number, id?: number) {
  validate(input);
  const date = input.date ?? new Date();
  const lineSum = input.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const totals = calcTotals(lineSum, input.taxType);

  return db.transaction(async (tx) => {
    if (input.customerId) {
      const c = await tx.query.customers.findFirst({ where: eq(customers.id, input.customerId) });
      if (!c) throw new AppError("找不到客戶");
    }
    if (input.salespersonId) {
      const u = await tx.query.users.findFirst({ where: eq(users.id, input.salespersonId) });
      if (!u) throw new AppError("找不到業務人員");
    }
    const ids = [...new Set(input.items.map((i) => i.productId))];
    const found = await tx.select({ id: products.id }).from(products).where(inArray(products.id, ids));
    if (found.length !== ids.length) throw new AppError("找不到商品");

    const header = {
      date,
      validUntil: input.validUntil ?? null,
      customerId: input.customerId || null,
      customerName: input.customerId ? null : clean(input.customerName),
      contact: clean(input.contact),
      phone: clean(input.phone),
      buyerTaxId: clean(input.buyerTaxId),
      salespersonId: input.salespersonId || null,
      customerPo: clean(input.customerPo),
      paymentTerms: clean(input.paymentTerms),
      deliveryDate: input.deliveryDate ?? null,
      taxType: input.taxType,
      subtotal: totals.subtotal,
      taxAmount: totals.tax,
      total: totals.total,
      note: clean(input.note),
      updatedAt: new Date(),
    };

    let orderId: number;
    if (id) {
      const [cur] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
      if (!cur) throw new AppError("找不到這張單");
      if (cur.status !== "QUOTE" && cur.status !== "CONFIRMED") throw new AppError("已結案或未成交的單不能修改");
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
      if (items.some((i) => i.shippedQty > 0)) throw new AppError("已經有出貨紀錄，不能修改內容");
      await tx.update(orders).set(header).where(eq(orders.id, id));
      await tx.delete(orderItems).where(eq(orderItems.orderId, id));
      orderId = id;
      if (input.confirm && cur.status === "QUOTE") {
        await tx.update(orders).set({ status: "CONFIRMED", confirmedAt: new Date() }).where(eq(orders.id, id));
      }
    } else {
      const number = await nextNumber(tx, "Q", "orders", date);
      const [o] = await tx
        .insert(orders)
        .values({
          ...header,
          number,
          status: input.confirm ? "CONFIRMED" : "QUOTE",
          confirmedAt: input.confirm ? new Date() : null,
          createdById: userId,
        })
        .returning({ id: orders.id });
      orderId = o.id;
    }

    await tx.insert(orderItems).values(
      input.items.map((it, i) => ({
        orderId,
        productId: it.productId,
        description: clean(it.description),
        qty: it.qty,
        unitPrice: it.unitPrice,
        subtotal: it.qty * it.unitPrice,
        sort: i,
      })),
    );
    return { id: orderId };
  });
}

// 狀態變更
export type OrderOp = "confirm" | "unconfirm" | "lose" | "close" | "reopen";

const TRANSITIONS: Record<OrderOp, { from: string[]; to: "QUOTE" | "CONFIRMED" | "CLOSED" | "LOST" }> = {
  confirm: { from: ["QUOTE"], to: "CONFIRMED" }, // 客戶確認，成交
  unconfirm: { from: ["CONFIRMED"], to: "QUOTE" }, // 取消成交，回到報價
  lose: { from: ["QUOTE"], to: "LOST" }, // 未成交
  close: { from: ["CONFIRMED"], to: "CLOSED" }, // 手動結案（剩下的不出了）
  reopen: { from: ["LOST", "CLOSED"], to: "QUOTE" }, // 重新開啟
};

export async function setOrderStatus(db: DB, id: number, op: OrderOp) {
  const t = TRANSITIONS[op];
  if (!t) throw new AppError("不支援的操作");
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
    if (!o) throw new AppError("找不到這張單");
    if (!t.from.includes(o.status)) throw new AppError("這張單目前的狀態不能執行此操作");
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
    const shipped = items.some((i) => i.shippedQty > 0);
    if (op === "unconfirm" && shipped) throw new AppError("已經有出貨紀錄，不能取消成交");

    let to: string = t.to;
    // 曾經出貨過的單重新開啟時，回到「已成交」
    if (op === "reopen" && (o.status === "CLOSED" || shipped)) to = "CONFIRMED";
    const now = new Date();
    await tx
      .update(orders)
      .set({
        status: to as typeof o.status,
        confirmedAt: to === "CONFIRMED" ? (o.confirmedAt ?? now) : to === "QUOTE" ? null : o.confirmedAt,
        closedAt: to === "CLOSED" || to === "LOST" ? now : null,
        updatedAt: now,
      })
      .where(eq(orders.id, id));
    return to;
  });
}

// 計算每一項的待出貨與缺貨數量
// 可用量 = 目前庫存 − 其他已成交訂單的預訂量
export async function orderShortage(db: DB, orderId: number) {
  const items = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      qty: orderItems.qty,
      shippedQty: orderItems.shippedQty,
      stockQty: products.stockQty,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.sort, orderItems.id);
  const others = await reservedQty(db, [...new Set(items.map((i) => i.productId))], orderId);
  // 同一商品出現多行時，依序分配可用量
  const left = new Map<number, number>();
  return items.map((it) => {
    const remaining = Math.max(it.qty - it.shippedQty, 0);
    const pool = left.has(it.productId)
      ? left.get(it.productId)!
      : Math.max(it.stockQty - (others.get(it.productId) ?? 0), 0);
    const use = Math.min(pool, remaining);
    left.set(it.productId, pool - use);
    return { id: it.id, productId: it.productId, remaining, available: pool, short: remaining - use };
  });
}
