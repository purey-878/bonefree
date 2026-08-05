import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent, ReactNode } from "react"
import { createPortal } from "react-dom"
import "./CustomSelect.css"

export type CustomSelectValue = string | number

export type CustomSelectOption = {
  value: CustomSelectValue
  label: ReactNode
  disabled?: boolean
}

type CustomSelectProps = {
  id?: string
  className?: string
  disabled?: boolean
  options: CustomSelectOption[]
  value: CustomSelectValue
  placeholder?: ReactNode
  "aria-label"?: string
  onChange: (value: CustomSelectValue) => void
}

function valuesEqual(a: CustomSelectValue, b: CustomSelectValue) {
  return String(a) === String(b)
}

export default function CustomSelect({
  id,
  className = "",
  disabled = false,
  options,
  value,
  placeholder = "Select an option",
  "aria-label": ariaLabel,
  onChange,
}: CustomSelectProps) {
  const fallbackId = useId()
  const selectId = id ?? fallbackId
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const selectedIndex = useMemo(
    () => options.findIndex((option) => valuesEqual(option.value, value)),
    [options, value],
  )
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null

  const updateMenuPosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const viewportGap = 12
    const maxHeight = Math.min(280, window.innerHeight - viewportGap * 2)
    const spaceBelow = window.innerHeight - rect.bottom - viewportGap
    const spaceAbove = rect.top - viewportGap
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
    const availableHeight = Math.max(150, Math.min(maxHeight, openUp ? spaceAbove : spaceBelow))

    const preferredMenuWidth = Math.max(rect.width, 320)
    const menuWidth = Math.min(preferredMenuWidth, window.innerWidth - viewportGap * 2)
    const menuLeft = Math.min(
      Math.max(viewportGap, rect.left),
      window.innerWidth - menuWidth - viewportGap,
    )

    setMenuStyle({
      left: menuLeft,
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      width: menuWidth,
      maxHeight: availableHeight,
    })
  }

  useEffect(() => {
    if (!open) return

    updateMenuPosition()

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }

    window.addEventListener("resize", updateMenuPosition)
    window.addEventListener("scroll", updateMenuPosition, true)
    document.addEventListener("pointerdown", handlePointerDown)

    return () => {
      window.removeEventListener("resize", updateMenuPosition)
      window.removeEventListener("scroll", updateMenuPosition, true)
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [open])

  const selectOption = (option: CustomSelectOption) => {
    if (option.disabled) return
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const moveSelection = (direction: 1 | -1) => {
    if (options.length === 0) return
    let nextIndex = selectedIndex

    for (let index = 0; index < options.length; index += 1) {
      nextIndex = (nextIndex + direction + options.length) % options.length
      const next = options[nextIndex]
      if (!next.disabled) {
        onChange(next.value)
        break
      }
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
      moveSelection(1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
      moveSelection(-1)
    } else if (event.key === "Home") {
      event.preventDefault()
      const first = options.find((option) => !option.disabled)
      if (first) onChange(first.value)
    } else if (event.key === "End") {
      event.preventDefault()
      const last = [...options].reverse().find((option) => !option.disabled)
      if (last) onChange(last.value)
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      setOpen((current) => !current)
    } else if (event.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className={`custom-select ${open ? "open" : ""} ${className}`}>
      <button
        id={selectId}
        ref={triggerRef}
        type="button"
        className="custom-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className={!selected ? "placeholder" : ""}>{selected?.label ?? placeholder}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="custom-select-menu"
          role="listbox"
          aria-labelledby={selectId}
          style={menuStyle}
        >
          {options.map((option) => {
            const selectedOption = valuesEqual(option.value, value)

            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={selectedOption}
                className={selectedOption ? "selected" : ""}
                disabled={option.disabled}
                onClick={() => selectOption(option)}
              >
                <span>{option.label}</span>
                {selectedOption && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
