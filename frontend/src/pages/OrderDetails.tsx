import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  Check,
  ChefHat,
  Clock,
  Download,
  LoaderCircle,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
  WalletCards,
  X,
} from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { ApiError, isApiErrorWithStatus } from "../api/errors"
import Navbar from "../components/Navbar"
import ResourceNotFound from "../components/ResourceNotFound"
import {
  GUEST_ORDERS_UPDATED_EVENT,
  readGuestOrderAccess,
  removeGuestOrderAccess,
} from "../components/orderStatusStorage"
import { useAuth } from "../hooks"
import { checkoutService, customizationSummary } from "../services"
import type { OrderResponse } from "../types/checkout"
import { applyApiImageFallback, resolveProductImageUrl } from "../utils/imageFallback"
import { formatEuro } from "../utils/money"
import { ORDER_PROGRESS_STATUSES, orderProgressStepState } from "../utils/orderProgress"
import { productMediaUrl } from "../utils/productMedia"
import "./OrderDetails.css"
import { useTranslation } from "react-i18next"
import i18n, { resolvedLocale } from "../i18n"

const TERMINAL_STATUSES = new Set(["delivered", "cancelled"])
const progressIcons = {
  pending: WalletCards,
  confirmed: ReceiptText,
  in_preparation: ChefHat,
  ready: PackageCheck,
  delivered: Check,
} as const

function statusLabel(status: string) {
  return ({
    pending: i18n.t("order.status.pending", { ns: "storefront" }),
    confirmed: i18n.t("order.status.confirmed", { ns: "storefront" }),
    in_preparation: i18n.t("order.status.inPreparation", { ns: "storefront" }),
    ready: i18n.t("order.status.ready", { ns: "storefront" }),
    delivered: i18n.t("order.status.delivered", { ns: "storefront" }),
    cancelled: i18n.t("order.status.cancelled", { ns: "storefront" }),
  } as Record<string, string>)[status] ?? status.replace(/_/g, " ")
}

