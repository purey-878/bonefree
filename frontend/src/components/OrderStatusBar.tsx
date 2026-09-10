import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChefHat, Clock, EyeOff, ListChecks, PackageCheck, X } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { ApiError } from "../api/errors"
import { useAuth } from "../hooks"
import i18n from "../i18n"
import { checkoutService } from "../services"
import type { OrderResponse } from "../types/checkout"
import {
  GUEST_ORDERS_UPDATED_EVENT,
  isGuestOrdersStorageEvent,
  readGuestOrderAccesses,
  removeGuestOrderAccesses,
} from "./orderStatusStorage"
import "./OrderStatusBar.css"
import { useOrganization } from '../organization/context/organization-context'

const TERMINAL_STATUSES = new Set(["delivered", "cancelled"])
const STATUS_STEPS = ["confirmed", "in_preparation", "ready", "delivered"]

interface TrackedOrder {
  order: OrderResponse
  accessToken: string | null
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: i18n.t("order.tracker.pending", { ns: "storefront" }),
    confirmed: i18n.t("order.tracker.confirmed", { ns: "storefront" }),
    in_preparation: i18n.t("order.tracker.inPreparation", { ns: "storefront" }),
    ready: i18n.t("order.tracker.ready", { ns: "storefront" }),
    delivered: i18n.t("order.tracker.delivered", { ns: "storefront" }),
    cancelled: i18n.t("order.tracker.cancelled", { ns: "storefront" }),
  }
  return labels[status] ?? status.replace(/_/g, " ")
}

function statusProgress(status: string) {
  if (status === "delivered" || status === "cancelled") return 100
  if (status === "pending") return 12
  const index = STATUS_STEPS.indexOf(status)
  return index < 0 ? 12 : Math.max(12, (index / (STATUS_STEPS.length - 1)) * 100)
}
function orderCreatedAt(order: OrderResponse) {
  const timestamp = new Date(order.createdAt).getTime()
  return Number.isNaN(timestamp) ? order.orderId : timestamp
}

