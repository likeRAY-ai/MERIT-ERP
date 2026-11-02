"use client";

// 列印頁上方工具列：選紙張、切換版本、列印（不會印出來）
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const KEY = "merit.printPaper";

export type ToolbarOption = { label: string; param: string; value: string | null; isDefault?: boolean };

export default function PrintToolbar({
  back,
  options = [],
}: {
  back: string;
  options?: ToolbarOption[][]; // 每組是一個切換（例如：銷貨單／出貨單）
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const paper = sp.get("paper") === "half" ? "half" : "a4";

  // 沒指定紙張時，沿用上次選的
  useEffect(() => {
    if (sp.get("paper")) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    if (saved === "half") {
      const p = new URLSearchParams(sp.toString());
      p.set("paper", "half");
      router.replace(`${pathname}?${p}`);
    }
  }, [sp, pathname, router]);

  function href(param: string, value: string | null) {
    const p = new URLSearchParams(sp.toString());
    if (value === null) p.delete(param);
    else p.set(param, value);
    const s = p.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  function choosePaper(v: "a4" | "half") {
    try {
      localStorage.setItem(KEY, v);
    } catch {}
    router.replace(href("paper", v));
  }

  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-gray-300 bg-white px-3 py-2 shadow-sm">
      <Link href={back} className="btn">‹ 返回</Link>
      <Seg>
        <SegBtn active={paper === "a4"} onClick={() => choosePaper("a4")}>A4</SegBtn>
        <SegBtn active={paper === "half"} onClick={() => choosePaper("half")}>中一刀</SegBtn>
      </Seg>
      {options.map((group, i) => (
        <Seg key={i}>
          {group.map((o) => {
            const cur = sp.get(o.param);
            const active = cur === o.value || (cur === null && (o.value === null || !!o.isDefault));
            return (
              <SegBtn key={o.label} active={active} onClick={() => router.replace(href(o.param, o.value))}>
                {o.label}
              </SegBtn>
            );
          })}
        </Seg>
      ))}
      <button type="button" className="btn-primary ml-auto" onClick={() => window.print()}>
        🖨️ 列印
      </button>
      <p className="basis-full text-xs text-gray-500">
        {paper === "half"
          ? "中一刀：印表機選連續報表紙 9.5×5.5 吋（241×140mm），縮放 100%、不要「符合頁面大小」。"
          : "A4：列印對話框的「頁首及頁尾」請取消勾選，縮放 100%。"}
        也可以在列印對話框選「另存為 PDF」寄給客戶。
      </p>
    </div>
  );
}

function Seg({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex overflow-hidden rounded-lg border border-gray-300">{children}</div>;
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm ${active ? "bg-brand-700 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
    >
      {children}
    </button>
  );
}
