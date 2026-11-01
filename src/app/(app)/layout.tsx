import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  return (
    <div className="min-h-dvh">
      <Nav name={s.name} roleLabel={ROLE_LABELS[s.role]} isOwner={s.role === "OWNER"} />
      <main className="mx-auto max-w-6xl p-3 pb-24 md:ml-52 md:p-6 md:pb-6 print:m-0 print:p-0">{children}</main>
    </div>
  );
}
