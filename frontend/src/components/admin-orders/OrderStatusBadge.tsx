import { formatOrderStatus, ORDER_STATUS_TONES } from "./orderUtils";
import { useTranslation } from "react-i18next";

export default function OrderStatusBadge({ status }: { status: string }) {
  useTranslation("admin");
  const tone = ORDER_STATUS_TONES[status] ?? "completed";
  return <span className={`order-status-badge order-status-badge-${tone}`}>{formatOrderStatus(status)}</span>;
}

