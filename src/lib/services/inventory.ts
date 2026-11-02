import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB, Tx } from "@/db";
import { products, purchases, purchaseItems, sales, saleItems, serialNumbers, stockMovements, customers, suppliers, orders, orderItems } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { addMonths, calcTotals, type TaxType } from "@/lib/format";
import { nextNumber } from "./numbering";

// 序號統一格式：去除前後空白、轉大寫
export function normalizeSerial(s: string): string {
  return s.trim().toUpperCase();
}

export function parseSerialList(text: string): string[] {
  return text
    .split(/[\s,，;；]+/)
    .map(normalizeSerial)
    .filter(Boolean);
}

type LineInput = { productId: number; qty: number; serials?: string[] };

async function lockProducts(tx: Tx, ids: number[]) {
  // 鎖定商品列，避免同時進出貨造成庫存錯誤
  const rows = await tx
    .select()
    .from(products)
    .where(inArray(products.id, ids))
    .orderBy(products.id)
    .for("update");
  return new Map(rows.map((p) => [p.id, p]));
}

function checkSerialCount(
  line: LineInput,
  p: { name: string; trackSerial: boolean },
): string[] {
  const serials = (line.serials ?? []).map(normalizeSerial).filter(Boolean);
  if (!p.trackSerial) return [];
  if (serials.length !== line.qty) {
    throw new AppError(`「${p.name}」需要序號：數量 ${line.qty}，但輸入了 ${serials.length} 個序號`);
  }
  const dup = serials.find((s, i) => serials.indexOf(s) !== i);
  if (dup) throw new AppError(`「${p.name}」序號重複：${dup}`);
  return serials;
}

// ───────── 進貨 ─────────

export type PurchaseInput = {
  supplierId: number;
  date?: Date;
  note?: string | null;
  items: (LineInput & { unitCost: number })[];
};

export async function createPurchase(db: DB, input: PurchaseInput, userId: number) {
  if (!input.items.length) throw new AppError("請至少加入一項商品");
  for (const it of input.items) {
    if (!Number.isInteger(it.qty) || it.qty <= 0) throw new AppError("數量必須是正整數");
    if (!Number.isInteger(it.unitCost) || it.unitCost < 0) throw new AppError("進貨單價必須是 0 以上的整數");
  }
  const date = input.date ?? new Date();

  return db.transaction(async (tx) => {
    const supplier = await tx.query.suppliers.findFirst({ where: eq(suppliers.id, input.supplierId) });
    if (!supplier) throw new AppError("找不到供應商");

    const map = await lockProducts(tx, [...new Set(input.items.map((i) => i.productId))]);
    const allSerials: { productId: number; serial: string }[] = [];
    const lines = input.items.map((it) => {
      const p = map.get(it.productId);
      if (!p) throw new AppError("找不到商品");
      const serials = checkSerialCount(it, p);
      serials.forEach((serial) => allSerials.push({ productId: p.id, serial }));
      return { ...it, serials, product: p };
    });

    // 同一張單內重複
    const keys = allSerials.map((s) => `${s.productId}:${s.serial}`);
    const dupKey = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dupKey) throw new AppError(`序號重複：${dupKey.split(":")[1]}`);

    // 已存在於系統
    if (allSerials.length) {
      const exists = await tx
        .select({ serial: serialNumbers.serial, status: serialNumbers.status, productId: serialNumbers.productId })
        .from(serialNumbers)
        .where(inArray(serialNumbers.serial, allSerials.map((s) => s.serial)));
      const hit = exists.find((e) => allSerials.some((s) => s.productId === e.productId && s.serial === e.serial));
      if (hit) throw new AppError(`序號 ${hit.serial} 已經存在系統中，無法重複進貨`);
    }

    const number = await nextNumber(tx, "P", "purchases", date);
    const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
    const [purchase] = await tx
      .insert(purchases)
      .values({ number, date, supplierId: input.supplierId, total, note: input.note || null, createdById: userId })
      .returning();

    for (const l of lines) {
      const p = map.get(l.productId)!;
      const newQty = p.stockQty + l.qty;
      // 移動平均成本；若原本庫存為負或 0，直接以本次進價為準
      const newAvg =
        p.stockQty > 0 ? Math.round((p.stockQty * p.avgCost + l.qty * l.unitCost) / newQty) : l.unitCost;

      const [item] = await tx
        .insert(purchaseItems)
        .values({ purchaseId: purchase.id, productId: p.id, qty: l.qty, unitCost: l.unitCost, subtotal: l.qty * l.unitCost })
        .returning();

      await tx
        .update(products)
        .set({ stockQty: newQty, avgCost: newAvg, updatedAt: new Date() })
        .where(eq(products.id, p.id));
      map.set(p.id, { ...p, stockQty: newQty, avgCost: newAvg });

      if (l.serials.length) {
        await tx.insert(serialNumbers).values(
          l.serials.map((serial) => ({
            serial,
            productId: p.id,
            status: "IN_STOCK" as const,
            purchaseItemId: item.id,
            purchasedAt: date,
          })),
        );
      }

      await tx.insert(stockMovements).values({
        productId: p.id,
        type: "PURCHASE",
        qty: l.qty,
        balanceAfter: newQty,
        unitCost: l.unitCost,
        refNumber: number,
        createdById: userId,
      });
    }

    return purchase;
  });
}

