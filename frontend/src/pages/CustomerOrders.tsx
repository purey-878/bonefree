import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { CalendarDays, CreditCard, Filter, PackageCheck, ReceiptText, RefreshCw, Search, SlidersHorizontal } from "lucide-react"
import FloatingProfileIcons from "../components/FloatingProfileIcons"
import CustomSelect from "../components/ui/CustomSelect"
import { Pagination } from "../components/ui"
import { useToast } from "../components/ui/toastContext"
import { cartService, checkoutService, productService } from "../services"
import { authService } from "../services/authService"
import { resolveProductImageUrl } from "../utils/imageFallback"
import { translateUserMessage } from "../utils/messages"
import type { ItemCustomization } from "../types/cart"
import type { OrderItem, OrderResponse } from "../types/checkout"
import type { Product } from "../types/product"
import { formatEuro } from "../utils/money"
import i18n, { resolvedLocale } from "../i18n"
import { primaryProductMediaUrl, productMediaUrl } from "../utils/productMedia"
import "./Profile.css"
import "./CustomerOrders.css"

interface HistoryFilters {
  status: string
  dateFrom: string
  dateTo: string
  search: string
}


const emptyFilters: HistoryFilters = {
  status: "",
  dateFrom: "",
  dateTo: "",
  search: "",
}

const statusOptions = [
  { value: "", labelKey: "profile.status.all" },
  { value: "pending", labelKey: "profile.status.pending" },
  { value: "confirmed", labelKey: "profile.status.confirmed" },
  { value: "in_preparation", labelKey: "profile.status.inPreparation" },
  { value: "ready", labelKey: "profile.status.ready" },
  { value: "delivered", labelKey: "profile.status.delivered" },
  { value: "cancelled", labelKey: "profile.status.cancelled" },
]

const orderTerminalStatuses = new Set(["delivered", "cancelled"])

function formatDate(value: string) {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatCurrency(value: number | string) {
  return formatEuro(value)
}

function formatFulfillment(value: string) {
  if (value === "dine_in") return i18n.t("profile.fulfillment.dineIn", { ns: "account" })
  if (value === "pickup") return i18n.t("profile.fulfillment.pickup", { ns: "account" })
  if (value === "takeaway") return i18n.t("profile.fulfillment.takeaway", { ns: "account" })
  if (value === "delivery") return i18n.t("profile.fulfillment.delivery", { ns: "account" })
  return value
}

function formatPayment(value: string) {
  if (value === "counter") return i18n.t("profile.payment.counter", { ns: "account" })
  return value
}

function resolveImage(image?: string | null) {
  return resolveProductImageUrl(image, "")
}

function formatStatus(value: string) {
  const labels: Record<string, string> = {
    pending: i18n.t("profile.status.pending", { ns: "account" }),
    confirmed: i18n.t("profile.status.confirmed", { ns: "account" }),
    in_preparation: i18n.t("profile.status.inPreparation", { ns: "account" }),
    ready: i18n.t("profile.status.ready", { ns: "account" }),
    delivered: i18n.t("profile.status.delivered", { ns: "account" }),
    cancelled: i18n.t("profile.status.cancelled", { ns: "account" }),
  }

  return labels[value] ?? value
}

function hasStructuredCustomization(customization?: ItemCustomization | null) {
  return Boolean(
    customization?.removedIngredients?.length ||
    customization?.extras?.length ||
    customization?.substitutions?.length,
  )
}

function sanitizeLegacyCustomization(customization?: ItemCustomization | null): ItemCustomization | null {
  if (!customization) return null

  return {
    remove: customization.remove ?? [],
    add: customization.add ?? [],
    preferences: customization.preferences ?? [],
    note: customization.note ?? null,
    removedIngredients: [],
    extras: [],
    substitutions: [],
    finalUnitPrice: null,
  }
}

function customizedCartBody(item: OrderItem) {
  return {
    productId: item.productId,
    quantity: item.quantity,
    removedIngredients: item.customization?.removedIngredients ?? [],
    extras: item.customization?.extras ?? [],
    substitutions: item.customization?.substitutions ?? [],
    notes: item.customization?.note ?? null,
  }
}

function orderItemsCount(order: OrderResponse) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0)
}

