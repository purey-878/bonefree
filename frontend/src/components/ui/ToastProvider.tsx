import { useCallback, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react"
import { ToastContext } from "./toastContext"
import type { ToastOptions, ToastType, ToastContextValue } from "./toastContext"
import { translateUserMessage } from "../../utils/messages"
import "./ToastProvider.css"

type Toast = {
  id: number
  type: ToastType
  message: string
}

const TOAST_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertCircle,
  info: Info,
} satisfies Record<ToastType, typeof CheckCircle2>

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback((type: ToastType, message: string, options?: ToastOptions) => {
    const id = nextId.current
    nextId.current += 1
    setToasts((current) => [...current, { id, type, message }].slice(-5))

    const duration = options?.duration ?? (type === "error" ? 5200 : 3600)
    const timer = window.setTimeout(() => dismiss(id), duration)
    timers.current.set(id, timer)
  }, [dismiss])

  const api = useMemo<ToastContextValue>(() => ({
    success: (message, options) => show("success", message, options),
    error: (message, options) => show("error", message, options),
    warning: (message, options) => show("warning", message, options),
    info: (message, options) => show("info", message, options),
  }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions removals">
        {toasts.map((toast) => {
          const Icon = TOAST_ICONS[toast.type]
          const assertive = toast.type === "error" || toast.type === "warning"

          return (
            <div
              key={toast.id}
              className={`app-toast ${toast.type}`}
              role={assertive ? "alert" : "status"}
              aria-live={assertive ? "assertive" : "polite"}
            >
              <Icon size={18} aria-hidden="true" />
              <p>{translateUserMessage(toast.message)}</p>
              <button type="button" aria-label="Fechar notificação" onClick={() => dismiss(toast.id)}>
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
