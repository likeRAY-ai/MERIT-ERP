import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="pdoc-bg">{children}</div>;
}
