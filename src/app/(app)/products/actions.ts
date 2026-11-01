"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireActionUser } from "@/lib/auth";
import { runAction, str, optStr, int, required, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { adjustStock } from "@/lib/services/inventory";

export async function saveProduct(id: number | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let newId: number | null = null;
  const res = await runAction(async () => {
    await requireActionUser(["OWNER", "STAFF"]);
    const sku = required(fd, "sku", "商品編號").toUpperCase();
    const barcode = optStr(fd, "barcode");
    const data = {
      sku,
      barcode,
      name: required(fd, "name", "商品名稱"),
      brand: optStr(fd, "brand"),
      spec: optStr(fd, "spec"),
      unit: str(fd, "unit") || "個",
      categoryId: Number(str(fd, "categoryId")) || null,
      trackSerial: fd.get("trackSerial") === "on",
      warrantyMonths: int(fd, "warrantyMonths", "保固月數"),
      retailPrice: int(fd, "retailPrice", "零售價"),
      businessPrice: int(fd, "businessPrice", "公司價"),
      safetyStock: int(fd, "safetyStock", "安全庫存"),
      active: fd.get("hasActive") ? fd.get("active") === "on" : true,
      note: optStr(fd, "note"),
      updatedAt: new Date(),
    };

    const dupSku = await db.query.products.findFirst({
      where: id ? and(eq(products.sku, sku), ne(products.id, id)) : eq(products.sku, sku),
    });
    if (dupSku) throw new AppError(`商品編號 ${sku} 已被「${dupSku.name}」使用`);
    if (barcode) {
      const dupBc = await db.query.products.findFirst({
        where: id ? and(eq(products.barcode, barcode), ne(products.id, id)) : eq(products.barcode, barcode),
      });
      if (dupBc) throw new AppError(`條碼 ${barcode} 已被「${dupBc.name}」使用`);
    }

    if (id) {
      const cur = await db.query.products.findFirst({ where: eq(products.id, id) });
      if (!cur) throw new AppError("找不到商品");
      if (cur.trackSerial !== data.trackSerial && cur.stockQty !== 0) {
        throw new AppError("商品還有庫存時，不能變更「序號管理」設定");
      }
      await db.update(products).set(data).where(eq(products.id, id));
    } else {
      const [p] = await db.insert(products).values(data).returning({ id: products.id });
      newId = p.id;
    }
    revalidatePath("/products");
  });
  if (res?.error) return res;
  if (newId) redirect(`/products/${newId}`);
  return { ok: "已儲存" };
}

export async function adjustProductStock(productId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const s = await requireActionUser(["OWNER"]);
    const qty = Number(str(fd, "qty"));
    if (!Number.isInteger(qty)) throw new AppError("調整數量必須是整數（減少請輸入負數）");
    const after = await adjustStock(db, { productId, qty, note: str(fd, "note") }, s.uid);
    revalidatePath(`/products/${productId}`);
    return `已調整，目前庫存 ${after}`;
  });
}
