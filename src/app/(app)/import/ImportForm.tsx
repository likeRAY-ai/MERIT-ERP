"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { runImport, type ImportState } from "./actions";

export default function ImportForm() {
  const [state, dispatch, pending] = useActionState<ImportState, FormData>(runImport, undefined);
  const [fileName, setFileName] = useState("");

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    fd.set("mode", btn?.value ?? "preview");
    startTransition(() => dispatch(fd));
  };

  const p = state?.preview;
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="card space-y-3">
        <label className="block">
          <span className="label">資料種類</span>
          <select name="kind" className="input max-w-xs" defaultValue="customers">
            <option value="customers">客戶基本資料</option>
            <option value="products">商品（產品）基本資料</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Excel 檔案（舊系統匯出的 .xls / .xlsx）</span>
          <input
            type="file"
            name="file"
            accept=".xls,.xlsx,.csv"
            className="input"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          />
        </label>
        <button name="mode" value="preview" className="btn-primary" disabled={pending || !fileName}>
          {pending ? "讀取中…" : "1. 預覽"}
        </button>
      </div>

      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      {p && !state?.done && (
        <div className="card space-y-3">
          <h2 className="font-semibold">預覽結果</h2>
          <ul className="grid grid-cols-3 gap-2 text-sm">
            <li className="rounded-lg bg-gray-50 p-2">可匯入<div className="text-xl font-bold">{p.total}</div></li>
            <li className="rounded-lg bg-gray-50 p-2">新增<div className="text-xl font-bold text-green-700">{p.newCount}</div></li>
            <li className="rounded-lg bg-gray-50 p-2">更新（編號已存在）<div className="text-xl font-bold text-blue-700">{p.updateCount}</div></li>
          </ul>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-gray-700">
            {p.facts.map((f) => <li key={f}>{f}</li>)}
          </ul>
          {p.skipped.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-amber-700">略過 {p.skipped.length} 列</summary>
              <ul className="mt-1 list-disc pl-5 text-xs text-gray-600">
                {p.skipped.slice(0, 50).map((s) => <li key={s.row}>第 {s.row} 列：{s.reason}</li>)}
              </ul>
            </details>
          )}
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr>{p.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {p.sample.map((r) => (
                  <tr key={r[0]}>
                    {r.map((v, i) => <td key={i}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-gray-500">只顯示前 {p.sample.length} 筆</p>
          </div>
          <button name="mode" value="import" className="btn-primary" disabled={pending}>
            {pending ? "匯入中…" : `2. 確認匯入 ${p.total} 筆`}
          </button>
        </div>
      )}

      {state?.done && (
        <div className="card space-y-2 bg-green-50">
          <p className="font-semibold text-green-800">
            匯入完成：新增 {state.done.inserted} 筆、更新 {state.done.updated} 筆
          </p>
          <Link href={state.done.link} className="btn">{state.done.label}</Link>
        </div>
      )}
    </form>
  );
}
