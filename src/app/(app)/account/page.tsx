import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "../users/UserForms";

export const metadata = { title: "修改密碼" };

export default async function AccountPage() {
  await requireUser();
  return (
    <div>
      <PageHeader title="修改密碼" />
      <ChangePasswordForm />
    </div>
  );
}
