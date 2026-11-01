import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import PartyForm from "@/components/PartyForm";
import { saveSupplier } from "../../parties/actions";

export const metadata = { title: "新增供應商" };

export default async function NewSupplierPage() {
  await requireUser(["OWNER", "STAFF"]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="新增供應商" back="/suppliers" />
      <PartyForm action={saveSupplier.bind(null, null)} isCustomer={false} />
    </div>
  );
}