export default function CustomerOrders() {
  const { t } = useTranslation(["account", "common"])
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const [filters, setFilters] = useState<HistoryFilters>(() => ({
    status: searchParams.get("status") ?? "",
    dateFrom: searchParams.get("date_from") ?? "", dateTo: searchParams.get("date_to") ?? "", search: searchParams.get("q") ?? "",
  }))
  const [orders, setOrders] = useState<OrderResponse[]>([])
  const [ordersPage, setOrdersPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1))
  const [ordersPerPage, setOrdersPerPage] = useState(() => [10, 20, 50, 100].includes(Number(searchParams.get("per_page"))) ? Number(searchParams.get("per_page")) : 20)
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [ordersTotalPages, setOrdersTotalPages] = useState(0)
  const lastWrittenSearchRef = useRef(searchParams.toString())
  const skipUrlWriteRef = useRef(false)
  const [productsById, setProductsById] = useState<Record<string, Product>>({})
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const activeFilterCount = Object.values(filters).filter(Boolean).length

  useEffect(() => {
    let current = true

    const loadHistory = async () => {
      try {
        setLoadingOrders(true)
        setError(null)
        const { search, ...serverFilters } = filters
        const history = await authService.getPurchaseHistory({ ...serverFilters, search, page: ordersPage, perPage: ordersPerPage })
        if (!current) return
        setOrders(history.items)
        setOrdersTotal(history.total)
        setOrdersTotalPages(history.totalPages)
        if (history.totalPages === 0 && ordersPage !== 1) setOrdersPage(1)
        else if (history.totalPages > 0 && ordersPage > history.totalPages) setOrdersPage(history.totalPages)
      } catch (err) {
        if (current) setError(translateUserMessage(err instanceof Error ? err.message : t("profile.errors.history")))
      } finally {
        if (current) setLoadingOrders(false)
      }
    }

    const timeout = window.setTimeout(() => void loadHistory(), 220)
    return () => {
      current = false
      window.clearTimeout(timeout)
    }
  }, [filters, ordersPage, ordersPerPage, t])

  const updateFilter = (field: keyof HistoryFilters, value: string) => {
    setFilters((current) => ({ ...current, [field]: value }))
    setOrdersPage(1)
  }

  useEffect(() => {
    const currentSearch = searchParams.toString()
    if (currentSearch === lastWrittenSearchRef.current) return
    lastWrittenSearchRef.current = currentSearch
    skipUrlWriteRef.current = true
    const nextOrdersPerPage = Number(searchParams.get("per_page"))
    setFilters({
      search: searchParams.get("q") ?? "",
      status: searchParams.get("status") ?? "",
      dateFrom: searchParams.get("date_from") ?? "",
      dateTo: searchParams.get("date_to") ?? "",
    })
    setOrdersPage(Math.max(1, Number(searchParams.get("page")) || 1))
    setOrdersPerPage([10, 20, 50, 100].includes(nextOrdersPerPage) ? nextOrdersPerPage : 20)
  }, [searchParams])

  useEffect(() => {
    if (skipUrlWriteRef.current) {
      skipUrlWriteRef.current = false
      return
    }
    const next = new URLSearchParams(searchParams)
    const setOrDelete = (key: string, value: string) => value ? next.set(key, value) : next.delete(key)
    setOrDelete("q", filters.search.trim())
    setOrDelete("status", filters.status)
    next.delete("payment")
    setOrDelete("date_from", filters.dateFrom)
    setOrDelete("date_to", filters.dateTo)
    if (ordersPage === 1) next.delete("page"); else next.set("page", String(ordersPage))
    if (ordersPerPage === 20) next.delete("per_page"); else next.set("per_page", String(ordersPerPage))
    if (next.toString() !== searchParams.toString()) {
      lastWrittenSearchRef.current = next.toString()
      setSearchParams(next, { replace: true })
    }
  }, [filters, ordersPage, ordersPerPage, searchParams, setSearchParams])

  const getProduct = async (productId: number) => {
    const cached = productsById[productId]
    if (cached) return cached

    const product = await productService.getById(productId)
    setProductsById((current) => ({ ...current, [product.id]: product }))
    return product
  }

  const addHistoricalItem = async (item: OrderItem) => {
    const product = await getProduct(item.productId)

    if (!product.available) {
      throw new Error(product.unavailableReason || t("profile.errors.unavailableNamed", { name: item.productName }))
    }

    if (hasStructuredCustomization(item.customization)) {
      await cartService.addCustomizedItem(customizedCartBody(item))
      return
    }

    await cartService.addItem(
      item.productId,
      item.quantity,
      sanitizeLegacyCustomization(item.customization),
    )
  }

  const handleOrderAgain = async (order: OrderResponse) => {
    const key = `order-${order.orderId}`
    let addedCount = 0
    const failures: string[] = []

    try {
      setBusyKey(key)
      setActionError(null)
      for (const item of order.items) {
        try {
          await addHistoricalItem(item)
          addedCount += item.quantity
        } catch (err) {
          failures.push(translateUserMessage(err instanceof Error ? err.message : t("errors:messages.couldNotAdd", { item: item.productName })))
        }
      }

      if (addedCount > 0) {
        const message = t("profile.messages.itemsAdded", { count: addedCount })
        toast.success(message)
      }
      if (failures.length > 0) {
        const message = failures.join(" ")
        setActionError(message)
        toast.error(message)
      }
      if (addedCount === 0 && failures.length === 0) {
        const message = t("profile.errors.addNone")
        setActionError(message)
        toast.error(message)
      }
    } finally {
      setBusyKey(null)
    }
  }

  const handleTrackOrder = (order: OrderResponse) => {
    setActionError(null)
    navigate(`/orders/${order.orderId}`)
  }

  const handleViewReceipt = async (order: OrderResponse) => {
    const key = `receipt-${order.orderId}`
    const receiptWindow = window.open("about:blank", "_blank")

    try {
      setBusyKey(key)
      setActionError(null)
      const { blob } = await checkoutService.downloadReceipt(order.orderId)
      const receiptUrl = URL.createObjectURL(blob)

      if (receiptWindow) {
        receiptWindow.location.href = receiptUrl
      } else {
        const link = document.createElement("a")
        link.href = receiptUrl
        link.target = "_blank"
        link.rel = "noopener noreferrer"
        link.click()
      }

      window.setTimeout(() => URL.revokeObjectURL(receiptUrl), 60_000)
    } catch (err) {
      receiptWindow?.close()
      const message = translateUserMessage(err instanceof Error ? err.message : t("profile.errors.receipt"))
      setActionError(message)
      toast.error(message)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <section className="profile-page customer-orders-page site-page">
      <FloatingProfileIcons />
      <main className="profile-shell">
        {(error || actionError) && <div className="profile-alert error" role="alert">{error || actionError}</div>}
        <section className="profile-panel profile-orders-section" id="orders-history">
          <div className="profile-section-heading profile-orders-heading">
            <div>
              <span>{t("profile.orders.label")}</span>
              <h1>{t("profile.orders.title")}</h1>
            </div>
            <div className="profile-orders-heading-meta">
              <span>{t("profile.orders.shown", { count: orders.length })}</span>
              {activeFilterCount > 0 && <span className="profile-filter-pill">{t("profile.orders.filters", { count: activeFilterCount })}</span>}
            </div>
          </div>

          <div className="profile-filter-toolbar">
            <label className="profile-search-control">
              <Search size={17} />
              <input
                placeholder={t("profile.orders.search")}
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
              />
            </label>
            <label>
              <SlidersHorizontal size={16} />
              <CustomSelect
                value={filters.status}
                onChange={(nextValue) => updateFilter("status", String(nextValue))}
                options={statusOptions.map((status) => ({
                  value: status.value,
                  label: t(status.labelKey),
                }))}
              />
            </label>
            <div className="orders-date-range">
              {(["dateFrom", "dateTo"] as const).map(field => (
                <label className="orders-date-control" key={field}>
                  <span>{t(field === "dateFrom" ? "profile.dateFilters.from" : "profile.dateFilters.to")}</span>
                  <div className={`orders-date-input ${filters[field] ? "has-value" : "is-empty"}`}>
                    <input
                      type="date"
                      aria-label={t(field === "dateFrom" ? "profile.dateFilters.fromLabel" : "profile.dateFilters.toLabel")}
                      value={filters[field]}
                      min={field === "dateTo" ? filters.dateFrom || undefined : undefined}
                      max={field === "dateFrom" ? filters.dateTo || undefined : undefined}
                      onChange={event => updateFilter(field, event.target.value)}
                    />
                    {!filters[field] && <span className="orders-date-placeholder" aria-hidden="true">{t("profile.dateFilters.placeholder")}</span>}
                    <CalendarDays size={15} aria-hidden="true" />
                  </div>
                </label>
              ))}
            </div>
            <button type="button" className="profile-clear-filters" onClick={() => setFilters(emptyFilters)}>
              <Filter size={16} />
              {t("profile.orders.clearFilters")}
            </button>
          </div>

          {loadingOrders ? (
            <div className="profile-loading small">{t("profile.orders.loading")}</div>
          ) : ordersTotal === 0 && activeFilterCount === 0 ? (
            <div className="profile-empty profile-empty-orders">
              <h3>{t("profile.orders.emptyTitle")}</h3>
              <p>{t("profile.orders.emptyText")}</p>
              <Link to="/menu" className="profile-order-again">{t("profile.orders.start")}</Link>
            </div>
          ) : orders.length === 0 ? (
            <div className="profile-empty profile-empty-orders">
              <h3>{t("profile.orders.noMatchTitle")}</h3>
              <p>{t("profile.orders.noMatchText")}</p>
              <button type="button" className="profile-clear-filters" onClick={() => setFilters(emptyFilters)}>{t("profile.orders.clearFilters")}</button>
            </div>
          ) : (
            <div className="profile-order-grid">
              {orders.map((order) => (
                <OrderTimelineCard
                  key={order.orderId}
                  busyKey={busyKey}
                  order={order}
                  productsById={productsById}
                  onOrderAgain={handleOrderAgain}
                  onTrackOrder={handleTrackOrder}
                  onViewReceipt={handleViewReceipt}
                />
              ))}
            </div>
          )}
          <Pagination page={ordersPage} perPage={ordersPerPage} total={ordersTotal} totalPages={ordersTotalPages} onPageChange={setOrdersPage} onPerPageChange={(value) => { setOrdersPerPage(value); setOrdersPage(1) }} />
        </section>
      </main>
    </section>
  )
}

