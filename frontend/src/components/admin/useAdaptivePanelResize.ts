import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent } from "react"
import { organizationStorage } from "../../core/storage/organizationStorage"

export default function useAdaptivePanelResize(enabled: boolean, panelType = "default") {
  const panelRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ x: number; width: number } | null>(null)
  const storageKey = `admin_panel_width:${panelType}`
  const [preferredWidth, setPreferredWidth] = useState<number | null>(() => {
    try {
      const stored = Number(organizationStorage.getItem(storageKey))
      return Number.isFinite(stored) && stored > 0 ? stored : null
    } catch {
      return null
    }
  })
  const [limits, setLimits] = useState({ min: 560, max: 560, initial: 560 })
  const [dragging, setDragging] = useState(false)
  const clamp = (value: number) => Math.round(Math.min(limits.max, Math.max(limits.min, value)))
  const width = clamp(preferredWidth ?? limits.initial)

  useLayoutEffect(() => {
    if (!enabled) return
    const syncLimits = () => {
      if (!panelRef.current) return
      const styles = getComputedStyle(panelRef.current)
      const initial = parseFloat(styles.getPropertyValue("--adaptive-panel-drawer-width")) || 560
      const minimum = parseFloat(styles.getPropertyValue("--adaptive-panel-drawer-min-width")) || initial
      const max = document.documentElement.clientWidth
      setLimits({ min: Math.min(minimum, max), max, initial })
    }
    syncLimits()
    window.addEventListener("resize", syncLimits)
    return () => window.removeEventListener("resize", syncLimits)
  }, [enabled, panelType])

  useEffect(() => {
    if (!enabled || !dragging) return
    const { cursor, userSelect } = document.body.style
    document.body.style.cursor = "ew-resize"
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.cursor = cursor
      document.body.style.userSelect = userSelect
      dragRef.current = null
      setDragging(false)
    }
  }, [enabled, dragging])

  const persist = (nextWidth: number) => {
    try {
      organizationStorage.setItem(storageKey, String(nextWidth))
    } catch {
      // Resizing remains available when browser storage is disabled.
    }
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    persist(width)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return {
    panelRef,
    width,
    resizing: enabled && dragging,
    handleProps: {
      "aria-valuemin": limits.min,
      "aria-valuemax": limits.max,
      "aria-valuenow": width,
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (!event.isPrimary || event.button !== 0) return
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { x: event.clientX, width }
        setDragging(true)
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const start = dragRef.current
        if (start) setPreferredWidth(clamp(start.width + start.x - event.clientX))
      },
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
      onLostPointerCapture: finishDrag,
      onDoubleClick: () => {
        const initial = clamp(limits.initial)
        setPreferredWidth(initial)
        persist(initial)
      },
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? 50 : 10
        const next = { ArrowLeft: width + step, ArrowRight: width - step, Home: limits.min, End: limits.max }[event.key]
        if (next === undefined) return
        event.preventDefault()
        const clamped = clamp(next)
        setPreferredWidth(clamped)
        persist(clamped)
      },
    },
  }
}
