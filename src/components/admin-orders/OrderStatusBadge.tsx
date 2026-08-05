import { formatOrderStatus, ORDER_STATUS_TONES } from "./orderUtils";

export default function OrderStatusBadge({ status }: { status: string }) {
  const tone = ORDER_STATUS_TONES[status] ?? "completed";
  return <span className={`order-status-badge order-status-badge-${tone}`}>{formatOrderStatus(status)}</span>;
}

