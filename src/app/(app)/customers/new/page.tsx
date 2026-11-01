import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import PartyForm from "@/components/PartyForm";
import { saveCustomer } from "../../parties/actions";

export const metadata = { title: "新增客戶" };

export default async function NewCustomerPage() {
  await requireUser(["OWNER", "STAFF"]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="新增客戶" back="/customers" />
      <PartyForm action={saveCustomer.bind(null, null)} isCustomer />
    </div>
  );
}
