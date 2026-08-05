import { createContext, useContext } from "react"

type ToastType = "success" | "error" | "warning" | "info"

type ToastOptions = {
  duration?: number
}

type ToastContextValue = {
  success: (message: string, options?: ToastOptions) => void
  error: (message: string, options?: ToastOptions) => void
  warning: (message: string, options?: ToastOptions) => void
  info: (message: string, options?: ToastOptions) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error("useToast must be used within ToastProvider")
  return context
}

export type { ToastContextValue, ToastOptions, ToastType }
