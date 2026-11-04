"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { canSeeCost, requireActionUser } from "@/lib/auth";
import { runAction, optStr, int, str, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { parseDateInput, startOfTaipeiDay } from "@/lib/format";
import {
  addItems,
  assetFromStock,
  billContract,
  createContract,
  dueContracts,
  endContract,
  receiveDeposit,
  returnItems,
  saveAsset,
} from "@/lib/services/rentals";

const refresh = (id?: number) => {
  revalidatePath("/rentals");
  revalidatePath("/rentals/assets");
  revalidatePath("/rentals/quotes");
  if (id) revalidatePath(`/rentals/${id}`);
  revalidatePath("/sales");
  revalidatePath("/");
};

const itemsSchema = z.array(z.object({ assetId: z.number().int(), rate: z.number().int() }));
const PAYMENTS = ["CASH", "CARD", "TRANSFER", "CREDIT"] as const;
const dateOr = (fd: FormData, key: string, label: string) => {
  const d = parseDateInput(str(fd, key));
  if (!d) throw new AppError(`請填寫${label}`);
  return d;
};

export async function submitContract(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = 0;
  const res = await runAction(async () => {
    const s = await requireActionUser(["OWNER", "STAFF"]);
    const items = itemsSchema.safeParse(JSON.parse(String(fd.get("items") || "[]")));
    if (!items.success) throw new AppError("設備資料格式錯誤");
    const pm = str(fd, "paymentMethod") as (typeof PAYMENTS)[number];
    if (!PAYMENTS.includes(pm)) throw new AppError("請選擇付款方式");
    const k = await createContract(
      db,
      {
        customerId: Number(fd.get("customerId")) || 0,
        contact: optStr(fd, "contact"),
        phone: optStr(fd, "phone"),
        address: optStr(fd, "address"),
        salespersonId: Number(fd.get("salespersonId")) || null,
        billingType: str(fd, "billingType") === "DAILY" ? "DAILY" : "MONTHLY",
        billingMonths: int(fd, "billingMonths", "每次收款月數", { min: 1 }) || 1,
        startDate: dateOr(fd, "startDate", "開始日期"),
        endDate: parseDateInput(str(fd, "endDate")),
        taxType: str(fd, "taxType") === "EXCLUDED" ? "EXCLUDED" : "INCLUDED",
        paymentMethod: pm,
        deposit: int(fd, "deposit", "押金"),
        depositReceived: fd.get("depositReceived") === "on",
        note: optStr(fd, "note"),
        items: items.data,
        quoteId: Number(fd.get("quoteId")) || null,
      },
      s.uid,
    );
    id = k.id;
    refresh();
  });
  if (res?.error) return res;
  redirect(`/rentals/${id}?created=1`);
}

export async function contractAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = Number(fd.get("id"));
  const op = str(fd, "op");
  let saleId = 0;
  const res = await runAction(async () => {
    const s = await requireActionUser(["OWNER", "STAFF"]);
    switch (op) {
      case "bill": {
        const sale = await billContract(db, id, s.uid);
        saleId = sale.id;
        refresh(id);
        return;
      }
      case "deposit":
        await receiveDeposit(db, id);
        refresh(id);
        return "已登記收到押金";
      case "return": {
        const ids = fd.getAll("itemId").map(Number).filter(Boolean);
        await returnItems(db, id, ids, dateOr(fd, "date", "收回日期"));
        refresh(id);
        return `已收回 ${ids.length} 台`;
      }
      case "add": {
        const items = itemsSchema.safeParse(JSON.parse(String(fd.get("items") || "[]")));
        if (!items.success) throw new AppError("設備資料格式錯誤");
        await addItems(db, id, items.data, dateOr(fd, "date", "開始日期"));
        refresh(id);
        return "已加租設備，下一期起一併收費";
      }
      case "end": {
        const refund = str(fd, "depositRefund");
        await endContract(db, id, {
          date: dateOr(fd, "date", "結束日期"),
          depositRefund: refund === "" ? null : int(fd, "depositRefund", "退還押金"),
        });
        refresh(id);
        return "租約已結束，設備已收回";
      }
      default:
        throw new AppError("不支援的操作");
    }
  });
  if (res?.error) return res;
  if (saleId) redirect(`/sales/${saleId}?created=1`);
  return res;
}

// 一次產生所有應開帳的租金
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function billAllDue(_: ActionState, _fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const s = await requireActionUser(["OWNER", "STAFF"]);
    const due = await dueContracts(db, startOfTaipeiDay());
    let ok = 0;
    const errors: string[] = [];
    for (const c of due) {
      try {
        await billContract(db, c.id, s.uid);
        ok++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    refresh();
    if (!due.length) return "目前沒有應開帳的租約";
    return `已產生 ${ok} 張租金銷貨單${errors.length ? `，${errors.length} 份失敗：${errors.join("；")}` : ""}`;
  });
}

export async function submitAsset(id: number | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let newId = 0;
  const res = await runAction(async () => {
    const s = await requireActionUser(["OWNER", "STAFF"]);
    const st = str(fd, "status");
    const r = await saveAsset(
      db,
      {
        code: str(fd, "code"),
        name: str(fd, "name"),
        monthlyRate: int(fd, "monthlyRate", "月租"),
        dailyRate: int(fd, "dailyRate", "日租"),
        // 員工看不到成本，也不能修改
        cost: canSeeCost(s) ? int(fd, "cost", "成本") : undefined,
        acquiredAt: parseDateInput(str(fd, "acquiredAt")),
        note: optStr(fd, "note"),
        status: st === "MAINTENANCE" || st === "RETIRED" ? st : "AVAILABLE",
      },
      id ?? undefined,
    );
    if (!id) newId = r.id;
    refresh();
    if (id) revalidatePath(`/rentals/assets/${id}`);
    return "已儲存";
  });
  if (res?.error) return res;
  if (newId) redirect(`/rentals/assets/${newId}`);
  return res;
}

export async function submitAssetFromStock(_: ActionState, fd: FormData): Promise<ActionState> {
  let newId = 0;
  const res = await runAction(async () => {
    const s = await requireActionUser(["OWNER", "STAFF"]);
    const r = await assetFromStock(
      db,
      {
        serial: str(fd, "serial"),
        name: optStr(fd, "name") ?? undefined,
        monthlyRate: int(fd, "monthlyRate", "月租"),
        dailyRate: int(fd, "dailyRate", "日租"),
      },
      s.uid,
    );
    newId = r.id;
    refresh();
    revalidatePath("/products");
  });
  if (res?.error) return res;
  redirect(`/rentals/assets/${newId}`);
}
