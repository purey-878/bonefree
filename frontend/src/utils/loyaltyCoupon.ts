import type { LoyaltyCouponSettings } from "../types/siteSettings";
import { formatEuro, formatPercent } from "./money";

export const defaultLoyaltyCouponSettings: LoyaltyCouponSettings = {
  enabled: true,
  qualifying_order_count: 3,
  qualifying_order_minimum: "50.00",
  discount_type: "VALOR_FIXO",
  discount_value: "20.00",
  coupon_minimum_order: "0.00",
};

function numericValue(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDiscount(settings: LoyaltyCouponSettings) {
  const value = numericValue(settings.discount_value);
  if (settings.discount_type === "PERCENTAGEM") {
    return `${formatPercent(value)} de desconto`;
  }
  return `${formatEuro(value)} de desconto`;
}

export function loyaltyCouponHeadline(settings: LoyaltyCouponSettings) {
  const orderCount = Math.max(1, Math.round(numericValue(settings.qualifying_order_count, 3)));
  const orderLabel = orderCount === 1 ? "pedido" : "pedidos";
  return `Faça ${orderCount} ${orderLabel} acima de ${formatEuro(settings.qualifying_order_minimum)} e ganhe ${formatDiscount(settings)} no próximo pedido.`;
}

export function loyaltyCouponDetail(settings: LoyaltyCouponSettings) {
  const orderCount = Math.max(1, Math.round(numericValue(settings.qualifying_order_count, 3)));
  const orderLabel = orderCount === 1 ? "pedido elegível" : "pedidos elegíveis";
  const redemptionMinimum = numericValue(settings.coupon_minimum_order);
  const redeemCopy = redemptionMinimum > 0
    ? ` Os cupões podem ser usados em pedidos acima de ${formatEuro(redemptionMinimum)}.`
    : "";

  return `O seu cupão de recompensa é criado automaticamente após ${orderCount} ${orderLabel} e aparece no perfil.${redeemCopy}`;
}
