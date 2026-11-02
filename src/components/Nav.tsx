"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/login/actions";

type Item = { href: string; label: string; icon: string };

const MAIN: Item[] = [
  { href: "/", label: "首頁", icon: "🏠" },
  { href: "/orders", label: "報價／訂單", icon: "📝" },
  { href: "/sales", label: "銷貨", icon: "🧾" },
  { href: "/purchases", label: "進貨", icon: "📦" },
  { href: "/products", label: "商品", icon: "🖥️" },
  { href: "/inventory", label: "庫存", icon: "📊" },
  { href: "/serials", label: "序號查詢", icon: "🔎" },
  { href: "/customers", label: "客戶", icon: "👥" },
  { href: "/suppliers", label: "供應商", icon: "🏭" },
];

const BOTTOM: Item[] = [
  { href: "/", label: "首頁", icon: "🏠" },
  { href: "/orders", label: "報價", icon: "📝" },
  { href: "/sales/new", label: "開銷貨單", icon: "🧾" },
  { href: "/purchases/new", label: "進貨", icon: "📦" },
  { href: "/serials", label: "序號", icon: "🔎" },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export default function Nav({ name, roleLabel, isOwner }: { name: string; roleLabel: string; isOwner: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = [
    ...MAIN,
    ...(isOwner ? [{ href: "/users", label: "帳號管理", icon: "🔐" }] : []),
    { href: "/account", label: "修改密碼", icon: "🔑" },
  ];

  const links = (
    <nav className="flex flex-col gap-0.5 p-2">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          onClick={() => setOpen(false)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
            isActive(path, it.href) ? "bg-brand-50 font-semibold text-brand-800" : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          <span aria-hidden>{it.icon}</span>
          {it.label}
        </Link>
      ))}
    </nav>
  );

  const userBox = (
    <div className="border-t border-gray-200 p-3 text-sm">
      <div className="font-medium">{name}</div>
      <div className="mb-2 text-xs text-gray-500">{roleLabel}</div>
      <form action={logout}>
        <button className="btn w-full">登出</button>
      </form>
    </div>
  );

  return (
    <>
      {/* 電腦：左側選單 */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-52 flex-col border-r border-gray-200 bg-white md:flex">
        <Link href="/" className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 font-bold">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          MERIT ERP
        </Link>
        <div className="flex-1 overflow-y-auto">{links}</div>
        {userBox}
      </aside>

      {/* 手機：上方標題列 */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 md:hidden">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          MERIT ERP
        </Link>
        <button className="btn px-3" onClick={() => setOpen(true)} aria-label="開啟選單">
          ☰ 選單
        </button>
      </header>

      {open && (
        <div className="no-print fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute inset-y-0 right-0 flex w-64 flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <span className="font-bold">選單</span>
              <button onClick={() => setOpen(false)} className="text-xl" aria-label="關閉">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{links}</div>
            {userBox}
          </div>
        </div>
      )}

      {/* 手機：下方快捷列 */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {BOTTOM.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`flex flex-col items-center py-1.5 text-xs ${
              path === it.href ? "font-semibold text-brand-700" : "text-gray-600"
            }`}
          >
            <span className="text-lg" aria-hidden>
              {it.icon}
            </span>
            {it.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
