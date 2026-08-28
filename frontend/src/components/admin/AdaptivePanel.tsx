import { useEffect, useState } from "react"
import type { AnimationEvent, ReactNode } from "react"
import { Maximize2, PanelRight, X } from "lucide-react"
import { resolveAdaptivePanelPresentation } from "../../utils/adaptivePanelMode"
import type { AdaptivePanelMode } from "../../utils/adaptivePanelMode"
import "./AdaptivePanel.css"

type AdaptivePanelProps = {
  ariaLabel: string
  children: ReactNode
  closing: boolean
  mode: AdaptivePanelMode
  onExited: () => void
  onModeChange: (mode: AdaptivePanelMode) => void
  onRequestClose: () => void
  panelClassName?: string
  closeLabel?: string
  modeGroupLabel?: string
  drawerLabel?: string
  modalLabel?: string
}

const MOBILE_QUERY = "(max-width: 760px)"

export default function AdaptivePanel({
  ariaLabel,
  children,
  closing,
  mode,
  onExited,
  onModeChange,
  onRequestClose,
  panelClassName,
  closeLabel = "Fechar",
  modeGroupLabel = "Modo de visualização",
  drawerLabel = "Abrir no painel lateral",
  modalLabel = "Abrir como modal",
}: AdaptivePanelProps) {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== "undefined" ? window.matchMedia(MOBILE_QUERY).matches : false
  ))
  const presentation = resolveAdaptivePanelPresentation(mode, isMobile)
  const hasBackdrop = presentation === "modal"
  const locksBackgroundScroll = presentation !== "drawer"
  const variantClass = panelClassName ? `${panelClassName}-${presentation}` : ""

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY)
    const syncPresentation = () => setIsMobile(mediaQuery.matches)
    syncPresentation()
    mediaQuery.addEventListener("change", syncPresentation)
    return () => mediaQuery.removeEventListener("change", syncPresentation)
  }, [])

  useEffect(() => {
    if (!locksBackgroundScroll) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [locksBackgroundScroll])

  useEffect(() => {
    if (closing) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onRequestClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [closing, onRequestClose])

  const handleAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (closing && event.currentTarget === event.target) onExited()
  }

  return (
    <>
      {hasBackdrop && (
        <div
          aria-hidden="true"
          className={`ad-adaptive-panel-backdrop ${panelClassName ? `${panelClassName}-backdrop` : ""} ${closing ? "is-closing" : ""}`}
          onClick={onRequestClose}
        />
      )}
      <section
        aria-label={ariaLabel}
        aria-modal={hasBackdrop ? true : undefined}
        className={`ad-adaptive-panel ad-adaptive-panel-${presentation} ${panelClassName ?? ""} ${variantClass} ${closing ? "is-closing" : ""}`}
        onAnimationEnd={handleAnimationEnd}
        role={hasBackdrop ? "dialog" : "complementary"}
      >
        <div className={`ad-adaptive-panel-toolbar ${panelClassName ? `${panelClassName}-toolbar` : ""}`}>
          {!isMobile && (
            <div
              aria-label={modeGroupLabel}
              className={`ad-adaptive-panel-view-toggle ${panelClassName ? `${panelClassName}-view-toggle` : ""}`}
              role="group"
            >
              <button
                aria-label={drawerLabel}
                aria-pressed={mode === "drawer"}
                className={mode === "drawer" ? "active" : ""}
                onClick={() => onModeChange("drawer")}
                title={drawerLabel}
                type="button"
              >
                <PanelRight aria-hidden="true" size={17} />
              </button>
              <button
                aria-label={modalLabel}
                aria-pressed={mode === "modal"}
                className={mode === "modal" ? "active" : ""}
                onClick={() => onModeChange("modal")}
                title={modalLabel}
                type="button"
              >
                <Maximize2 aria-hidden="true" size={17} />
              </button>
            </div>
          )}
          <button
            aria-label={closeLabel}
            className={`ad-adaptive-panel-close ${panelClassName ? `${panelClassName}-close` : ""}`}
            onClick={onRequestClose}
            type="button"
          >
            <X aria-hidden="true" size={22} strokeWidth={2.5} />
          </button>
        </div>
        <div className={`ad-adaptive-panel-scroll ${panelClassName ? `${panelClassName}-scroll` : ""}`}>
          {children}
        </div>
      </section>
    </>
  )
}