export default function OrderDetails() {
  const { t } = useTranslation("storefront")
  const { orderId: orderIdParam } = useParams()
  const orderId = Number(orderIdParam)
  const orderLookupKey = Number.isInteger(orderId) && orderId > 0 ? orderId : -1
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [order, setOrder] = useState<OrderResponse | null>(null)
  const [accessVersion, setAccessVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notFoundOrderId, setNotFoundOrderId] = useState<number | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const activeAccess = useMemo(() => {
    void accessVersion
    return readGuestOrderAccess(orderId)
  }, [accessVersion, orderId])
  const guestToken = activeAccess?.accessToken ?? null

  const loadOrder = useCallback(async () => {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      setOrder(null)
      setNotFoundOrderId(orderLookupKey)
      setError(null)
      return
    }
    if (!guestToken && authLoading) return
    if (!guestToken && !isAuthenticated) {
      setOrder(null)
      setNotFoundOrderId(orderId)
      setError(null)
      return
    }

    try {
      const loadedOrder = await checkoutService.getOrder(orderId, guestToken)
      setOrder(loadedOrder)
      setNotFoundOrderId(null)
      setError(null)
    } catch (requestError) {
      if (
        guestToken
        && requestError instanceof ApiError
        && (requestError.status === 401 || requestError.status === 404)
      ) {
        removeGuestOrderAccess(orderId)
        setAccessVersion((current) => current + 1)
      }
      setOrder(null)
      if (
        isApiErrorWithStatus(requestError, 404)
        || isApiErrorWithStatus(requestError, 401)
        || isApiErrorWithStatus(requestError, 403)
      ) {
        setNotFoundOrderId(orderId)
        setError(null)
        return
      }
      setNotFoundOrderId(null)
      setError(requestError instanceof Error ? requestError.message : t("order.loadFailed"))
    }
  }, [authLoading, guestToken, isAuthenticated, orderId, orderLookupKey, t])

  useEffect(() => {
    const refreshAccess = () => setAccessVersion((current) => current + 1)
    window.addEventListener(GUEST_ORDERS_UPDATED_EVENT, refreshAccess)
    window.addEventListener("storage", refreshAccess)
    return () => {
      window.removeEventListener(GUEST_ORDERS_UPDATED_EVENT, refreshAccess)
      window.removeEventListener("storage", refreshAccess)
    }
  }, [])

  useEffect(() => {
    if (notFoundOrderId === orderLookupKey) return
    void loadOrder()
    const intervalId = window.setInterval(() => void loadOrder(), 5000)
    return () => window.clearInterval(intervalId)
  }, [loadOrder, notFoundOrderId, orderLookupKey])

  const cancelOrder = async () => {
    if (!order?.canCancel) return
    try {
      setIsCancelling(true)
      setError(null)
      setOrder(await checkoutService.cancelOrder(order.orderId, guestToken))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("order.cancelFailed"))
    } finally {
      setIsCancelling(false)
    }
  }

  const downloadReceipt = async () => {
    if (!order) return
    try {
      setIsDownloading(true)
      setError(null)
      const { blob, filename } = await checkoutService.downloadReceipt(order.orderId, guestToken)
      const blobUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = blobUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("order.receiptFailed"))
    } finally {
      setIsDownloading(false)
    }
  }

  const dismissOrder = () => {
    navigate(isAuthenticated ? "/profile?tab=orders" : "/orders", { replace: true })
  }

  const waitingForAccess = authLoading && !guestToken
  const backToOrdersHref = isAuthenticated ? "/profile?tab=orders" : "/orders"

  if (notFoundOrderId === orderLookupKey) return <ResourceNotFound kind="order" />

  return (
    <section className="order-details-page site-page">
      <Navbar />
      <main className="order-details-shell">
        <div className="order-details-topbar">
          <Link to={backToOrdersHref} className="order-details-back"><ArrowLeft size={17} /> {t("order.back")}</Link>
          <Link to="/menu">{t("order.viewMenu")}</Link>
        </div>

        {waitingForAccess ? (
          <div className="order-details-state"><LoaderCircle className="order-details-spinner" /> {t("order.validating")}</div>
        ) : error && !order ? (
          <section className="order-details-state">
            <ReceiptText size={32} />
            <h1>{t("order.unavailable")}</h1>
            <p>{error}</p>
            {!isAuthenticated && <Link to="/login" state={{ from: `/orders/${orderId}` }}>{t("order.accountSignIn")}</Link>}
            <Link to="/menu">{t("order.backMenu")}</Link>
          </section>
        ) : order ? (
          <>
            <header className="order-details-header">
              <div>
                <p className="order-details-eyebrow"><ShoppingBag size={15} /> {t("order.current")}</p>
                <h1>{order.orderNumber}</h1>
                <span><Clock size={16} /> {new Date(order.createdAt).toLocaleString(resolvedLocale())}</span>
              </div>
              <strong
                key={order.status}
                className={`order-details-status order-details-status-change status-${order.status}`}
                aria-live="polite"
              >
                {statusLabel(order.status)}
              </strong>
            </header>

            {error && <p className="order-details-error" role="alert">{error}</p>}

            {order.status === "cancelled" ? (
              <section key={`cancelled-${order.status}`} className="order-details-cancelled order-details-status-panel-change" aria-live="polite">
                <span><X size={22} /></span>
                <div>
                  <strong>{statusLabel(order.status)}</strong>
                  <p>{t("order.tracker.cancelledMessage")}</p>
                </div>
              </section>
            ) : (
              <section
                key={`progress-${order.status}`}
                className="order-details-progress-card order-details-status-panel-change"
                aria-label={t("order.progressAria")}
              >
                <div className="order-details-section-heading">
                  <span>{t("order.progress")}</span>
                  <strong>{statusLabel(order.status)}</strong>
                </div>
                <ol className="order-details-progress">
                  {ORDER_PROGRESS_STATUSES.map((status) => {
                    const Icon = progressIcons[status]
                    const state = orderProgressStepState(order.status, status)
                    return (
                      <li key={status} className={`is-${state}`} aria-current={state === "current" ? "step" : undefined}>
                        <span className="order-details-progress-icon">
                          <Icon size={18} />
                        </span>
                        <span className="order-details-progress-label">{statusLabel(status)}</span>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )}

            <div className="order-details-grid">
              <section className="order-details-card">
                <h2>{t("order.items")}</h2>
                <div className="order-details-items">
                  {order.items.map((item, index) => {
                    const customizations = customizationSummary(item.customization)
                    const imageUrl = resolveProductImageUrl(productMediaUrl(item.media, "card"))
                    return (
                      <article key={`${item.productId}-${index}`}>
                        <div className="order-details-item-image">
                          <img
                            src={imageUrl}
                            alt={item.media?.altText || item.productName}
                            onError={(event) => applyApiImageFallback(event.currentTarget)}
                          />
                          <span>{item.quantity}×</span>
                        </div>
                        <div className="order-details-item-copy">
                          <strong>{item.productName}</strong>
                          {customizations.length > 0 && <small>{customizations.join(" · ")}</small>}
                        </div>
                        <strong className="order-details-item-price">{formatEuro(item.subtotal)}</strong>
                      </article>
                    )
                  })}
                </div>
              </section>

              <aside className="order-details-card order-details-summary">
                <h2>{t("order.summary")}</h2>
                <div><span>{t("order.subtotal")}</span><strong>{formatEuro(order.subtotal)}</strong></div>
                {order.discount > 0 && <div><span>{t("order.discount")}</span><strong>-{formatEuro(order.discount)}</strong></div>}
                <div><span>{t("order.payment")}</span><strong>{order.paymentStatus === "paid" ? t("common:status.paid") : t("order.counter")}</strong></div>
                <div className="order-details-total"><span>{t("order.total")}</span><strong>{formatEuro(order.total)}</strong></div>

                <div className="order-details-actions">
                  {order.canCancel && (
                    <button type="button" className="order-details-danger" onClick={cancelOrder} disabled={isCancelling}>
                      <X size={17} /> {isCancelling ? t("order.cancelling") : t("order.cancel")}
                    </button>
                  )}
                  {order.paymentStatus === "paid" && (
                    <button type="button" onClick={downloadReceipt} disabled={isDownloading}>
                      <Download size={17} /> {isDownloading ? t("order.preparingReceipt") : t("order.downloadReceipt")}
                    </button>
                  )}
                  {TERMINAL_STATUSES.has(order.status) && activeAccess && (
                    <button type="button" onClick={dismissOrder}>{t("order.closeTracking")}</button>
                  )}
                </div>

              </aside>
            </div>
          </>
        ) : null}
      </main>
    </section>
  )
}