// ───────── 銷貨 ─────────

export type SaleInput = {
  customerId?: number | null;
  buyerTaxId?: string | null;
  paymentMethod: "CASH" | "CARD" | "TRANSFER" | "CREDIT";
  taxType?: TaxType; // 預設含稅
  orderId?: number | null; // 由訂單轉銷貨
  salespersonId?: number | null;
  contact?: string | null;
  deliveryMethod?: string | null;
  deliveryAddress?: string | null;
  invoiceNo?: string | null;
  discount?: number; // 折扣金額（與單價同稅別）
  paidAmount?: number | null; // 已收金額；未填時：月結 0，其他全額
  date?: Date;
  note?: string | null;
  items: (LineInput & { unitPrice: number; orderItemId?: number | null })[];
};

export async function createSale(db: DB, input: SaleInput, userId: number) {
  if (!input.items.length) throw new AppError("請至少加入一項商品");
  for (const it of input.items) {
    if (!Number.isInteger(it.qty) || it.qty <= 0) throw new AppError("數量必須是正整數");
    if (!Number.isInteger(it.unitPrice) || it.unitPrice < 0) throw new AppError("售價必須是 0 以上的整數");
  }
  if (input.paymentMethod === "CREDIT" && !input.customerId) {
    throw new AppError("月結必須選擇客戶");
  }
  const taxId = input.buyerTaxId?.trim() || null;
  if (taxId && !/^\d{8}$/.test(taxId)) throw new AppError("統一編號必須是 8 位數字");
  const date = input.date ?? new Date();
  const taxType: TaxType = input.taxType ?? "INCLUDED";
  if (taxType !== "INCLUDED" && taxType !== "EXCLUDED") throw new AppError("請選擇稅別");
  const discount = input.discount ?? 0;
  if (!Number.isInteger(discount) || discount < 0) throw new AppError("折扣金額必須是 0 以上的整數");
  const lineSum = input.items.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  if (discount > lineSum) throw new AppError("折扣金額不可大於商品合計");

  return db.transaction(async (tx) => {
    if (input.customerId) {
      const c = await tx.query.customers.findFirst({ where: eq(customers.id, input.customerId) });
      if (!c) throw new AppError("找不到客戶");
    }

    const map = await lockProducts(tx, [...new Set(input.items.map((i) => i.productId))]);
    const needQty = new Map<number, number>();
    const lines = input.items.map((it) => {
      const p = map.get(it.productId);
      if (!p) throw new AppError("找不到商品");
      const serials = checkSerialCount(it, p);
      needQty.set(p.id, (needQty.get(p.id) ?? 0) + it.qty);
      return { ...it, serials, product: p };
    });

    // 一般商品允許負庫存（先賣後補進貨）；序號商品必須有在庫序號才能出貨
    for (const [pid, q] of needQty) {
      const p = map.get(pid)!;
      if (p.trackSerial && p.stockQty < q) throw new AppError(`「${p.name}」庫存不足：目前 ${p.stockQty}，需要 ${q}`);
    }

    // 檢查序號都在庫
    const allSerials = lines.flatMap((l) => l.serials.map((s) => ({ productId: l.productId, serial: s })));
    const keys = allSerials.map((s) => `${s.productId}:${s.serial}`);
    const dupKey = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dupKey) throw new AppError(`序號重複：${dupKey.split(":")[1]}`);

    const serialRows = new Map<string, { id: number }>();
    if (allSerials.length) {
      const rows = await tx
        .select()
        .from(serialNumbers)
        .where(inArray(serialNumbers.serial, allSerials.map((s) => s.serial)))
        .for("update");
      for (const s of allSerials) {
        const row = rows.find((r) => r.productId === s.productId && r.serial === s.serial);
        const pname = map.get(s.productId)!.name;
        if (!row) throw new AppError(`序號 ${s.serial} 不屬於「${pname}」或尚未進貨`);
        if (row.status !== "IN_STOCK") throw new AppError(`序號 ${s.serial} 目前不在庫存中，無法出貨`);
        serialRows.set(`${s.productId}:${s.serial}`, row);
      }
    }

    // 由訂單出貨：檢查剩餘待出數量
    const orderItemRows = new Map<number, typeof orderItems.$inferSelect>();
    if (input.orderId) {
      const [o] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
      if (!o) throw new AppError("找不到訂單");
      if (o.status !== "CONFIRMED") throw new AppError("訂單必須是「已成交」才能出貨");
      if (taxType !== o.taxType) throw new AppError("稅別必須和訂單相同");
      const rows = await tx.select().from(orderItems).where(eq(orderItems.orderId, o.id));
      rows.forEach((r) => orderItemRows.set(r.id, r));
      const want = new Map<number, number>();
      for (const l of lines) {
        if (!l.orderItemId) continue;
        const oi = orderItemRows.get(l.orderItemId);
        if (!oi || oi.productId !== l.productId) throw new AppError("訂單明細不符");
        want.set(oi.id, (want.get(oi.id) ?? 0) + l.qty);
      }
      for (const [oiId, q] of want) {
        const oi = orderItemRows.get(oiId)!;
        const left = oi.qty - oi.shippedQty;
        if (q > left) {
          throw new AppError(`「${map.get(oi.productId)!.name}」超過訂單待出貨數量：剩 ${left}，本次 ${q}`);
        }
      }
    } else if (lines.some((l) => l.orderItemId)) {
      throw new AppError("訂單明細不符");
    }

    const number = await nextNumber(tx, "S", "sales", date);
    const totals = calcTotals(lineSum - discount, taxType);
    const total = totals.total;
    const paid = input.paidAmount ?? (input.paymentMethod === "CREDIT" ? 0 : total);
    if (!Number.isInteger(paid) || paid < 0) throw new AppError("已收金額必須是 0 以上的整數");
    if (paid > total) throw new AppError(`已收金額不可大於應收總計 ${total}`);
    const costTotal = lines.reduce((s, l) => s + l.qty * map.get(l.productId)!.avgCost, 0);

    const [sale] = await tx
      .insert(sales)
      .values({
        number,
        date,
        customerId: input.customerId || null,
        buyerTaxId: taxId,
        total,
        taxAmount: totals.tax,
        costTotal,
        paymentMethod: input.paymentMethod,
        taxType,
        orderId: input.orderId || null,
        salespersonId: input.salespersonId || null,
        contact: input.contact?.trim() || null,
        deliveryMethod: input.deliveryMethod?.trim() || null,
        deliveryAddress: input.deliveryAddress?.trim() || null,
        invoiceNo: input.invoiceNo?.trim().toUpperCase() || null,
        discount,
        paidAmount: paid,
        note: input.note || null,
        createdById: userId,
      })
      .returning();

    for (const l of lines) {
      const p = map.get(l.productId)!;
      const newQty = p.stockQty - l.qty;
      const [item] = await tx
        .insert(saleItems)
        .values({
          saleId: sale.id,
          productId: p.id,
          qty: l.qty,
          unitPrice: l.unitPrice,
          unitCost: p.avgCost,
          subtotal: l.qty * l.unitPrice,
          orderItemId: l.orderItemId || null,
        })
        .returning();

      if (l.orderItemId) {
        const oi = orderItemRows.get(l.orderItemId)!;
        oi.shippedQty += l.qty;
        await tx.update(orderItems).set({ shippedQty: oi.shippedQty }).where(eq(orderItems.id, oi.id));
      }

      await tx.update(products).set({ stockQty: newQty, updatedAt: new Date() }).where(eq(products.id, p.id));
      map.set(p.id, { ...p, stockQty: newQty });

      if (l.serials.length) {
        const ids = l.serials.map((s) => serialRows.get(`${p.id}:${s}`)!.id);
        await tx
          .update(serialNumbers)
          .set({
            status: "SOLD",
            saleItemId: item.id,
            soldAt: date,
            warrantyUntil: addMonths(date, p.warrantyMonths),
          })
          .where(inArray(serialNumbers.id, ids));
      }

      await tx.insert(stockMovements).values({
        productId: p.id,
        type: "SALE",
        qty: -l.qty,
        balanceAfter: newQty,
        unitCost: p.avgCost,
        refNumber: number,
        createdById: userId,
      });
    }

    // 訂單全部出貨完成 → 自動結案
    if (input.orderId && [...orderItemRows.values()].every((oi) => oi.shippedQty >= oi.qty)) {
      await tx
        .update(orders)
        .set({ status: "COMPLETED", closedAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, input.orderId));
    }

    return sale;
  });
}

