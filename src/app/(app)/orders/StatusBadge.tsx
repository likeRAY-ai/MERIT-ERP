import { ORDER_STATUS_LABELS } from "@/lib/format";

const COLORS: Record<string, string> = {
  QUOTE: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-200 text-gray-700",
  LOST: "bg-gray-100 text-gray-500",
};

export function OrderStatusBadge({ status }: { status: string }) {
  return <span className={`badge ${COLORS[status] ?? "bg-gray-100"}`}>{ORDER_STATUS_LABELS[status] ?? status}</span>;
}