function statusIcon(status: string) {
  if (status === "ready" || status === "delivered") return <PackageCheck size={18} />
  if (status === "in_preparation") return <ChefHat size={18} />
  return <Clock size={18} />
}
export default function OrderStatusBar({ onCountChange }: { onCountChange: (count: number) => void }) {
  const { t } = useTranslation("storefront")
  const { capabilities } = useOrganization()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const location = useLocation()
  const ownerKey = authLoading ? null : isAuthenticated ? `customer-${user?.customerId}` : "guest"
  const [trackedOrders, setTrackedOrders] = useState<{ ownerKey: string | null; orders: TrackedOrder[] } | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isHiding, setIsHiding] = useState(false)
  const panelRef = useRef<HTMLElement | null>(null)
  const hideAnimationRef = useRef<Animation | null>(null)
  const requestsRef = useRef({ version: 0 })
  const [isHighlighted, setIsHighlighted] = useState(false)
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null)
  const [cancelErrors, setCancelErrors] = useState<Record<number, string>>({})

  const isAdminRoute = location.pathname.startsWith("/admin")

  const loadOrders = useCallback(async () => {
    if (!capabilities.has('ordering') || isAdminRoute || authLoading) return
    const version = ++requestsRef.current.version

    if (isAuthenticated) {
      try {
        const history = await checkoutService.getAllHistory()
        if (version !== requestsRef.current.version) return
        setTrackedOrders({ ownerKey, orders: history
            .filter((order) => !TERMINAL_STATUSES.has(order.status))
            .sort((first, second) => orderCreatedAt(first) - orderCreatedAt(second))
            .map((order) => ({ order, accessToken: null })),
        })
      } catch (error) {
        console.error("Não foi possível atualizar os pedidos em curso.", error)
      }
      return
    }

    const accesses = readGuestOrderAccesses()
    if (accesses.length === 0) {
      setTrackedOrders({ ownerKey, orders: [] })
      return
    }

    const results = await Promise.allSettled(
      accesses.map(async (access) => ({
        order: await checkoutService.getOrder(access.orderId, access.accessToken),
        accessToken: access.accessToken,
      })),
    )
    if (version !== requestsRef.current.version) return
    const invalidOrderIds: number[] = []
    const loadedOrders: TrackedOrder[] = []

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        if (!TERMINAL_STATUSES.has(result.value.order.status)) loadedOrders.push(result.value)
        return
      }
      if (result.reason instanceof ApiError && (result.reason.status === 401 || result.reason.status === 404)) {
        invalidOrderIds.push(accesses[index].orderId)
        return
      }
      console.error("Não foi possível atualizar um pedido de convidado.", result.reason)
    })

    if (invalidOrderIds.length > 0) removeGuestOrderAccesses(invalidOrderIds)
    loadedOrders.sort((first, second) => orderCreatedAt(first.order) - orderCreatedAt(second.order))
    if (version === requestsRef.current.version) setTrackedOrders({ ownerKey, orders: loadedOrders })
  }, [authLoading, capabilities, isAdminRoute, isAuthenticated, ownerKey])

  useEffect(() => {
    const requests = requestsRef.current
    void loadOrders()
    const intervalId = window.setInterval(() => void loadOrders(), 5000)
    const refreshVisibleOrders = () => {
      if (document.visibilityState === "visible") void loadOrders()
    }
    const highlight = () => {
      hideAnimationRef.current?.cancel()
      setIsHiding(false)
      setIsCollapsed(false)
      setIsHighlighted(true)
      window.setTimeout(() => setIsHighlighted(false), 2400)
      void loadOrders()
    }
    const loadOrdersFromStorage = (event: StorageEvent) => {
      if (isGuestOrdersStorageEvent(event)) void loadOrders()
    }

    window.addEventListener(GUEST_ORDERS_UPDATED_EVENT, loadOrders)
    window.addEventListener("storage", loadOrdersFromStorage)
    window.addEventListener("order-status-highlight", highlight)
    window.addEventListener("focus", loadOrders)
    document.addEventListener("visibilitychange", refreshVisibleOrders)
    return () => {
      requests.version++
      window.clearInterval(intervalId)
      window.removeEventListener(GUEST_ORDERS_UPDATED_EVENT, loadOrders)
      window.removeEventListener("storage", loadOrdersFromStorage)
      window.removeEventListener("order-status-highlight", highlight)
      window.removeEventListener("focus", loadOrders)
      document.removeEventListener("visibilitychange", refreshVisibleOrders)
    }
  }, [loadOrders])

  const ongoingOrders = useMemo(
    () => trackedOrders?.ownerKey === ownerKey ? trackedOrders.orders.filter(({ order }) => !TERMINAL_STATUSES.has(order.status)) : [],
    [trackedOrders, ownerKey],
  )

  useEffect(() => {
    onCountChange(capabilities.has('ordering') && !isAdminRoute ? ongoingOrders.length : 0)
  }, [capabilities, isAdminRoute, ongoingOrders.length, onCountChange])

  useEffect(() => () => { hideAnimationRef.current?.cancel() }, [location.pathname])

  const hidePanel = async () => {
    const panel = panelRef.current
    if (!panel || isHiding) return
    const target = Array.from(document.querySelectorAll<HTMLElement>('[data-orders-destination]'))
      .sort((a, b) => Number(b.dataset.ordersDestination === 'mobile') - Number(a.dataset.ordersDestination === 'mobile'))
      .find(element => {
        const rect = element.getBoundingClientRect()
        // Mobile browser chrome and pixel rounding can put a rendered fixed link
        // fractionally beyond innerHeight. Its box still gives the correct target.
        return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'
      })
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const shouldRestoreFocus = panel.contains(document.activeElement)
    setIsHiding(true)
    if (target && !reducedMotion) {
      const from = panel.getBoundingClientRect()
      const to = (target.querySelector('svg') ?? target).getBoundingClientRect()
      const dx = to.left + to.width / 2 - (from.left + from.width / 2)
      const dy = to.top + to.height / 2 - (from.top + from.height / 2)
      const animation = panel.animate([
        { transform: getComputedStyle(panel).transform, opacity: 1, offset: 0 },
        { transform: `translateX(-50%) translate(${dx * 0.35}px, ${dy * 0.2}px) scale(0.65)`, opacity: 0.95, offset: 0.45 },
        { transform: `translateX(-50%) translate(${dx}px, ${dy}px) scale(0.04)`, opacity: 0, offset: 1 },
      ], { duration: 560, easing: 'cubic-bezier(0.4, 0, 0.65, 1)', fill: 'forwards' })
      hideAnimationRef.current = animation
      await animation.finished.catch(() => undefined)
      if (animation.playState === 'idle' || panelRef.current !== panel) {
        setIsHiding(false)
        hideAnimationRef.current = null
        return
      }
      const icon = target.querySelector('.bottom-nav-icon') ?? target
      icon.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.22)', offset: 0.4 },
        { transform: 'scale(1)' },
      ], { duration: 320, easing: 'ease-out' })
    }
    setIsCollapsed(true)
    setIsHiding(false)
    hideAnimationRef.current = null
    if (shouldRestoreFocus && target?.isConnected) target.focus({ preventScroll: true })
  }

  const cancelOrder = async (tracked: TrackedOrder) => {
    if (!tracked.order.canCancel) return
    try {
      setCancellingOrderId(tracked.order.orderId)
      setCancelErrors((current) => ({ ...current, [tracked.order.orderId]: "" }))
      await checkoutService.cancelOrder(tracked.order.orderId, tracked.accessToken)
      await loadOrders()
    } catch (error) {
      setCancelErrors((current) => ({
        ...current,
        [tracked.order.orderId]: error instanceof Error ? error.message : t("order.cancelFailed"),
      }))
    } finally {
      setCancellingOrderId(null)
    }
  }

  if (ongoingOrders.length === 0 || isAdminRoute || location.pathname === '/orders' || location.pathname.startsWith('/orders/') || isCollapsed) return null

  const leadOrder = ongoingOrders[0].order
  const ordersHref = "/orders"
  const statusClass = ongoingOrders.length === 1 ? `status-${leadOrder.status}` : "status-multiple"

  return (
    <aside ref={panelRef} className={`order-status-bar ${statusClass} ${isHighlighted ? "highlighted" : ""} ${isHiding ? "is-hiding" : ""}`} aria-live="polite">
      <header className="order-status-bar-header">
        <div>
          <ListChecks size={19} aria-hidden="true" />
          <strong>{t("order.tracker.ongoingCount", { count: ongoingOrders.length })}</strong>
        </div>
        <div className="order-status-header-actions">
          <Link to={ordersHref}>{t("order.tracker.viewAll")}</Link>
          <button type="button" onClick={() => void hidePanel()} disabled={isHiding} aria-label={t("order.tracker.hideLabel")}>
            <EyeOff size={15} /> {t("order.tracker.hide")}
          </button>
        </div>
      </header>

      <div className="order-status-list">
        {ongoingOrders.map((tracked) => {
          const { order } = tracked
          return (
            <article className={`order-status-row status-${order.status}`} key={order.orderId}>
              <div className="order-status-icon" aria-hidden="true">{statusIcon(order.status)}</div>
              <div className="order-status-copy">
                <div className="order-status-heading">
                  <strong>{order.orderNumber}</strong>
                  <span>{statusLabel(order.status)}</span>
                </div>
                {cancelErrors[order.orderId] && <p className="order-status-help">{cancelErrors[order.orderId]}</p>}
              </div>
              <div className="order-status-actions">
                <Link to={`/orders/${order.orderId}`}>{t("order.tracker.details")}</Link>
                {order.canCancel && (
                  <button
                    type="button"
                    className="order-status-cancel"
                    onClick={() => void cancelOrder(tracked)}
                    disabled={cancellingOrderId === order.orderId}
                    aria-label={t("order.tracker.cancelLabel")}
                  >
                    <X size={15} />
                    {cancellingOrderId === order.orderId ? t("order.tracker.cancelling") : t("order.tracker.cancel")}
                  </button>
                )}
              </div>
              <div className="order-status-progress" aria-hidden="true">
                <span style={{ width: `${statusProgress(order.status)}%` }} />
              </div>
            </article>
          )
        })}
      </div>
    </aside>
  )
}
