import { NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/auth";
import { inStockSerials } from "@/lib/services/inventory";

// 某商品目前在庫的序號（銷貨時挑選用）
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const id = Number((await params).id);
  return NextResponse.json(await inStockSerials(db, id));
}
