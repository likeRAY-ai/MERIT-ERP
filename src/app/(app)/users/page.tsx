import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { NewUserForm, EditUserForm } from "./UserForms";

export const metadata = { title: "帳號管理" };

export default async function UsersPage() {
  await requireUser(["OWNER"]);
  const list = await db
    .select({ id: users.id, username: users.username, name: users.name, role: users.role, active: users.active })
    .from(users)
    .orderBy(asc(users.id));
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="帳號管理" />
      <NewUserForm />
      <h2 className="font-semibold">現有帳號</h2>
      {list.map((u) => (
        <EditUserForm key={u.id} user={u} />
      ))}
    </div>
  );
}