function OrderTimelineCard({
  busyKey,
  order,
  productsById,
  onOrderAgain,
  onTrackOrder,
  onViewReceipt,
}: {
  busyKey: string | null
  order: OrderResponse
  productsById: Record<string, Product>
  onOrderAgain: (order: OrderResponse) => void
  onTrackOrder: (order: OrderResponse) => void
  onViewReceipt: (order: OrderResponse) => void
}) {
  const { t } = useTranslation("account")
  const previewItems = order.items.slice(0, 3)
  const firstItem = order.items[0]
  const previewExtraCount = Math.max(order.items.length - 1, 0)
  const previewSummary = firstItem
    ? previewExtraCount > 0
      ? t("profile.orderCard.extraItems", { count: previewExtraCount, name: firstItem.productName })
      : `${firstItem.quantity}x ${firstItem.productName}`
    : t("profile.orderCard.noItems")
  const isTerminal = orderTerminalStatuses.has(order.status)
  const canReorder = order.items.length > 0

  return (
    <article className="profile-order-card">
      <div className="profile-order-card-main">
        <div className="profile-order-title-row">
          <div>
            <span>{t("profile.orderCard.number")}</span>
            <h3>{order.orderNumber}</h3>
          </div>
          <span className={`profile-status ${order.status}`}>{formatStatus(order.status)}</span>
        </div>

        <div className="profile-order-meta">
          <span><CalendarDays size={15} /> {formatDate(order.createdAt)}</span>
          <span><PackageCheck size={15} /> {formatFulfillment(order.deliveryMethod)}</span>
          <span><CreditCard size={15} /> {formatPayment(order.paymentMethod)}</span>
        </div>

        <div className="profile-order-total-row">
          <span>{t("profile.orderCard.total")}</span>
          <strong>{formatCurrency(order.total)}</strong>
        </div>

        <div className="profile-item-preview">
          <div className="profile-thumb-stack" aria-hidden="true">
            {previewItems.map((item, index) => {
              const product = productsById[item.productId]
              return (
                <span key={`${order.orderId}-${item.productId}-${index}`}>
                  {productMediaUrl(item.media, "thumb") ?? primaryProductMediaUrl(product?.media, "thumb") ? (
                    <img
                      src={resolveImage(productMediaUrl(item.media, "thumb") ?? primaryProductMediaUrl(product?.media, "thumb"))}
                      alt=""
                    />
                  ) : item.productName.charAt(0)}
                </span>
              )
            })}
          </div>
          <div className="profile-item-preview-copy">
            <strong>{previewSummary}</strong>
            <p>{t("profile.orderCard.items", { count: orderItemsCount(order) })}</p>
          </div>
        </div>
      </div>

      <div className="profile-order-actions">
        {order.paymentStatus === "paid" && (
          <button
            type="button"
            className="profile-soft-action"
            onClick={() => onViewReceipt(order)}
            disabled={busyKey === `receipt-${order.orderId}`}
          >
            <ReceiptText size={16} />
            {busyKey === `receipt-${order.orderId}` ? t("profile.orderCard.opening") : t("profile.orderCard.receipt")}
          </button>
        )}
        <button
          type="button"
          className="profile-soft-action"
          onClick={() => onTrackOrder(order)}
        >
          <PackageCheck size={16} />
          {t(isTerminal ? "profile.orderCard.details" : "profile.orderCard.track")}
        </button>
        {canReorder && (
          <button
            type="button"
            className="profile-order-again p-1 fw-semibold"
            onClick={() => onOrderAgain(order)}
            disabled={busyKey === `order-${order.orderId}`}
          >
            <RefreshCw size={14} />
            {busyKey === `order-${order.orderId}` ? t("profile.orderCard.adding") : t("profile.orderCard.repeat")}
          </button>
        )}
      </div>
    </article>
  )
}
