import type { LoyaltyCouponSettings } from "../types/siteSettings";
import { formatEuro, formatPercent } from "./money";
import i18n from "../i18n";

export const defaultLoyaltyCouponSettings: LoyaltyCouponSettings = {
  enabled: true,
  qualifyingOrderCount: 3,
  qualifyingOrderMinimum: "50.00",
  discountType: "fixed_value",
  discountValue: "20.00",
  couponMinimumOrder: "0.00",
};

function numericValue(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDiscount(settings: LoyaltyCouponSettings) {
  const value = numericValue(settings.discountValue);
  if (settings.discountType === "percentage") {
    return i18n.t("loyalty.discount", { ns: "storefront", value: formatPercent(value) });
  }
  return i18n.t("loyalty.discount", { ns: "storefront", value: formatEuro(value) });
}

export function loyaltyCouponHeadline(settings: LoyaltyCouponSettings) {
  const orderCount = Math.max(1, Math.round(numericValue(settings.qualifyingOrderCount, 3)));
  return i18n.t("loyalty.headline", {
    ns: "storefront", count: orderCount, minimum: formatEuro(settings.qualifyingOrderMinimum), discount: formatDiscount(settings),
  });
}

export function loyaltyCouponDetail(settings: LoyaltyCouponSettings) {
  const orderCount = Math.max(1, Math.round(numericValue(settings.qualifyingOrderCount, 3)));
  const redemptionMinimum = numericValue(settings.couponMinimumOrder);
  const redeemCopy = redemptionMinimum > 0
    ? i18n.t("loyalty.redemptionMinimum", { ns: "storefront", minimum: formatEuro(redemptionMinimum) })
    : "";

  return i18n.t("loyalty.detail", { ns: "storefront", count: orderCount, redemption: redeemCopy });
}
