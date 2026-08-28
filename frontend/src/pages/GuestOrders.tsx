import { useCallback, useEffect, useState } from "react"
import { Download, LoaderCircle, LogIn, PackageCheck, ReceiptText, UserPlus, X } from "lucide-react"
import { Link, Navigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { ApiError } from "../api/errors"
import Navbar from "../components/Navbar"
import {
  GUEST_ORDERS_UPDATED_EVENT,
  readGuestOrderAccesses,
  removeGuestOrderAccesses,
} from "../components/orderStatusStorage"
import { useAuth } from "../hooks"
import { resolvedLocale } from "../i18n"
import { checkoutService, customizationSummary } from "../services"
import type { OrderResponse } from "../types/checkout"
import { formatEuro } from "../utils/money"
import "./GuestOrders.css"

interface GuestOrderRecord {
  order: OrderResponse
  accessToken: string
}

function orderTimestamp(order: OrderResponse) {
  const timestamp = new Date(order.createdAt).getTime()
  return Number.isNaN(timestamp) ? order.orderId : timestamp
}

export default function GuestOrders() {
  const { t } = useTranslation("storefront")
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [records, setRecords] = useState<GuestOrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    if (authLoading || isAuthenticated) return
    const accesses = readGuestOrderAccesses()
    if (accesses.length === 0) {
      setRecords([])
      setLoading(false)
      return
    }

    const results = await Promise.allSettled(
      accesses.map(async (access) => ({
        order: await checkoutService.getOrder(access.orderId, access.accessToken),
        accessToken: access.accessToken,
      })),
    )
    const invalidOrderIds: number[] = []
    const loaded: GuestOrderRecord[] = []
    let temporaryFailure = false

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        loaded.push(result.value)
      } else if (result.reason instanceof ApiError && (result.reason.status === 401 || result.reason.status === 404)) {
        invalidOrderIds.push(accesses[index].orderId)
      } else {
        temporaryFailure = true
      }
    })

    if (invalidOrderIds.length > 0) removeGuestOrderAccesses(invalidOrderIds)
    loaded.sort((first, second) => orderTimestamp(second.order) - orderTimestamp(first.order))
    setRecords(loaded)
    setError(temporaryFailure ? t("guestOrders.partialLoad") : null)
    setLoading(false)
  }, [authLoading, isAuthenticated, t])

  useEffect(() => {
    void loadOrders()
    const intervalId = window.setInterval(() => void loadOrders(), 5000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadOrders()
    }
    window.addEventListener(GUEST_ORDERS_UPDATED_EVENT, loadOrders)
    window.addEventListener("storage", loadOrders)
    window.addEventListener("focus", loadOrders)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener(GUEST_ORDERS_UPDATED_EVENT, loadOrders)
      window.removeEventListener("storage", loadOrders)
      window.removeEventListener("focus", loadOrders)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [loadOrders])

  const cancelOrder = async (record: GuestOrderRecord) => {
    try {
      setBusyKey(`cancel-${record.order.orderId}`)
      setError(null)
      await checkoutService.cancelOrder(record.order.orderId, record.accessToken)
      await loadOrders()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("order.cancelFailed"))
    } finally {
      setBusyKey(null)
    }
  }

  const downloadReceipt = async (record: GuestOrderRecord) => {
    try {
      setBusyKey(`receipt-${record.order.orderId}`)
      setError(null)
      const { blob, filename } = await checkoutService.downloadReceipt(record.order.orderId, record.accessToken)
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
      setBusyKey(null)
    }
  }

  if (authLoading) return null
  if (isAuthenticated) return <Navigate to="/profile?tab=orders" replace />

  return (
    <section className="guest-orders-page site-page">
      <Navbar />
      <main className="guest-orders-shell">
        <header className="guest-orders-heading">
          <div>
            <span>{t("guestOrders.eyebrow")}</span>
            <h1>{t("guestOrders.title")}</h1>
            <p>{t("guestOrders.description")}</p>
          </div>
          {records.length > 0 && <strong>{t("guestOrders.savedCount", { count: records.length })}</strong>}
        </header>

        <aside className="guest-orders-account-callout">
          <div className="guest-orders-callout-icon"><ReceiptText size={21} aria-hidden="true" /></div>
          <div>
            <strong>{t("guestOrders.accountTitle")}</strong>
            <p>{t("guestOrders.accountMessage")}</p>
          </div>
          <div className="guest-orders-account-actions">
            <Link to="/login" state={{ from: "/orders" }}><LogIn size={16} /> {t("guestOrders.signIn")}</Link>
            <Link to="/register" state={{ from: "/orders" }}><UserPlus size={16} /> {t("guestOrders.createAccount")}</Link>
          </div>
        </aside>

        {error && <p className="guest-orders-error" role="alert">{error}</p>}

        {loading ? (
          <div className="guest-orders-state"><LoaderCircle className="guest-orders-spinner" /> {t("guestOrders.loading")}</div>
        ) : records.length === 0 ? (
          <div className="guest-orders-state guest-orders-empty">
            <PackageCheck size={34} />
            <h2>{t("guestOrders.emptyTitle")}</h2>
            <p>{t("guestOrders.emptyMessage")}</p>
            <Link to="/menu">{t("guestOrders.viewMenu")}</Link>
          </div>
        ) : (
          <div className="guest-orders-grid">
            {records.map((record) => {
              const { order } = record
              return (
                <article className="guest-order-card" key={order.orderId}>
                  <header>
                    <div>
                      <span>{t("guestOrders.order")}</span>
                      <h2>{order.orderNumber}</h2>
                      <small>{new Date(order.createdAt).toLocaleString(resolvedLocale())}</small>
                    </div>
                    <strong className={`guest-order-status status-${order.status}`}>
                      {t(`order.status.${order.status === "in_preparation" ? "inPreparation" : order.status}`)}
                    </strong>
                  </header>

                  <div className="guest-order-items">
                    {order.items.map((item, index) => {
                      const customizations = customizationSummary(item.customization)
                      return (
                        <div key={`${item.productId}-${index}`}>
                          <div>
                            <strong>{item.quantity} × {item.productName}</strong>
                            {customizations.length > 0 && <small>{customizations.join(" | ")}</small>}
                          </div>
                          <span>{formatEuro(item.subtotal)}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="guest-order-total">
                    <span>{t("order.total")}</span>
                    <strong>{formatEuro(order.total)}</strong>
                  </div>

                  <footer>
                    <Link to={`/orders/${order.orderId}`}><ReceiptText size={16} /> {t("guestOrders.details")}</Link>
                    {order.paymentStatus === "paid" && (
                      <button
                        type="button"
                        onClick={() => void downloadReceipt(record)}
                        disabled={busyKey === `receipt-${order.orderId}`}
                      >
                        <Download size={16} />
                        {busyKey === `receipt-${order.orderId}` ? t("order.preparingReceipt") : t("order.downloadReceipt")}
                      </button>
                    )}
                    {order.canCancel && (
                      <button
                        type="button"
                        className="guest-order-cancel"
                        onClick={() => void cancelOrder(record)}
                        disabled={busyKey === `cancel-${order.orderId}`}
                      >
                        <X size={16} />
                        {busyKey === `cancel-${order.orderId}` ? t("order.cancelling") : t("order.cancel")}
                      </button>
                    )}
                  </footer>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </section>
  )
}
