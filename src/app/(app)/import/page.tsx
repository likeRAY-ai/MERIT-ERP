import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ImportForm from "./ImportForm";

export const metadata = { title: "資料匯入" };

export default async function ImportPage() {
  await requireUser(["OWNER"]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="資料匯入" />
      <p className="mb-3 text-sm text-gray-600">
        上傳舊系統匯出的 Excel，先預覽確認，再按「確認匯入」。客戶、廠商以編號、商品以「產品編號」比對，重複匯入只會更新資料，不會產生重複。
      </p>
      <ImportForm />
    </div>
  );
}
