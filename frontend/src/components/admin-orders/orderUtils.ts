import type { AdminOrder, AdminOrderItem } from "../../types/admin";

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Na fila",
  in_preparation: "Em preparação",
  ready: "Pronto",
  delivered: "Concluído",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

export const ORDER_STATUS_TONES: Record<string, string> = {
  pending: "pending",
  confirmed: "queued",
  in_preparation: "preparing",
  ready: "ready",
  delivered: "completed",
  cancelled: "cancelled",
  refunded: "cancelled",
};

export function formatOrderStatus(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function fulfillmentLabel(order: AdminOrder): string {
  if (order.fulfillmentMethod === "dine_in") return "No restaurante";
  if (order.fulfillmentMethod === "takeaway") return "Para levar";
  if (order.fulfillmentMethod === "pickup") return "Recolha";
  return order.fulfillmentMethod?.replace(/_/g, " ") || "Recolha";
}

export function handoffLabel(order: AdminOrder): string {
  if (order.fulfillmentMethod === "takeaway") return "Balcão para levar";
  if (order.tableNumber) return `Mesa ${order.tableNumber}`;
  return "Entrega ao balcão";
}

export function parseOrderTimestamp(value?: string | null): number {
  if (!value) return Number.NaN;
  const normalized = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const isoLike = normalized.includes("T") ? normalized : normalized.replace(" ", "T");
  return new Date(hasTimezone ? isoLike : `${isoLike}Z`).getTime();
}

export function orderTimingTimestamp(order: AdminOrder): number {
  const shouldUseUpdatedAt = ["confirmed", "in_preparation"].includes(order.state);
  const preferred = shouldUseUpdatedAt ? order.updatedAt : order.createdAt;
  const timestamp = parseOrderTimestamp(preferred);
  if (!Number.isNaN(timestamp)) return timestamp;
  return parseOrderTimestamp(order.createdAt);
}

export function shouldShowOrderAge(order: AdminOrder): boolean {
  return ["pending", "confirmed", "in_preparation"].includes(order.state);
}

export function orderAgeMinutes(order: AdminOrder): number {
  const timestamp = orderTimingTimestamp(order);
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
}

export function formatOrderAge(order: AdminOrder): string {
  const minutes = orderAgeMinutes(order);
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function agePriority(order: AdminOrder): "normal" | "warning" | "urgent" {
  const minutes = orderAgeMinutes(order);
  if (minutes > 20) return "urgent";
  if (minutes >= 10) return "warning";
  return "normal";
}

export function visibleCustomizationLines(lines?: string[]): string[] {
  return (lines ?? []).filter((line) => {
    const label = line.slice(0, line.indexOf(":") >= 0 ? line.indexOf(":") : line.length).toLowerCase();
    return !(label.includes(" id") || label.includes("ids") || label === "extras" || label === "substitutions");
  });
}

export function hasCustomization(order: AdminOrder): boolean {
  return order.items.some((item) => visibleCustomizationLines(item.customizationSummary).length > 0 || Boolean(item.customization));
}

export function customizationTone(line: string): string {
  const label = line.slice(0, line.indexOf(":") >= 0 ? line.indexOf(":") : line.length).toLowerCase();
  if (label.includes("remove") || label.includes("remover")) return "remove";
  if (label.includes("add") || label.includes("adicionar") || label.includes("extra")) return "add";
  if (label.includes("preference") || label.includes("preferência") || label.includes("preferencias") || label.includes("preferências")) return "preference";
  if (label.includes("note") || label.includes("nota")) return "note";
  return "preference";
}

export function customizationText(line: string): { label: string; value: string } {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) return { label: "Nota", value: line };
  const rawLabel = line.slice(0, separatorIndex).trim();
  return {
    label: customizationLabel(rawLabel),
    value: line.slice(separatorIndex + 1).trim(),
  };
}

function customizationLabel(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized === "remove") return "Remover";
  if (normalized === "add") return "Adicionar";
  if (normalized === "preferences") return "Preferências";
  if (normalized === "note") return "Nota";
  return label;
}

export function orderCustomizations(order: AdminOrder): Array<{ item: AdminOrderItem; lines: string[] }> {
  return order.items
    .map((item) => ({ item, lines: visibleCustomizationLines(item.customizationSummary) }))
    .filter(({ lines }) => lines.length > 0);
}

export function isToday(value?: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
}

export function paymentLabel(order: AdminOrder): string {
  if (order.paymentMethod === "counter" && order.paymentStatus === "unpaid") {
    return "Pagamento: a aguardar pagamento ao balcão";
  }
  const method = order.paymentMethod === "counter"
    ? "Balcão"
    : order.paymentMethod === "card"
      ? "Cartão"
      : order.paymentMethod === "mbway"
        ? "MB Way"
        : order.paymentMethod ?? "-";
  const status = order.paymentStatus === "paid" ? "Pago" : order.paymentStatus === "refunded" ? "Reembolsado" : order.paymentStatus ? order.paymentStatus.replace(/_/g, " ") : "-";
  return `${method} / ${status}`;
}
