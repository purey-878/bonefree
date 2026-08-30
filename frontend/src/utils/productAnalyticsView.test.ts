import { describe, expect, it } from "vitest"

import {
  normalizeProductAnalyticsViewMode,
  resolveProductAnalyticsPresentation,
} from "./productAnalyticsView"

describe("product analytics view mode", () => {
  it("defaults missing and invalid stored values to the drawer", () => {
    expect(normalizeProductAnalyticsViewMode(null)).toBe("drawer")
    expect(normalizeProductAnalyticsViewMode("invalid")).toBe("drawer")
  })

  it("preserves valid stored preferences", () => {
    expect(normalizeProductAnalyticsViewMode("drawer")).toBe("drawer")
    expect(normalizeProductAnalyticsViewMode("modal")).toBe("modal")
  })

  it("uses fullscreen on mobile without replacing the desktop preference", () => {
    expect(resolveProductAnalyticsPresentation("drawer", true)).toBe("fullscreen")
    expect(resolveProductAnalyticsPresentation("modal", true)).toBe("fullscreen")
    expect(resolveProductAnalyticsPresentation("modal", false)).toBe("modal")
  })
})
