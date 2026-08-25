import { Check, ChevronDown } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { useTranslation } from "react-i18next"

import { changeLocale, LOCALE_OPTIONS, resolvedLocale } from "../i18n"
import type { SupportedLocale } from "../i18n"
import "./LanguageSwitcher.css"

function FlagIcon({ flag }: { flag: "pt" | "gb" | "de" }) {
  if (flag === "pt") {
    return (
      <svg aria-hidden="true" className="language-flag" viewBox="0 0 36 24">
        <rect width="36" height="24" rx="3" fill="#d62828" />
        <path d="M0 0h14v24H0z" fill="#167449" />
        <circle cx="14" cy="12" r="4" fill="#f7cc32" />
      </svg>
    )
  }
  if (flag === "gb") {
    return (
      <svg aria-hidden="true" className="language-flag" viewBox="0 0 36 24">
        <rect width="36" height="24" rx="3" fill="#17356f" />
        <path d="m0 0 36 24M36 0 0 24" stroke="#fff" strokeWidth="5" />
        <path d="m0 0 36 24M36 0 0 24" stroke="#c8102e" strokeWidth="2" />
        <path d="M18 0v24M0 12h36" stroke="#fff" strokeWidth="7" />
        <path d="M18 0v24M0 12h36" stroke="#c8102e" strokeWidth="4" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" className="language-flag" viewBox="0 0 36 24">
      <rect width="36" height="8" rx="3" fill="#161616" />
      <path d="M0 8h36v8H0z" fill="#d00" />
      <path d="M0 16h36v5a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3z" fill="#ffce00" />
    </svg>
  )
}

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { t } = useTranslation("common")
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const currentLocale = resolvedLocale()
  const current = LOCALE_OPTIONS.find((option) => option.code === currentLocale) ?? LOCALE_OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const focusTimer = window.setTimeout(() => {
      const selectedIndex = LOCALE_OPTIONS.findIndex((option) => option.code === currentLocale)
      itemRefs.current[Math.max(0, selectedIndex)]?.focus()
    }, 0)
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("touchstart", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("touchstart", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [currentLocale, open])

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const focusedIndex = itemRefs.current.findIndex((item) => item === document.activeElement)
    const lastIndex = LOCALE_OPTIONS.length - 1
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? lastIndex
        : event.key === "ArrowDown" ? (focusedIndex + 1) % LOCALE_OPTIONS.length
          : focusedIndex <= 0 ? lastIndex : focusedIndex - 1
    itemRefs.current[nextIndex]?.focus()
  }

  const selectLocale = async (locale: SupportedLocale) => {
    setOpen(false)
    triggerRef.current?.focus()
    if (locale === currentLocale) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion) {
      await changeLocale(locale)
      return
    }

    setSwitching(true)
    await new Promise((resolve) => window.setTimeout(resolve, 90))
    await changeLocale(locale)
    window.requestAnimationFrame(() => setSwitching(false))
  }

  return (
    <div className={`language-switcher ${switching ? "is-switching" : ""} ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="language-switcher-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("language.current", { language: t(current.nameKey) })}
        onClick={() => setOpen((value) => !value)}
      >
        <FlagIcon flag={current.flag} />
        <span>{current.shortCode}</span>
        <ChevronDown aria-hidden="true" size={14} />
      </button>

      <div
        className="language-switcher-menu"
        role="menu"
        aria-label={t("language.select")}
        aria-hidden={!open}
        data-open={open}
        onKeyDown={handleMenuKeyDown}
      >
          <span className="language-switcher-heading">{t("language.label")}</span>
          {LOCALE_OPTIONS.map((option) => {
            const selected = option.code === currentLocale
            return (
              <button
                type="button"
                ref={(node) => { itemRefs.current[LOCALE_OPTIONS.indexOf(option)] = node }}
                key={option.code}
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={open ? 0 : -1}
                className={selected ? "selected" : ""}
                onClick={() => void selectLocale(option.code)}
              >
                <FlagIcon flag={option.flag} />
                <span>{t(option.nameKey)}</span>
                {selected && <Check aria-hidden="true" size={16} />}
              </button>
            )
          })}
      </div>
    </div>
  )
}
