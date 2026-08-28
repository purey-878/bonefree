export type AdaptivePanelMode = "drawer" | "modal"
export type AdaptivePanelPresentation = AdaptivePanelMode | "fullscreen"

export function normalizeAdaptivePanelMode(value: unknown): AdaptivePanelMode {
  return value === "modal" ? "modal" : "drawer"
}

export function resolveAdaptivePanelPresentation(
  mode: AdaptivePanelMode,
  isMobile: boolean,
): AdaptivePanelPresentation {
  return isMobile ? "fullscreen" : mode
}
