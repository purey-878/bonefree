import { useCallback, useEffect, useRef, useState } from "react"
import { ChefHat, Clock, Eye, EyeOff, PackageCheck, X } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { checkoutService } from "../services"
import type { OrderResponse } from "../types/checkout"
import { useAuth } from "../hooks"
import { ACTIVE_ORDER_KEY } from "./orderStatusStorage"
import "./OrderStatusBar.css"

const SERVED_STATUSES = new Set(["entregue", "servido"])
const TERMINAL_STATUSES = new Set(["entregue", "servido", "cancelada", "reembolsada"])
const DISMISSIBLE_STATUSES = new Set(["pronta", "entregue", "servido", "cancelada", "reembolsada"])
const STATUS_STEPS = ["confirmada", "em_preparacao", "pronta", "entregue"]

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pendente: "A aguardar confirmação",
    confirmada: "Recebida",
    em_preparacao: "Em preparação",
    pronta: "Pronta",
    entregue: "Servido",
    servido: "Servido",
    cancelada: "Cancelada",
    reembolsada: "Reembolsada",
  }

  return labels[status] ?? status.replace(/_/g, " ")
}

function statusIndex(status: string) {
  if (SERVED_STATUSES.has(status)) return STATUS_STEPS.length - 1
  if (status === "pendente") return 0
  const index = STATUS_STEPS.indexOf(status)
  return index >= 0 ? index : 0
}

function statusProgress(status: string) {
  if (SERVED_STATUSES.has(status) || status === "cancelada" || status === "reembolsada") return 100

  const currentStep = statusIndex(status)
  return Math.min(100, Math.max(12, (currentStep / (STATUS_STEPS.length - 1)) * 100))
}

function orderCreatedAt(order: OrderResponse) {
  const timestamp = new Date(order.data_criacao).getTime()
  return Number.isNaN(timestamp) ? order.id_pedido : timestamp
}

function findActiveOrder(orders: OrderResponse[]) {
  const storedId = Number(localStorage.getItem(ACTIVE_ORDER_KEY))
  const ongoingOrders = orders
    .filter((order) => !TERMINAL_STATUSES.has(order.status))
    .sort((first, second) => orderCreatedAt(first) - orderCreatedAt(second) || first.id_pedido - second.id_pedido)

  if (storedId) {
    const storedOrder = orders.find((order) => order.id_pedido === storedId)
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
  return order.estado_pagamento === "pago" && !order.can_cancel && !TERMINAL_STATUSES.has(order.status)
}

function statusMessage(order: OrderResponse, cancelError: string | null, ongoingCount: number) {
  if (cancelError) return cancelError
  if (SERVED_STATUSES.has(order.status)) return "Servido. Bom apetite."
  if (order.status === "cancelada") return "Este pedido foi cancelado."
  if (order.status === "reembolsada") return "Este pedido foi reembolsado."
  if (ongoingCount > 1) {
    return "A barra mostra o pedido mais antigo em curso. Veja todos os pedidos em Perfil > Pedidos."
  }
  if (isPaymentConfirmed(order)) {
    return "Para pedidos de reembolso ou cancelamento após pagamento, fale com um membro da equipa ao balcão."
  }
  return "Vamos manter esta barra atualizada até o seu pedido ser servido."
}

export default function OrderStatusBar() {
  const { isAuthenticated } = useAuth()
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
    localStorage.removeItem(ACTIVE_ORDER_KEY)
    setOrder(null)
    setOngoingCount(0)
    setCancelError(null)
  }, [clearAutoDismissTimer])

  const handleCancelOrder = async () => {
    if (!order?.can_cancel) return

    try {
      setIsCancelling(true)
      setCancelError(null)
      const cancelledOrder = await checkoutService.cancelOrder(order.id_pedido)
      setOrder(cancelledOrder)
      setOngoingCount(0)
      localStorage.setItem(ACTIVE_ORDER_KEY, String(cancelledOrder.id_pedido))
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Não foi possível cancelar este pedido.")
    } finally {
      setIsCancelling(false)
    }
  }

  const loadOrder = useCallback(async () => {
    if (!isAuthenticated || isAdminRoute) return

    try {
      const orders = await checkoutService.getHistory()
      const { order: activeOrder, ongoingCount: nextOngoingCount } = findActiveOrder(orders)

      if (!activeOrder) {
        clearOrder()
        return
      }

      clearAutoDismissTimer()
      setOrder(activeOrder)
      setOngoingCount(nextOngoingCount)
      localStorage.setItem(ACTIVE_ORDER_KEY, String(activeOrder.id_pedido))

      if (SERVED_STATUSES.has(activeOrder.status)) {
        autoDismissTimer.current = window.setTimeout(() => {
          if (Number(localStorage.getItem(ACTIVE_ORDER_KEY)) === activeOrder.id_pedido) {
            clearOrder()
          }
        }, 20000)
      }
    } catch (error) {
      console.error("Não foi possível atualizar o estado do pedido ativo.", error)
    }
  }, [clearAutoDismissTimer, clearOrder, isAdminRoute, isAuthenticated])

  const dismissOrder = useCallback(() => {
    clearAutoDismissTimer()
    localStorage.removeItem(ACTIVE_ORDER_KEY)
    setOrder(null)
    setOngoingCount(0)
    setCancelError(null)
    window.setTimeout(() => void loadOrder(), 0)
  }, [clearAutoDismissTimer, loadOrder])

  useEffect(() => {
    if (!isAuthenticated) {
      clearOrder()
    }
  }, [clearOrder, isAuthenticated])

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
        <span>{order.numero_pedido}</span>
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
          {order.status === "pronta" || SERVED_STATUSES.has(order.status) ? <PackageCheck size={20} /> : order.status === "em_preparacao" ? <ChefHat size={20} /> : <Clock size={20} />}
        </div>
        <div className="order-status-copy">
          <div className="order-status-heading">
            <strong className="fw-bold">{order.numero_pedido}</strong>
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
          <Link to="/profile?tab=orders">Detalhes</Link>
          {order.can_cancel && (
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
