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
        上傳舊系統匯出的 Excel，先預覽確認，再按「確認匯入」。以「客戶編號」比對，重複匯入會更新資料，不會產生重複客戶。
      </p>
      <ImportForm />
    </div>
  );
}
