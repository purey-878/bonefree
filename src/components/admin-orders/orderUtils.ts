import type { AdminOrder, AdminOrderItem } from "../../types/admin";

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  confirmada: "Na fila",
  em_preparacao: "Em preparação",
  pronta: "Pronto",
  entregue: "Concluído",
  cancelada: "Cancelado",
  reembolsada: "Reembolsado",
};

export const ORDER_STATUS_TONES: Record<string, string> = {
  pendente: "pending",
  confirmada: "queued",
  em_preparacao: "preparing",
  pronta: "ready",
  entregue: "completed",
  cancelada: "cancelled",
  reembolsada: "cancelled",
};

export function formatOrderStatus(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function fulfillmentLabel(order: AdminOrder): string {
  if (order.fulfillment_method === "dine_in") return "No restaurante";
  if (order.fulfillment_method === "takeaway") return "Para levar";
  if (order.fulfillment_method === "pickup") return "Recolha";
  return order.fulfillment_method?.replace(/_/g, " ") || "Recolha";
}

export function handoffLabel(order: AdminOrder): string {
  if (order.fulfillment_method === "takeaway") return "Balcão para levar";
  if (order.table_number) return `Mesa ${order.table_number}`;
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
  const shouldUseUpdatedAt = ["confirmada", "em_preparacao"].includes(order.estado);
  const preferred = shouldUseUpdatedAt ? order.data_atualizacao : order.data_criacao;
  const timestamp = parseOrderTimestamp(preferred);
  if (!Number.isNaN(timestamp)) return timestamp;
  return parseOrderTimestamp(order.data_criacao);
}

export function shouldShowOrderAge(order: AdminOrder): boolean {
  return ["pendente", "confirmada", "em_preparacao"].includes(order.estado);
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
  return order.items.some((item) => visibleCustomizationLines(item.customizacao_resumo).length > 0 || Boolean(item.customizacao));
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
    .map((item) => ({ item, lines: visibleCustomizationLines(item.customizacao_resumo) }))
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
  if (order.metodo_pagamento === "balcao" && order.estado_pagamento === "nao_pago") {
    return "Pagamento: a aguardar pagamento ao balcão";
  }
  const method = order.metodo_pagamento === "balcao"
    ? "Balcão"
    : order.metodo_pagamento === "cartao" || order.metodo_pagamento === "digital"
      ? "Cartão"
      : order.metodo_pagamento === "mbway"
        ? "MB Way"
        : order.metodo_pagamento ?? "-";
  const status = order.estado_pagamento === "pago" ? "Pago" : order.estado_pagamento === "reembolsado" ? "Reembolsado" : order.estado_pagamento ? order.estado_pagamento.replace(/_/g, " ") : "-";
  return `${method} / ${status}`;
}
