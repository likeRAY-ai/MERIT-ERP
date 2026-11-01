import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ProductForm from "../ProductForm";

export const metadata = { title: "新增商品" };

export default async function NewProductPage() {
  await requireUser(["OWNER", "STAFF"]);
  const cats = await db.select().from(categories).orderBy(categories.sort);
  return (
    <div className="max-w-3xl">
      <PageHeader title="新增商品" back="/products" />
      <ProductForm categories={cats} />
    </div>
  );
}