// ───────── 作廢銷貨單 ─────────
// 庫存加回、序號改回在庫、訂單出貨數量扣回，並留下異動紀錄
export async function voidSale(db: DB, saleId: number, reason: string, userId: number) {
  if (!reason?.trim()) throw new AppError("請填寫作廢原因");
  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).for("update");
    if (!sale) throw new AppError("找不到銷貨單");
    if (sale.voidedAt) throw new AppError("這張銷貨單已經作廢");
    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));
    const map = await lockProducts(tx, [...new Set(items.map((i) => i.productId))]);

    const serials = items.length
      ? await tx
          .select()
          .from(serialNumbers)
          .where(inArray(serialNumbers.saleItemId, items.map((i) => i.id)))
          .for("update")
      : [];
    const bad = serials.find((x) => x.status !== "SOLD");
    if (bad) throw new AppError(`序號 ${bad.serial} 目前狀態不是「已售出」，無法作廢`);

    for (const it of items) {
      const p = map.get(it.productId)!;
      const sn = serials.filter((x) => x.saleItemId === it.id).map((x) => x.serial);
      const newQty = p.stockQty + it.qty;
      const newAvg =
        p.stockQty > 0 ? Math.round((p.stockQty * p.avgCost + it.qty * it.unitCost) / newQty) : it.unitCost;
      await tx
        .update(products)
        .set({ stockQty: newQty, avgCost: newAvg, updatedAt: new Date() })
        .where(eq(products.id, p.id));
      map.set(p.id, { ...p, stockQty: newQty, avgCost: newAvg });
      await tx.insert(stockMovements).values({
        productId: p.id,
        type: "ADJUST",
        qty: it.qty,
        balanceAfter: newQty,
        unitCost: it.unitCost,
        refNumber: sale.number,
        note: `作廢銷貨單：${reason.trim()}${sn.length ? `（序號 ${sn.join("、")} 已回到庫存）` : ""}`,
        createdById: userId,
      });
    }

    if (serials.length) {
      await tx
        .update(serialNumbers)
        .set({ status: "IN_STOCK", saleItemId: null, soldAt: null, warrantyUntil: null })
        .where(inArray(serialNumbers.id, serials.map((x) => x.id)));
    }

    // 由訂單出貨的：扣回已出貨數量，訂單回到待出貨
    if (sale.orderId) {
      const [o] = await tx.select().from(orders).where(eq(orders.id, sale.orderId)).for("update");
      for (const it of items) {
        if (!it.orderItemId) continue;
        await tx
          .update(orderItems)
          .set({ shippedQty: sql`greatest(${orderItems.shippedQty} - ${it.qty}, 0)` })
          .where(eq(orderItems.id, it.orderItemId));
      }
      if (o && o.status === "COMPLETED") {
        await tx
          .update(orders)
          .set({ status: "CONFIRMED", closedAt: null, updatedAt: new Date() })
          .where(eq(orders.id, o.id));
      }
    }

    await tx
      .update(sales)
      .set({ voidedAt: new Date(), voidedById: userId, voidReason: reason.trim() })
      .where(eq(sales.id, saleId));
  });
}

