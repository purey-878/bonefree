import { useCallback, useEffect, useRef, useState } from "react"
import { ChefHat, Clock, Eye, EyeOff, PackageCheck, X } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { checkoutService } from "../services"
import { ApiError } from "../api/errors"
import type { OrderResponse } from "../types/checkout"
import { useAuth } from "../hooks"
import {
  ACTIVE_ORDER_KEY,
  clearActiveOrder,
  readActiveOrder,
  rememberActiveOrder,
} from "./orderStatusStorage"
import "./OrderStatusBar.css"

const SERVED_STATUSES = new Set(["delivered"])
const TERMINAL_STATUSES = new Set(["delivered", "cancelled"])
const DISMISSIBLE_STATUSES = new Set(["ready", "delivered", "cancelled"])
const STATUS_STEPS = ["confirmed", "in_preparation", "ready", "delivered"]

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "A aguardar confirmação",
    confirmed: "Recebida",
    in_preparation: "Em preparação",
    ready: "Pronta",
    delivered: "Servido",
    cancelled: "Cancelada",
  }

  return labels[status] ?? status.replace(/_/g, " ")
}

function statusIndex(status: string) {
  if (SERVED_STATUSES.has(status)) return STATUS_STEPS.length - 1
  if (status === "pending") return 0
  const index = STATUS_STEPS.indexOf(status)
  return index >= 0 ? index : 0
}

function statusProgress(status: string) {
  if (SERVED_STATUSES.has(status) || status === "cancelled") return 100

  const currentStep = statusIndex(status)
  return Math.min(100, Math.max(12, (currentStep / (STATUS_STEPS.length - 1)) * 100))
}

function orderCreatedAt(order: OrderResponse) {
  const timestamp = new Date(order.createdAt).getTime()
  return Number.isNaN(timestamp) ? order.orderId : timestamp
}

function findActiveOrder(orders: OrderResponse[]) {
  const storedId = Number(localStorage.getItem(ACTIVE_ORDER_KEY))
  const ongoingOrders = orders
    .filter((order) => !TERMINAL_STATUSES.has(order.status))
    .sort((first, second) => orderCreatedAt(first) - orderCreatedAt(second) || first.orderId - second.orderId)

  if (storedId) {
    const storedOrder = orders.find((order) => order.orderId === storedId)
    if (storedOrder) {
      return {
        order: storedOrder,
        ongoingCount: TERMINAL_STATUSES.has(storedOrder.status) ? 0 : 1,
      }
    }
  }

  if (ongoingOrders.length > 0) {
    return { order: ongoingOrders[0], ongoingCount: ongoingOrders.length }
  }

  return { order: null, ongoingCount: 0 }
}

function isPaymentConfirmed(order: OrderResponse) {
  return order.paymentStatus === "paid" && !order.canCancel && !TERMINAL_STATUSES.has(order.status)
}

function statusMessage(order: OrderResponse, cancelError: string | null, ongoingCount: number) {
  if (cancelError) return cancelError
  if (SERVED_STATUSES.has(order.status)) return "Servido. Bom apetite."
  if (order.status === "cancelled") return "Este pedido foi cancelado."
  if (ongoingCount > 1) {
    return "A barra mostra o pedido mais antigo em curso. Veja todos os pedidos em Perfil > Pedidos."
  }
  if (isPaymentConfirmed(order)) {
    return "Para assistência após o pagamento, fale com um membro da equipa ao balcão."
  }
  return "Vamos manter esta barra atualizada até o seu pedido ser servido."
}

