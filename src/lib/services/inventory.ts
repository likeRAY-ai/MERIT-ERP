import { and, eq, inArray } from "drizzle-orm";
import type { DB, Tx } from "@/db";
import { products, purchases, purchaseItems, sales, saleItems, serialNumbers, stockMovements, customers, suppliers } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { addMonths, taxFromTotal } from "@/lib/format";
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
  date?: Date;
  note?: string | null;
  items: (LineInput & { unitPrice: number })[];
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

    for (const [pid, q] of needQty) {
      const p = map.get(pid)!;
      if (p.stockQty < q) throw new AppError(`「${p.name}」庫存不足：目前 ${p.stockQty}，需要 ${q}`);
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

    const number = await nextNumber(tx, "S", "sales", date);
    const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const costTotal = lines.reduce((s, l) => s + l.qty * map.get(l.productId)!.avgCost, 0);

    const [sale] = await tx
      .insert(sales)
      .values({
        number,
        date,
        customerId: input.customerId || null,
        buyerTaxId: taxId,
        total,
        taxAmount: taxFromTotal(total),
        costTotal,
        paymentMethod: input.paymentMethod,
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
        })
        .returning();

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

    return sale;
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
    const newQty = p.stockQty + input.qty;
    if (newQty < 0) throw new AppError("調整後庫存不可小於 0");
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
