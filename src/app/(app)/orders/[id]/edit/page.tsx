import { notFound, redirect } from "next/navigation";
import { requireUser, canSeeCost } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import OrderForm from "../../OrderForm";
import { formOptions, loadInit } from "../../load";

export const metadata = { title: "修改報價單" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser(["OWNER", "STAFF"]);
  const id = Number((await params).id);
  const [init, opts] = await Promise.all([loadInit(id, canSeeCost(s), s.uid), formOptions()]);
  if (!init) notFound();
  if (init.status !== "QUOTE" && init.status !== "CONFIRMED") redirect(`/orders/${id}`);
  return (
    <div className="max-w-5xl">
      <PageHeader title={init.status === "QUOTE" ? "修改報價單" : "修改訂單"} back={`/orders/${id}`} />
      <OrderForm init={init} customers={opts.customers} staff={opts.staff} />
    </div>
  );
}
