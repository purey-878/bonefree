export type ProductAnalyticsViewMode = "drawer" | "modal"
export type ProductAnalyticsPresentation = ProductAnalyticsViewMode | "fullscreen"

export const PRODUCT_ANALYTICS_VIEW_MODE_STORAGE_KEY = "admin_product_analytics_view_mode"

export function normalizeProductAnalyticsViewMode(value: unknown): ProductAnalyticsViewMode {
  return value === "modal" ? "modal" : "drawer"
}

export function resolveProductAnalyticsPresentation(
  mode: ProductAnalyticsViewMode,
  isMobile: boolean,
): ProductAnalyticsPresentation {
  return isMobile ? "fullscreen" : mode
}
