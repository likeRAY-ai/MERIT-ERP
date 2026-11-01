// 共用小元件
import Link from "next/link";

export function PageHeader({
  title,
  back,
  actions,
}: {
  title: string;
  back?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {back && (
          <Link href={back} className="no-print btn px-2 py-1" aria-label="返回">
            ←
          </Link>
        )}
        <h1 className="page-title">{title}</h1>
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-gray-500">{children}</div>;
}

export function SearchBar({ q, placeholder, children }: { q?: string; placeholder: string; children?: React.ReactNode }) {
  return (
    <form className="mb-3 flex flex-wrap gap-2" role="search">
      <input name="q" defaultValue={q} placeholder={placeholder} className="input max-w-xs flex-1" />
      {children}
      <button className="btn">搜尋</button>
    </form>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="card overflow-x-auto p-0">{children}</div>;
}

const STATUS_COLORS: Record<string, string> = {
  IN_STOCK: "bg-green-100 text-green-800",
  SOLD: "bg-blue-100 text-blue-800",
  RETURNED: "bg-amber-100 text-amber-800",
  RMA: "bg-purple-100 text-purple-800",
  SCRAPPED: "bg-gray-200 text-gray-700",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`badge ${STATUS_COLORS[status] ?? "bg-gray-100"}`}>{label}</span>;
}
