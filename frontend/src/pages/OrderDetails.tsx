import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Clock, Download, LoaderCircle, ReceiptText, X } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { ApiError, isApiErrorWithStatus } from "../api/errors"
import Navbar from "../components/Navbar"
import ResourceNotFound from "../components/ResourceNotFound"
import {
  clearActiveOrder,
  readActiveOrder,
} from "../components/orderStatusStorage"
import { useAuth } from "../hooks"
import { checkoutService, customizationSummary } from "../services"
import type { OrderResponse } from "../types/checkout"
import { formatEuro } from "../utils/money"
import "./OrderDetails.css"

const TERMINAL_STATUSES = new Set(["delivered", "cancelled"])

function statusLabel(status: string) {
  return ({
    pending: "A aguardar pagamento",
    confirmed: "Recebido",
    in_preparation: "Em preparação",
    ready: "Pronto",
    delivered: "Entregue",
    cancelled: "Cancelado",
  } as Record<string, string>)[status] ?? status.replace(/_/g, " ")
}

export default function OrderDetails() {
  const { orderId: orderIdParam } = useParams()
  const orderId = Number(orderIdParam)
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
    const active = readActiveOrder()
    return active?.orderId === orderId ? active : null
  }, [accessVersion, orderId])
  const guestToken = activeAccess?.accessToken ?? null

  const loadOrder = useCallback(async () => {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      setNotFoundOrderId(null)
      setError("Pedido inválido.")
      return
    }
    if (!guestToken && authLoading) return
    if (!guestToken && !isAuthenticated) {
      setOrder(null)
      setNotFoundOrderId(null)
      setError("Este pedido só está disponível com a sessão do cliente ou com o acesso guest guardado neste navegador.")
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
        clearActiveOrder(false)
        setAccessVersion((current) => current + 1)
      }
      setOrder(null)
      if (isApiErrorWithStatus(requestError, 404)) {
        setNotFoundOrderId(orderId)
        setError(null)
        return
      }
      setNotFoundOrderId(null)
      setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar este pedido.")
    }
  }, [authLoading, guestToken, isAuthenticated, orderId])

  useEffect(() => {
    const refreshAccess = () => setAccessVersion((current) => current + 1)
    window.addEventListener("active-order-updated", refreshAccess)
    return () => window.removeEventListener("active-order-updated", refreshAccess)
  }, [])

  useEffect(() => {
    if (notFoundOrderId === orderId) return
    void loadOrder()
    const intervalId = window.setInterval(() => void loadOrder(), 5000)
    return () => window.clearInterval(intervalId)
  }, [loadOrder, notFoundOrderId, orderId])

  const cancelOrder = async () => {
    if (!order?.canCancel) return
    try {
      setIsCancelling(true)
      setError(null)
      setOrder(await checkoutService.cancelOrder(order.orderId, guestToken))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível cancelar este pedido.")
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
      setError(requestError instanceof Error ? requestError.message : "Não foi possível baixar o recibo.")
    } finally {
      setIsDownloading(false)
    }
  }

  const dismissOrder = () => {
    if (activeAccess) clearActiveOrder(false)
    navigate(isAuthenticated ? "/profile?tab=orders" : "/menu", { replace: true })
  }

  const waitingForAccess = authLoading && !guestToken

  if (notFoundOrderId === orderId) return <ResourceNotFound kind="order" />

  return (
    <section className="order-details-page site-page">
      <Navbar />
      <main className="order-details-shell">
        <div className="order-details-topbar">
          <Link to="/orders" className="order-details-back"><ArrowLeft size={17} /> Voltar</Link>
          <Link to="/menu">Ver menu</Link>
        </div>

        {waitingForAccess ? (
          <div className="order-details-state"><LoaderCircle className="order-details-spinner" /> A validar a sessão...</div>
        ) : error && !order ? (
          <section className="order-details-state">
            <ReceiptText size={32} />
            <h1>Pedido indisponível</h1>
            <p>{error}</p>
            {!isAuthenticated && <Link to="/login" state={{ from: `/orders/${orderId}` }}>Entrar na conta</Link>}
            <Link to="/menu">Voltar ao menu</Link>
          </section>
        ) : order ? (
          <>
            <header className="order-details-header">
              <div>
                <p>Pedido atual</p>
                <h1>{order.orderNumber}</h1>
                <span><Clock size={16} /> {new Date(order.createdAt).toLocaleString("pt-PT")}</span>
              </div>
              <strong className={`order-details-status status-${order.status}`}>{statusLabel(order.status)}</strong>
            </header>

            {error && <p className="order-details-error" role="alert">{error}</p>}

            <div className="order-details-grid">
              <section className="order-details-card">
                <h2>Itens</h2>
                <div className="order-details-items">
                  {order.items.map((item, index) => {
                    const customizations = customizationSummary(item.customization)
                    return (
                      <article key={`${item.productId}-${index}`}>
                        <div>
                          <strong>{item.quantity} × {item.productName}</strong>
                          {customizations.length > 0 && <small>{customizations.join(" | ")}</small>}
                        </div>
                        <span>{formatEuro(item.subtotal)}</span>
                      </article>
                    )
                  })}
                </div>
              </section>

              <aside className="order-details-card order-details-summary">
                <h2>Resumo</h2>
                <div><span>Subtotal</span><strong>{formatEuro(order.subtotal)}</strong></div>
                {order.discount > 0 && <div><span>Desconto</span><strong>-{formatEuro(order.discount)}</strong></div>}
                <div><span>Pagamento</span><strong>{order.paymentStatus === "paid" ? "Pago" : "Ao balcão"}</strong></div>
                <div className="order-details-total"><span>Total</span><strong>{formatEuro(order.total)}</strong></div>

                <div className="order-details-actions">
                  {order.canCancel && (
                    <button type="button" className="order-details-danger" onClick={cancelOrder} disabled={isCancelling}>
                      <X size={17} /> {isCancelling ? "A cancelar..." : "Cancelar pedido"}
                    </button>
                  )}
                  {order.paymentStatus === "paid" && (
                    <button type="button" onClick={downloadReceipt} disabled={isDownloading}>
                      <Download size={17} /> {isDownloading ? "A preparar..." : "Baixar recibo"}
                    </button>
                  )}
                  {TERMINAL_STATUSES.has(order.status) && activeAccess && (
                    <button type="button" onClick={dismissOrder}>Fechar acompanhamento</button>
                  )}
                </div>

                {guestToken && (
                  <p className="order-details-guest-note">
                    Este acesso guest fica apenas neste navegador e expira em 24 horas. O pedido não será associado automaticamente a uma conta.
                  </p>
                )}
              </aside>
            </div>
          </>
        ) : null}
      </main>
    </section>
  )
}