export default function OrderStatusBar() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const location = useLocation()
  const [order, setOrder] = useState<OrderResponse | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isHighlighted, setIsHighlighted] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [ongoingCount, setOngoingCount] = useState(0)
  const autoDismissTimer = useRef<number | null>(null)

  const isAdminRoute = location.pathname.startsWith("/admin")
  const clearAutoDismissTimer = useCallback(() => {
    if (autoDismissTimer.current !== null) {
      window.clearTimeout(autoDismissTimer.current)
      autoDismissTimer.current = null
    }
  }, [])

  const clearOrder = useCallback(() => {
    clearAutoDismissTimer()
    clearActiveOrder(false)
    setOrder(null)
    setOngoingCount(0)
    setCancelError(null)
  }, [clearAutoDismissTimer])

  const handleCancelOrder = async () => {
    if (!order?.canCancel) return

    try {
      setIsCancelling(true)
      setCancelError(null)
      const activeAccess = readActiveOrder()
      const accessToken = activeAccess?.orderId === order.orderId
        ? activeAccess.accessToken
        : null
      const cancelledOrder = await checkoutService.cancelOrder(order.orderId, accessToken)
      setOrder(cancelledOrder)
      setOngoingCount(0)
      rememberActiveOrder(
        cancelledOrder.orderId,
        accessToken,
        activeAccess?.accessExpiresAt,
        false,
      )
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Não foi possível cancelar este pedido.")
    } finally {
      setIsCancelling(false)
    }
  }

  const loadOrder = useCallback(async () => {
    if (isAdminRoute) return

    try {
      const activeAccess = readActiveOrder()
      if (activeAccess?.accessToken) {
        const guestOrder = await checkoutService.getOrder(
          activeAccess.orderId,
          activeAccess.accessToken,
        )
        clearAutoDismissTimer()
        setOrder(guestOrder)
        setOngoingCount(TERMINAL_STATUSES.has(guestOrder.status) ? 0 : 1)

        if (SERVED_STATUSES.has(guestOrder.status)) {
          autoDismissTimer.current = window.setTimeout(() => clearOrder(), 20000)
        }
        return
      }

      if (authLoading) return
      if (!isAuthenticated) {
        clearOrder()
        return
      }

      const orders = await checkoutService.getHistory()
      const { order: activeOrder, ongoingCount: nextOngoingCount } = findActiveOrder(orders)

      if (!activeOrder) {
        clearOrder()
        return
      }

      clearAutoDismissTimer()
      setOrder(activeOrder)
      setOngoingCount(nextOngoingCount)
      rememberActiveOrder(activeOrder.orderId, null, null, false)

      if (SERVED_STATUSES.has(activeOrder.status)) {
        autoDismissTimer.current = window.setTimeout(() => {
          if (Number(localStorage.getItem(ACTIVE_ORDER_KEY)) === activeOrder.orderId) {
            clearOrder()
          }
        }, 20000)
      }
    } catch (error) {
      const activeAccess = readActiveOrder()
      if (
        activeAccess?.accessToken
        && error instanceof ApiError
        && (error.status === 401 || error.status === 404)
      ) {
        clearOrder()
        return
      }
      console.error("Não foi possível atualizar o estado do pedido ativo.", error)
    }
  }, [authLoading, clearAutoDismissTimer, clearOrder, isAdminRoute, isAuthenticated])

  const dismissOrder = useCallback(() => {
    clearAutoDismissTimer()
    clearActiveOrder(false)
    setOrder(null)
    setOngoingCount(0)
    setCancelError(null)
    window.setTimeout(() => void loadOrder(), 0)
  }, [clearAutoDismissTimer, loadOrder])

  useEffect(() => {
    void loadOrder()
    const intervalId = window.setInterval(() => void loadOrder(), 5000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadOrder()
    }
    const handleHighlight = () => {
      setIsCollapsed(false)
      setIsHighlighted(true)
      window.setTimeout(() => setIsHighlighted(false), 2400)
    }

    window.addEventListener("active-order-updated", loadOrder)
    window.addEventListener("order-status-highlight", handleHighlight)
    window.addEventListener("focus", loadOrder)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("active-order-updated", loadOrder)
      window.removeEventListener("order-status-highlight", handleHighlight)
      window.removeEventListener("focus", loadOrder)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      clearAutoDismissTimer()
    }
  }, [clearAutoDismissTimer, loadOrder])

  if (!order || isAdminRoute) return null

  const isTerminal = TERMINAL_STATUSES.has(order.status)
  const canDismiss = DISMISSIBLE_STATUSES.has(order.status)
  const paymentConfirmed = isPaymentConfirmed(order)
  const progress = statusProgress(order.status)
  const statusClass = `status-${order.status}`

  if (isCollapsed) {
    return (
      <div className={`order-status-mini ${statusClass}`}>
        <span>{order.orderNumber}</span>
        <strong>{statusLabel(order.status)}</strong>
        <button type="button" onClick={() => setIsCollapsed(false)} aria-label="Mostrar estado do pedido">
          <Eye size={14} />
          Mostrar
        </button>
      </div>
    )
  }

  return (
    <aside className={`order-status-bar ${statusClass} ${isTerminal ? "terminal" : ""} ${isHighlighted ? "highlighted" : ""}`} role="status" aria-live="polite">
      <div className="order-status-bar-main">
        <div className="order-status-icon" aria-hidden="true">
          {order.status === "ready" || SERVED_STATUSES.has(order.status) ? <PackageCheck size={20} /> : order.status === "in_preparation" ? <ChefHat size={20} /> : <Clock size={20} />}
        </div>
        <div className="order-status-copy">
          <div className="order-status-heading">
            <strong className="fw-bold">{order.orderNumber}</strong>
            <span>{statusLabel(order.status)}</span>
          </div>
          <p className={paymentConfirmed || ongoingCount > 1 || isTerminal ? "order-status-help" : ""}>{statusMessage(order, cancelError, ongoingCount)}</p>
        </div>
      </div>

      <div className="order-status-lower ">
        <div className="order-status-progress " aria-hidden="true">
          <span  style={{ width: `${progress}%` }} />
        </div>

        <div className="order-status-actions">
          <Link to={`/orders/${order.orderId}`}>Detalhes</Link>
          {order.canCancel && (
            <button
              type="button"
              className="order-status-cancel"
              onClick={handleCancelOrder}
              disabled={isCancelling}
              aria-label="Cancelar pedido"
            >
              <X size={16} />
              {isCancelling ? "A cancelar" : "Cancelar"}
            </button>
          )}
          <button type="button" onClick={() => setIsCollapsed(true)} aria-label="Ocultar estado do pedido">
            <EyeOff size={15} />
            Ocultar
          </button>
          {canDismiss && (
          <button type="button" onClick={dismissOrder} aria-label="Fechar estado do pedido">
            <X size={16} />
            Fechar
          </button>
          )}
        </div>
      </div>
    </aside>
  )
}
