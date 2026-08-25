import { useEffect, useRef } from "react"
import { AlertTriangle, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import "./ConfirmDialog.css"

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText,
  cancelText,
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation("common")
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return

    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusTimer = window.setTimeout(() => confirmButtonRef.current?.focus(), 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onCancel()
      if (event.key !== "Tab") return

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener("keydown", handleKeyDown)
      previousActiveElement?.focus()
    }
  }, [loading, onCancel, open])

  if (!open) return null

  return (
    <div className="confirm-dialog-layer">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label={t("dialog.close")}
        disabled={loading}
        onClick={onCancel}
      />
      <div
        ref={dialogRef}
        className={`confirm-dialog ${danger ? "danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <div className="confirm-dialog-icon" aria-hidden="true">
          <AlertTriangle size={22} />
        </div>
        <button
          type="button"
          className="confirm-dialog-close"
          aria-label={t("dialog.close")}
          disabled={loading}
          onClick={onCancel}
        >
          <X size={18} />
        </button>
        <div className="confirm-dialog-copy">
          <h2 id="confirm-dialog-title">{title}</h2>
          <p id="confirm-dialog-description">{description}</p>
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel" disabled={loading} onClick={onCancel}>
            {cancelText ?? t("actions.cancel")}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="confirm-dialog-confirm"
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? t("actions.processing") : (confirmText ?? t("actions.confirm"))}
          </button>
        </div>
      </div>
    </div>
  )
}
