import { describe, expect, it } from "vitest"

import { normalizeAdaptivePanelMode, resolveAdaptivePanelPresentation } from "./adaptivePanelMode"

describe("adaptive panel mode", () => {
  it("defaults missing and invalid stored values to the drawer", () => {
    expect(normalizeAdaptivePanelMode(null)).toBe("drawer")
    expect(normalizeAdaptivePanelMode("invalid")).toBe("drawer")
  })

  it("preserves valid stored preferences", () => {
    expect(normalizeAdaptivePanelMode("drawer")).toBe("drawer")
    expect(normalizeAdaptivePanelMode("modal")).toBe("modal")
  })

  it("uses the content-area fullscreen presentation on mobile", () => {
    expect(resolveAdaptivePanelPresentation("drawer", true)).toBe("fullscreen")
    expect(resolveAdaptivePanelPresentation("modal", true)).toBe("fullscreen")
    expect(resolveAdaptivePanelPresentation("modal", false)).toBe("modal")
  })
})