// 更新發票號碼、已收金額（開單後補登）
export async function updateSaleInfo(
  db: DB,
  saleId: number,
  input: { invoiceNo?: string | null; paidAmount: number },
) {
  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).for("update");
    if (!sale) throw new AppError("找不到銷貨單");
    if (sale.voidedAt) throw new AppError("已作廢的銷貨單不能修改");
    if (!Number.isInteger(input.paidAmount) || input.paidAmount < 0) throw new AppError("已收金額必須是 0 以上的整數");
    if (input.paidAmount > sale.total) throw new AppError(`已收金額不可大於應收總計 ${sale.total}`);
    await tx
      .update(sales)
      .set({ invoiceNo: input.invoiceNo?.trim().toUpperCase() || null, paidAmount: input.paidAmount })
      .where(eq(sales.id, saleId));
  });
}

// ───────── 庫存調整（盤點差異、報廢等） ─────────

export async function adjustStock(
  db: DB,
  input: { productId: number; qty: number; note: string },
  userId: number,
) {
  if (!Number.isInteger(input.qty) || input.qty === 0) throw new AppError("調整數量不可為 0");
  if (!input.note?.trim()) throw new AppError("請填寫調整原因");
  return db.transaction(async (tx) => {
    const map = await lockProducts(tx, [input.productId]);
    const p = map.get(input.productId);
    if (!p) throw new AppError("找不到商品");
    if (p.trackSerial) throw new AppError("序號商品請透過進貨或銷貨處理，不能直接調整數量");
    const newQty = p.stockQty + input.qty; // 一般商品允許負庫存
    await tx.update(products).set({ stockQty: newQty, updatedAt: new Date() }).where(eq(products.id, p.id));
    await tx.insert(stockMovements).values({
      productId: p.id,
      type: "ADJUST",
      qty: input.qty,
      balanceAfter: newQty,
      unitCost: p.avgCost,
      note: input.note.trim(),
      createdById: userId,
    });
    return newQty;
  });
}

// 查詢在庫序號（銷貨時挑選用）
export async function inStockSerials(db: DB, productId: number) {
  return db
    .select({ serial: serialNumbers.serial })
    .from(serialNumbers)
    .where(and(eq(serialNumbers.productId, productId), eq(serialNumbers.status, "IN_STOCK")))
    .orderBy(serialNumbers.createdAt)
    .then((r) => r.map((x) => x.serial));
}
