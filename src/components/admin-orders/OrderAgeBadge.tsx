import { useEffect, useState } from "react";
import type { AdminOrder } from "../../types/admin";
import { agePriority, formatOrderAge, shouldShowOrderAge } from "./orderUtils";

export default function OrderAgeBadge({ order }: { order: AdminOrder }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!shouldShowOrderAge(order)) return undefined;
    const intervalId = window.setInterval(() => setTick((value) => value + 1), 60000);
    return () => window.clearInterval(intervalId);
  }, [order]);

  if (!shouldShowOrderAge(order)) return null;

  const priority = agePriority(order);
  return <span className={`order-age-badge order-age-badge-${priority}`}>À espera {formatOrderAge(order)}</span>;
}

