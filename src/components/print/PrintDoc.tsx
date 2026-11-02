// 單據列印版面：A4 或中一刀（9.5×5.5 吋連續報表紙）
import { COMPANY } from "@/lib/company";
import { chineseAmount } from "@/lib/format";

export type Paper = "a4" | "half";

export function parsePaper(v: string | undefined): Paper {
  return v === "half" ? "half" : "a4";
}

export type Field = { label: string; value: React.ReactNode; wide?: boolean };
export type Column = { label: string; align?: "left" | "right" | "center"; width?: string };
export type TotalRow = { label: string; value: string; strong?: boolean };

export default function PrintDoc({
  paper,
  title,
  number,
  voided,
  party,
  info,
  columns,
  rows,
  totals,
  amount,
  note,
  terms,
  signatures,
  children,
}: {
  paper: Paper;
  title: string;
  number: string;
  voided?: boolean;
  party: Field[]; // 左側：客戶／廠商資料
  info: Field[]; // 右側：日期、業務等
  columns: Column[];
  rows: React.ReactNode[][];
  totals?: TotalRow[];
  amount?: number; // 顯示金額大寫
  note?: string | null;
  terms?: string[];
  signatures: string[];
  children?: React.ReactNode; // 明細下方的額外內容
}) {
  const half = paper === "half";
  return (
    <>
      {/* 紙張大小與邊界 */}
      <style>{half ? "@page { size: 241mm 140mm; margin: 6mm 8mm; }" : "@page { size: A4; margin: 12mm; }"}</style>
      <article className={`pdoc ${half ? "pdoc-half" : "pdoc-a4"}`}>
        {/* 表頭 */}
        {half ? (
          <header className="mb-[0.5em] flex items-end justify-between border-b-2 border-black pb-[0.3em]">
            <div>
              <div className="text-[1.5em] font-bold leading-tight">{COMPANY.name}</div>
              <div className="text-[0.9em]">
                統編 {COMPANY.taxId}　電話 {COMPANY.phone}　{COMPANY.address}
              </div>
            </div>
            <div className="text-right">
              <div className="-mr-[0.3em] text-[1.6em] font-bold tracking-[0.3em]">
                {title}
                {voided && <span className="tracking-normal text-red-600">（作廢）</span>}
              </div>
              <div className="font-mono">{number}</div>
            </div>
          </header>
        ) : (
          <header className="mb-[0.8em] text-center">
            <div className="text-[1.9em] font-bold tracking-wider">{COMPANY.name}</div>
            <div className="text-[0.9em]">
              統一編號 {COMPANY.taxId}　電話 {COMPANY.phone}　地址 {COMPANY.address}
            </div>
            <div className="mt-[0.5em] text-[1.7em] font-bold tracking-[0.5em]">
              {title}
              {voided && <span className="tracking-normal text-red-600">（作廢）</span>}
            </div>
          </header>
        )}

        {/* 客戶與單據資料 */}
        <section className={`mb-[0.6em] grid gap-[0.6em] ${half ? "grid-cols-[3fr_2fr]" : "grid-cols-[3fr_2fr]"}`}>
          <div className="pd-box grid content-start grid-cols-2 gap-x-[1em] gap-y-[0.15em] px-[0.6em] py-[0.4em]">
            {party.map((f) => (
              <FieldRow key={f.label} f={f} />
            ))}
          </div>
          <div className="pd-box grid content-start grid-cols-1 gap-y-[0.15em] px-[0.6em] py-[0.4em]">
            {!half && <FieldRow f={{ label: "單號", value: <span className="font-mono">{number}</span> }} />}
            {info.map((f) => (
              <FieldRow key={f.label} f={f} />
            ))}
          </div>
        </section>

        {/* 明細 */}
        <table className="pd-items">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label} style={{ width: c.width, textAlign: c.align ?? "left" }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} style={{ textAlign: columns[j]?.align ?? "left" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={columns.length} className="text-center">（無明細）</td>
              </tr>
            )}
          </tbody>
        </table>

        {children}

        {/* 合計 */}
        {(totals?.length || note || amount !== undefined) && (
          <section className="mt-[0.5em] flex items-start justify-between gap-[1em]" style={{ breakInside: "avoid" }}>
            <div className="min-w-0 flex-1 space-y-[0.2em]">
              {amount !== undefined && (
                <div>
                  <span className="font-semibold">合計新台幣：</span>
                  {chineseAmount(amount)}
                </div>
              )}
              {note && (
                <div className="whitespace-pre-wrap">
                  <span className="font-semibold">備註：</span>
                  {note}
                </div>
              )}
            </div>
            {totals && totals.length > 0 && (
              <table className="shrink-0">
                <tbody>
                  {totals.map((t) => (
                    <tr key={t.label} className={t.strong ? "text-[1.15em] font-bold" : ""}>
                      <td className="pr-[1em] text-right">{t.label}</td>
                      <td className="min-w-[7em] text-right tabular-nums">{t.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* 條款 */}
        {terms && terms.length > 0 && (
          <ol className="mt-[0.6em] list-decimal pl-[1.4em] text-[0.88em]" style={{ breakInside: "avoid" }}>
            {terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        )}

        {/* 簽章欄 */}
        <section
          className="mt-[0.8em] grid gap-[1.5em]"
          style={{ gridTemplateColumns: `repeat(${signatures.length}, minmax(0, 1fr))`, breakInside: "avoid" }}
        >
          {signatures.map((s) => (
            <div key={s}>
              <div className="pd-sign" />
              <div className="mt-[0.2em] text-center">{s}</div>
            </div>
          ))}
        </section>
      </article>
    </>
  );
}

function FieldRow({ f }: { f: Field }) {
  return (
    <div className={`flex min-w-0 gap-[0.4em] ${f.wide ? "col-span-2" : ""}`}>
      <span className="shrink-0 text-gray-600">{f.label}</span>
      <span className="min-w-0 break-words">{f.value || "—"}</span>
    </div>
  );
}

// 數字（不含 $），列印用
export function num(n: number) {
  return n.toLocaleString("zh-TW");
}
