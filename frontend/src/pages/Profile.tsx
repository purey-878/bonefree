import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { createPortal } from "react-dom"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import {
  CalendarDays,
  ChevronRight,
  CreditCard,
  Filter,
  Mail,
  PackageCheck,
  Pencil,
  Phone,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserRound,
  WalletCards,
  X,
} from "lucide-react"

import FloatingProfileIcons from "../components/FloatingProfileIcons"
import Navbar from "../components/Navbar"
import { rememberActiveOrder } from "../components/orderStatusStorage"
import CustomSelect from "../components/ui/CustomSelect"
import { useToast } from "../components/ui/toastContext"
import { useAuth } from "../hooks"
import { cartService, checkoutService, customizationSummary, productService } from "../services"
import { applyApiImageFallback, resolveProductImageUrl } from "../utils/imageFallback"
import { translateUserMessage } from "../utils/messages"
import { authService } from "../services/authService"
import { getPublicLoyaltyCouponSettings } from "../services/siteSettingsService"
import type { ItemCustomization } from "../types/cart"
import type { Coupon, OrderItem, OrderResponse } from "../types/checkout"
import type { Product } from "../types/product"
import type { LoyaltyCouponSettings } from "../types/siteSettings"
import type { ProfileUpdateRequest } from "../types/user"
import {
  defaultLoyaltyCouponSettings,
  loyaltyCouponDetail,
} from "../utils/loyaltyCoupon"
import {
  normalizePhone,
  validateEmail,
  validateName,
  validateNif,
  validatePhone,
  validatePostalCode,
} from "../utils/validation"
import type { FieldErrors } from "../utils/validation"
import { formatEuro } from "../utils/money"
import "./Profile.css"

interface ProfileForm {
  name: string
  lastName: string
  email: string
  phone: string
  taxId: string
  address: string
  postalCode: string
  city: string
}

interface HistoryFilters {
  status: string
  payment: string
  dateFrom: string
  dateTo: string
  search: string
}

type ProfileTab = "overview" | "orders" | "coupons" | "personal"

const emptyFilters: HistoryFilters = {
  status: "",
  payment: "",
  dateFrom: "",
  dateTo: "",
  search: "",
}

const statusOptions = [
  { value: "", label: "Todos os estados" },
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Confirmada" },
  { value: "in_preparation", label: "Em preparação" },
  { value: "ready", label: "Pronta" },
  { value: "delivered", label: "Servido" },
  { value: "cancelled", label: "Cancelada" },
]

const tabs: Array<{ id: ProfileTab; label: string; icon: typeof ReceiptText }> = [
  { id: "overview", label: "Visão geral", icon: Sparkles },
  { id: "orders", label: "Pedidos", icon: ReceiptText },
  { id: "coupons", label: "Cupões", icon: WalletCards },
  { id: "personal", label: "Dados pessoais", icon: UserRound },
]

const orderTerminalStatuses = new Set(["delivered", "cancelled"])

function profileTabFromParam(value: string | null): ProfileTab | null {
  if (value === "overview" || value === "orders" || value === "coupons" || value === "personal") return value
  return null
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatCurrency(value: number | string) {
  return formatEuro(value)
}

function formatFulfillment(value: string) {
  if (value === "dine_in") return "Comer no restaurante"
  if (value === "pickup") return "Recolha"
  if (value === "takeaway") return "Para levar"
  if (value === "delivery") return "Entrega"
  return value
}

function formatPayment(value: string) {
  if (value === "counter") return "Pagar ao balcão"
  return value
}

function resolveImage(image?: string | null) {
  return resolveProductImageUrl(image, "")
}

function formatStatus(value: string) {
  const labels: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmada",
    in_preparation: "Em preparação",
    ready: "Pronta",
    delivered: "Servido",
    cancelled: "Cancelada",
  }

  return labels[value] ?? value
}

function initials(firstName?: string | null, lastName?: string | null, email?: string) {
  const first = firstName?.trim().charAt(0) ?? ""
  const last = lastName?.trim().charAt(0) ?? ""
  const fallback = email?.trim().charAt(0) ?? "P"
  return `${first}${last}`.trim().toUpperCase() || fallback.toUpperCase()
}

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

function hasInvoiceAddressData(form: ProfileForm) {
  return Boolean(
    form.address.trim() ||
    form.postalCode.trim() ||
    form.city.trim(),
  )
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

function customerTier(orderCount: number, totalSpent: number) {
  if (orderCount >= 20 || totalSpent >= 600) return "Diamante"
  if (orderCount >= 10 || totalSpent >= 300) return "Ouro"
  if (orderCount >= 4 || totalSpent >= 120) return "Habitual"
  return "Novo cliente"
}

function orderItemsCount(order: OrderResponse) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0)
}

function orderMatchesSearch(order: OrderResponse, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  const queryParts = normalizedQuery.split(/\s+/).filter(Boolean)
  const orderNumberDigits = order.orderNumber.replace(/\D/g, "")
  const orderNumberWithoutLeadingZeros = orderNumberDigits.replace(/^0+/, "") || orderNumberDigits
  const isNumericOrderSearch = /^\d+$/.test(normalizedQuery)

  if (isNumericOrderSearch) {
    return String(order.orderId) === normalizedQuery || orderNumberWithoutLeadingZeros === normalizedQuery
  }

  const haystack = [
    order.orderId,
    order.orderNumber,
    `#${order.orderId}`,
    orderNumberDigits,
    orderNumberWithoutLeadingZeros,
    order.status,
    formatStatus(order.status),
    order.paymentMethod,
    formatPayment(order.paymentMethod),
    order.paymentStatus,
    order.deliveryMethod,
    formatFulfillment(order.deliveryMethod),
    order.createdAt,
    formatDate(order.createdAt),
    order.items.map((item) => [
      item.productId,
      item.productDisplayId,
      item.productName,
    ].join(" ")).join(" "),
  ].join(" ").toLowerCase()

  return queryParts.every((part) => haystack.includes(part))
}

function numericSetting(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function loyaltyProfileHeadline(settings: LoyaltyCouponSettings) {
  const orderCount = Math.max(1, Math.round(numericSetting(settings.qualifyingOrderCount, 3)))
  const orderLabel = orderCount === 1 ? "pedido" : "pedidos"
  return `Faça ${orderCount} ${orderLabel} acima de ${formatCurrency(settings.qualifyingOrderMinimum)} e ganhe um cupão no próximo pedido.`
}

function Profile() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, isAuthenticated, loading: authLoading, refreshUser } = useAuth()
  const toast = useToast()
  const tabFromUrl = profileTabFromParam(searchParams.get("tab") ?? searchParams.get("section")) ?? "overview"
  const [activeTab, setActiveTab] = useState<ProfileTab>(tabFromUrl)
  const [form, setForm] = useState<ProfileForm>({
    name: "",
    lastName: "",
    email: "",
    phone: "",
    taxId: "",
    address: "",
    postalCode: "",
    city: "",
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof ProfileForm>>({})
  const [filters, setFilters] = useState<HistoryFilters>(emptyFilters)
  const [orders, setOrders] = useState<OrderResponse[]>([])
  const [allOrders, setAllOrders] = useState<OrderResponse[]>([])
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([])
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltyCouponSettings>(defaultLoyaltyCouponSettings)
  const [loadingCoupons, setLoadingCoupons] = useState(true)
  const [productsById, setProductsById] = useState<Record<string, Product>>({})
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login")
    }
  }, [authLoading, isAuthenticated, navigate])

  useEffect(() => {
    setActiveTab(tabFromUrl)
  }, [tabFromUrl])

  useEffect(() => {
    if (!user) return
    setForm({
      name: user.name ?? "",
      lastName: user.lastName ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      taxId: user.taxId ?? "",
      address: user.billingAddress?.address ?? "",
      postalCode: user.billingAddress?.postalCode ?? "",
      city: user.billingAddress?.city ?? "",
    })
  }, [user])

  useEffect(() => {
    if (!isAuthenticated) return

    const loadProfileData = async () => {
      try {
        setError(null)
        setLoadingCoupons(true)
        const [history, products, coupons, couponSettings] = await Promise.all([
          authService.getPurchaseHistory({}),
          productService.getAll().catch(() => [] as Product[]),
          checkoutService.getCoupons().catch(() => [] as Coupon[]),
          getPublicLoyaltyCouponSettings().catch(() => defaultLoyaltyCouponSettings),
        ])
        setAllOrders(history)
        setProductsById(Object.fromEntries(products.map((product) => [product.id, product])))
        setAvailableCoupons(coupons)
        setLoyaltySettings(couponSettings)
      } catch (err) {
        setError(translateUserMessage(err instanceof Error ? err.message : "Não foi possível carregar os dados do perfil."))
      } finally {
        setLoadingCoupons(false)
      }
    }

    void loadProfileData()
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return

    const loadHistory = async () => {
      try {
        setLoadingOrders(true)
        setError(null)
        const { search, ...serverFilters } = filters
        const history = await authService.getPurchaseHistory(serverFilters)
        setOrders(history.filter((order) => orderMatchesSearch(order, search)))
      } catch (err) {
        setError(translateUserMessage(err instanceof Error ? err.message : "Não foi possível carregar o histórico de compras."))
      } finally {
        setLoadingOrders(false)
      }
    }

    const timeout = window.setTimeout(() => void loadHistory(), 220)
    return () => window.clearTimeout(timeout)
  }, [filters, isAuthenticated])

  const totalSpent = useMemo(
    () => allOrders.reduce((sum, order) => sum + Number(order.total), 0),
    [allOrders],
  )

  const totalItems = useMemo(
    () => allOrders.reduce((sum, order) => sum + orderItemsCount(order), 0),
    [allOrders],
  )

  const favoriteMeals = useMemo(() => {
    const items = new Map<number, { id: number; name: string; quantity: number; total: number; item: OrderItem }>()
    allOrders.forEach((order) => {
      order.items.forEach((item) => {
        const current = items.get(item.productId) ?? {
          id: item.productId,
          name: item.productName,
          quantity: 0,
          total: 0,
          item,
        }
        current.quantity += item.quantity
        current.total += Number(item.subtotal)
        current.item = item
        items.set(item.productId, current)
      })
    })

    return Array.from(items.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 6)
  }, [allOrders])

  const favoriteItem = favoriteMeals[0]?.name ?? "Discovering"
  const latestOrder = allOrders[0]
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const displayName = `${form.name} ${form.lastName}`.trim() || user?.email || "Cliente BONEFREE"
  const tier = customerTier(allOrders.length, totalSpent)
  const couponStreak = useMemo(() => {
    const requiredOrders = Math.max(1, Math.round(numericSetting(loyaltySettings.qualifyingOrderCount, 3)))
    const minimumSubtotal = Math.max(0, numericSetting(loyaltySettings.qualifyingOrderMinimum, 50))
    const progress = allOrders
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .reduce((current, order) => {
        if (Number(order.subtotal) < minimumSubtotal) return current
        const next = current + 1
        return next >= requiredOrders ? next - requiredOrders : next
      }, 0)

    return {
      current: progress,
      required: requiredOrders,
      remaining: requiredOrders - progress,
      percent: Math.min(100, Math.max(0, (progress / requiredOrders) * 100)),
      minimumSubtotal,
    }
  }, [allOrders, loyaltySettings])
  const showCouponProgress = couponStreak.current > 0 && couponStreak.current < couponStreak.required

  const updateForm = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: field === "phone" ? normalizePhone(value) : value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setMessage(null)
    setError(null)
  }

  const updateFilter = (field: keyof HistoryFilters, value: string) => {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  const selectProfileTab = (tab: ProfileTab) => {
    setActiveTab(tab)
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams)
      nextParams.delete("section")
      if (tab === "overview") {
        nextParams.delete("tab")
      } else {
        nextParams.set("tab", tab)
      }
      return nextParams
    }, { replace: true })
  }

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
      throw new Error(product.unavailableReason || `${item.productName} está atualmente indisponível.`)
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

  const handleAddItem = async (item: OrderItem, key: string) => {
    try {
      setBusyKey(key)
      setActionError(null)
      setSuccessMessage(null)
      await addHistoricalItem(item)
      setSuccessMessage(`${item.quantity}x ${item.productName} adicionado ao carrinho.`)
      toast.success("Item adicionado ao carrinho.")
    } catch (err) {
      const message = translateUserMessage(err instanceof Error ? err.message : "Unable to add this item.")
      setActionError(message)
      toast.error(message)
    } finally {
      setBusyKey(null)
    }
  }

  const handleOrderAgain = async (order: OrderResponse) => {
    const key = `order-${order.orderId}`
    let addedCount = 0
    const failures: string[] = []

    try {
      setBusyKey(key)
      setActionError(null)
      setSuccessMessage(null)

      for (const item of order.items) {
        try {
          await addHistoricalItem(item)
          addedCount += item.quantity
        } catch (err) {
          failures.push(translateUserMessage(err instanceof Error ? err.message : `Não foi possível adicionar ${item.productName}.`))
        }
      }

      if (addedCount > 0) {
        const message = `${addedCount} ${addedCount === 1 ? "item adicionado" : "itens adicionados"} ao carrinho.`
        setSuccessMessage(message)
        toast.success(message)
      }
      if (failures.length > 0) {
        const message = failures.join(" ")
        setActionError(message)
        toast.error(message)
      }
      if (addedCount === 0 && failures.length === 0) {
        const message = "Não foi possível adicionar itens deste pedido."
        setActionError(message)
        toast.error(message)
      }
    } finally {
      setBusyKey(null)
    }
  }

  const handleTrackOrder = (order: OrderResponse) => {
    rememberActiveOrder(order.orderId)
    window.dispatchEvent(new Event("order-status-highlight"))
    setActionError(null)
    setSuccessMessage(`A acompanhar ${order.orderNumber}.`)
  }

  const handleViewReceipt = async (order: OrderResponse) => {
    const key = `receipt-${order.orderId}`
    const receiptWindow = window.open("about:blank", "_blank")

    try {
      setBusyKey(key)
      setActionError(null)
      setSuccessMessage(null)

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
      const message = translateUserMessage(err instanceof Error ? err.message : "Não foi possível abrir este recibo.")
      setActionError(message)
      toast.error(message)
    } finally {
      setBusyKey(null)
    }
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const errors: FieldErrors<keyof ProfileForm> = {}
      const nomeError = validateName(form.name)
      const apelidoError = validateName(form.lastName)
      const emailError = validateEmail(form.email)
      const phoneError = validatePhone(form.phone, false)
      const nifError = validateNif(form.taxId)
      const postalCodeError = validatePostalCode(form.postalCode, false)
      if (nomeError) errors.name = nomeError
      if (apelidoError) errors.lastName = apelidoError
      if (emailError) errors.email = emailError
      if (phoneError) errors.phone = phoneError
      if (nifError) errors.taxId = nifError
      if (postalCodeError) errors.postalCode = postalCodeError
      setFieldErrors(errors)
      if (Object.keys(errors).length > 0) {
        setError("Please fix the highlighted fields.")
        toast.warning("Corrija os campos assinalados.")
        return
      }

      setSaving(true)
      setError(null)
      setMessage(null)

      const payload: ProfileUpdateRequest = {
        name: nullableText(form.name),
        lastName: nullableText(form.lastName),
        email: form.email.trim(),
        phone: nullableText(form.phone),
        taxId: nullableText(form.taxId),
        billingAddress: hasInvoiceAddressData(form)
          ? {
              address: nullableText(form.address),
              postalCode: nullableText(form.postalCode),
              city: nullableText(form.city),
            }
          : null,
      }

      await authService.updateProfile(payload)
      await refreshUser()
        setMessage("Perfil atualizado.")
        toast.success("Perfil guardado com sucesso.")
    } catch (err) {
      const message = translateUserMessage(err instanceof Error ? err.message : "Não foi possível guardar as alterações.")
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const jumpToOrders = () => {
    selectProfileTab("orders")
    window.requestAnimationFrame(() => {
      document.querySelector(".profile-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const jumpToPersonal = () => {
    selectProfileTab("personal")
    window.requestAnimationFrame(() => {
      document.querySelector(".profile-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  if (authLoading || !isAuthenticated) {
    return (
      <section className="profile-page site-page">
        <FloatingProfileIcons />
        <Navbar />
        <main className="profile-shell">
          <div className="profile-loading">A carregar perfil...</div>
        </main>
      </section>
    )
  }

  return (
    <section className="profile-page site-page">
      <FloatingProfileIcons />
      <Navbar />
      <main className="profile-shell">
        <section className="profile-hero-panel">
          <div className="profile-identity">
            <div className="profile-avatar" aria-hidden="true">
              {initials(form.name, form.lastName, user?.email)}
            </div>
            <div className="profile-identity-copy">
              <div className="profile-kicker-row">
                <span className="profile-tier-badge"><Sparkles size={14} /> {tier}</span>
                <span className="profile-muted-chip">Perfil de cliente</span>
              </div>
              <h1>{displayName}</h1>
              <p><Mail size={15} /> {form.email}</p>
            </div>
          </div>

          <div className="profile-hero-actions">
            <button type="button" className="profile-primary-cta" onClick={jumpToOrders}>
              <RefreshCw size={18} />
              Pedir novamente
            </button>
            <button type="button" className="profile-secondary-cta" onClick={jumpToPersonal}>
              <Pencil size={17} />
              Editar perfil
            </button>
          </div>

          <div className="profile-stat-strip">
            <div>
              <span>Pedidos</span>
              <strong>{allOrders.length}</strong>
            </div>
            <div>
              <span>Total gasto</span>
              <strong>{formatCurrency(totalSpent)}</strong>
            </div>
            <div>
              <span>Item favorito</span>
              <strong>{favoriteItem}</strong>
            </div>
          </div>

          {showCouponProgress && (
            <div className="profile-coupon-progress-card">
              <div className="profile-coupon-progress-copy">
                <span><Sparkles size={15} /> Série para cupão</span>
                <strong>{couponStreak.current} / {couponStreak.required} pedidos elegíveis</strong>
                <p>
                  Faltam {couponStreak.remaining} pedido{couponStreak.remaining === 1 ? "" : "s"} acima de{" "}
                  {formatCurrency(couponStreak.minimumSubtotal)} para desbloquear um cupão.
                </p>
              </div>
              <div className="profile-coupon-progress-track" aria-label={`Série para cupão ${couponStreak.current} de ${couponStreak.required}`}>
                <span style={{ width: `${couponStreak.percent}%` }} />
              </div>
            </div>
          )}
        </section>

        {(message || error || successMessage || actionError) && (
          <div className={`profile-alert ${error || actionError ? "error" : ""}`}>
            <span>{error || actionError || successMessage || message}</span>

          </div>
        )}

        <nav className="profile-tabs" aria-label="Secções do perfil">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "active" : ""}
                onClick={() => selectProfileTab(tab.id)}
              >
                <Icon size={17} />
                {tab.label}
              </button>
            )
          })}
        </nav>

        {activeTab === "overview" && (
          <div className="profile-overview-grid">
            <section className="profile-panel profile-overview-main">
              <div className="profile-section-heading">
                <div>
                  <span>Snapshot</span>
                  <h2>Visão geral da conta</h2>
                </div>
                <button type="button" className="profile-text-button" onClick={() => selectProfileTab("orders")}>
                  Ver pedidos <ChevronRight size={16} />
                </button>
              </div>

              <div className="profile-metric-grid">
                <div className="profile-metric-card">
                  <ShoppingBag size={18} />
                  <span>Items ordered</span>
                  <strong>{totalItems}</strong>
                </div>
                <div className="profile-metric-card">
                  <WalletCards size={18} />
                  <span>Average order</span>
                  <strong>{formatCurrency(allOrders.length ? totalSpent / allOrders.length : 0)}</strong>
                </div>
                <div className="profile-metric-card">
                  <Star size={18} />
                  <span>Favorito</span>
                  <strong>{favoriteItem}</strong>
                </div>
              </div>

              {latestOrder ? (
                <article className="profile-feature-order">
                  <div>
                    <span className={`profile-status ${latestOrder.status}`}>{formatStatus(latestOrder.status)}</span>
                    <h3>{latestOrder.orderNumber}</h3>
                    <p>{formatDate(latestOrder.createdAt)} · {orderItemsCount(latestOrder)} itens · {formatPayment(latestOrder.paymentMethod)}</p>
                  </div>
                  <div className="profile-feature-actions">
                    <strong>{formatCurrency(latestOrder.total)}</strong>
                    <button
                      type="button"
                      className="profile-order-again"
                      onClick={() => handleOrderAgain(latestOrder)}
                      disabled={busyKey === `order-${latestOrder.orderId}`}
                    >
                      {busyKey === `order-${latestOrder.orderId}` ? "A adicionar..." : "Pedir novamente"}
                    </button>
                  </div>
                </article>
              ) : (
                <div className="profile-empty">O seu primeiro pedido concluído aparecerá aqui.</div>
              )}
            </section>

            <aside className="profile-side-column">
              <section className="profile-panel">
                <div className="profile-section-heading compact">
                  <div>
                    <span>Fast reorder</span>
                    <h2>Refeições favoritas</h2>
                  </div>
                </div>
                <div className="profile-favorite-list">
                  {favoriteMeals.slice(0, 3).map((meal) => (
                    <button
                      type="button"
                      key={meal.id}
                      className="profile-favorite-row"
                      onClick={() => handleAddItem(meal.item, `favorite-${meal.id}`)}
                      disabled={busyKey === `favorite-${meal.id}`}
                    >
                      <span>{meal.name}</span>
                      <strong>{busyKey === `favorite-${meal.id}` ? "A adicionar..." : `Repetir · ${meal.quantity}x`}</strong>
                    </button>
                  ))}
                  {favoriteMeals.length === 0 && <div className="profile-empty compact">Ainda não há favoritos.</div>}
                </div>
              </section>

              <section className="profile-panel profile-contact-card">
                <div>
                  <Phone size={18} />
                  <span>Telefone</span>
                  <strong>{form.phone || "Não definido"}</strong>
                </div>
              </section>
            </aside>
          </div>
        )}

        {activeTab === "orders" && (
          <section className="profile-panel profile-orders-section">
            <div className="profile-section-heading profile-orders-heading">
              <div>
                <span>Centro de pedidos</span>
                <h2>Histórico de pedidos</h2>
              </div>
              <div className="profile-orders-heading-meta">
                <span>{orders.length} mostrados</span>
                {activeFilterCount > 0 && <span className="profile-filter-pill">{activeFilterCount} filtros</span>}
              </div>
            </div>

            <div className="profile-filter-toolbar">
              <label className="profile-search-control">
                <Search size={17} />
                <input
                  placeholder="Pesquisar produto ou pedido..."
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
                    label: status.label,
                  }))}
                />
              </label>
              <label>
                <CreditCard size={16} />
                <CustomSelect
                  value={filters.payment}
                  onChange={(nextValue) => updateFilter("payment", String(nextValue))}
                  options={[
                    { value: "", label: "Todos os pagamentos" },
                    { value: "counter", label: "Pagar ao balcão" },
                  ]}
                />
              </label>
              <label>
                <CalendarDays size={16} />
                <input type="date" value={filters.dateFrom} onChange={(e) => updateFilter("dateFrom", e.target.value)} />
              </label>
              <label>
                <CalendarDays size={16} />
                <input type="date" value={filters.dateTo} onChange={(e) => updateFilter("dateTo", e.target.value)} />
              </label>
              <button type="button" className="profile-clear-filters" onClick={() => setFilters(emptyFilters)}>
                <Filter size={16} />
                Limpar filtros
              </button>
            </div>

            {loadingOrders ? (
              <div className="profile-loading small">A carregar pedidos...</div>
            ) : allOrders.length === 0 ? (
              <div className="profile-empty profile-empty-orders">
                <h3>Ainda não há pedidos</h3>
                <p>Os seus pedidos concluídos aparecerão aqui com estado, recibos e opções para repetir.</p>
                <Link to="/menu" className="profile-order-again">Começar pedido</Link>
              </div>
            ) : orders.length === 0 ? (
              <div className="profile-empty profile-empty-orders">
                <h3>Nenhum pedido corresponde a estes filtros</h3>
                <p>Experimente limpar a pesquisa, intervalo de datas, pagamento ou estado.</p>
                <button type="button" className="profile-clear-filters" onClick={() => setFilters(emptyFilters)}>Limpar filtros</button>
              </div>
            ) : (
              <div className="profile-order-grid">
                {orders.map((order) => (
                  <OrderTimelineCard
                    key={order.orderId}
                    busyKey={busyKey}
                    order={order}
                    productsById={productsById}
                    onAddItem={handleAddItem}
                    onOrderAgain={handleOrderAgain}
                    onTrackOrder={handleTrackOrder}
                    onViewReceipt={handleViewReceipt}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "coupons" && (
          <section className="profile-panel profile-coupons-section">
            <div className="profile-section-heading">
              <div>
                <span>Loyalty</span>
                <h2>Cupões e recompensas</h2>
              </div>
              <button type="button" className="profile-text-button" onClick={() => selectProfileTab("orders")}>
                Pedir novamente <ChevronRight size={16} />
              </button>
            </div>

            <div className="profile-loyalty-banner">
              <div>
                <Sparkles size={20} />
                <span>Bonefree loyalty</span>
                <h3>{loyaltyProfileHeadline(loyaltySettings)}</h3>
                <p>{loyaltyCouponDetail(loyaltySettings)}</p>
              </div>
            </div>

            {loadingCoupons ? (
              <div className="profile-loading small">A carregar cupões...</div>
            ) : availableCoupons.length === 0 ? (
              <div className="profile-empty">
                Ainda não há cupões ativos. Fique atento a pedidos acima de {formatCurrency(loyaltySettings.qualifyingOrderMinimum)}.
              </div>
            ) : (
              <div className="profile-coupon-grid">
                {availableCoupons.map((coupon) => (
                  <article key={coupon.couponId} className="profile-coupon-card">
                    <span>{coupon.type === "fixed_value" ? "Desconto fixo" : "Desconto percentual"}</span>
                    <h3>{formatCurrency(coupon.value)} off</h3>
                    <p>Use o código <strong>{coupon.code}</strong></p>
                    <small>
                      Pedido mínimo {formatCurrency(coupon.minimumOrderValue)}
                      {coupon.expiresAt ? ` · Expira ${formatDate(coupon.expiresAt)}` : ""}
                    </small>
                    <Link to="/checkout" className="profile-order-again">Usar cupão</Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "personal" && (
          <form className="profile-settings-layout profile-personal-layout" onSubmit={handleSave}>
            <ProfileFormSection
              eyebrow="Pessoal"
              icon={UserRound}
              title="Informação pessoal"
              description="Dados principais de contacto usados no checkout, nos recibos e na recuperação da conta."
            >
              <FormField label="Nome">
                <input className={fieldErrors.name ? "is-invalid" : ""} value={form.name} onChange={(e) => updateForm("name", e.target.value)} autoComplete="given-name" />
                {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
              </FormField>
              <FormField label="Apelido">
                <input className={fieldErrors.lastName ? "is-invalid" : ""} value={form.lastName} onChange={(e) => updateForm("lastName", e.target.value)} autoComplete="family-name" />
                {fieldErrors.lastName && <small className="field-error">{fieldErrors.lastName}</small>}
              </FormField>
              <FormField label="Email">
                <input className={fieldErrors.email ? "is-invalid" : ""} type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} autoComplete="email" />
                {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
              </FormField>
              <FormField label="Telefone">
                <input className={fieldErrors.phone ? "is-invalid" : ""} value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} autoComplete="tel" inputMode="tel" />
                {fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}
              </FormField>
            </ProfileFormSection>

            <ProfileFormSection
              eyebrow="Faturação"
              icon={WalletCards}
              title="Dados fiscais"
              description="NIF e morada fiscal usados nos recibos e faturas dos seus pedidos."
            >
              <FormField label="NIF">
                <input className={fieldErrors.taxId ? "is-invalid" : ""} value={form.taxId} onChange={(e) => updateForm("taxId", e.target.value)} maxLength={9} inputMode="numeric" />
                {fieldErrors.taxId && <small className="field-error">{fieldErrors.taxId}</small>}
              </FormField>
              <FormField label="Morada fiscal" wide>
                <input value={form.address} onChange={(e) => updateForm("address", e.target.value)} autoComplete="street-address" />
              </FormField>
              <FormField label="Código postal">
                <input className={fieldErrors.postalCode ? "is-invalid" : ""} value={form.postalCode} onChange={(e) => updateForm("postalCode", e.target.value)} autoComplete="postal-code" inputMode="numeric" placeholder="0000-000" />
                {fieldErrors.postalCode && <small className="field-error">{fieldErrors.postalCode}</small>}
              </FormField>
              <FormField label="Cidade">
                <input value={form.city} onChange={(e) => updateForm("city", e.target.value)} autoComplete="address-level2" />
              </FormField>
            </ProfileFormSection>

            <div className="profile-settings-save">
              <button type="submit" className="profile-primary-cta" disabled={saving}>
                {saving ? "A guardar..." : "Guardar alterações"}
              </button>
            </div>
          </form>
        )}

        <div className="profile-mobile-reorder">
          <button type="button" onClick={latestOrder ? () => handleOrderAgain(latestOrder) : jumpToOrders} disabled={Boolean(latestOrder && busyKey === `order-${latestOrder.orderId}`)}>
            <RefreshCw size={18} />
            {latestOrder && busyKey === `order-${latestOrder.orderId}` ? "A adicionar..." : "Pedir novamente"}
          </button>
        </div>

      </main>
    </section>
  )
}

function OrderTimelineCard({
  busyKey,
  order,
  productsById,
  onAddItem,
  onOrderAgain,
  onTrackOrder,
  onViewReceipt,
}: {
  busyKey: string | null
  order: OrderResponse
  productsById: Record<string, Product>
  onAddItem: (item: OrderItem, key: string) => void
  onOrderAgain: (order: OrderResponse) => void
  onTrackOrder: (order: OrderResponse) => void
  onViewReceipt: (order: OrderResponse) => void
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const previewItems = order.items.slice(0, 3)
  const firstItem = order.items[0]
  const previewExtraCount = Math.max(order.items.length - 1, 0)
  const detailsTitleId = `order-details-title-${order.orderId}`
  const previewSummary = firstItem
    ? previewExtraCount > 0
      ? `${firstItem.productName} +${previewExtraCount} ${previewExtraCount === 1 ? "item" : "itens"}`
      : `${firstItem.quantity}x ${firstItem.productName}`
    : "Nenhum item listado"
  const canTrack = !orderTerminalStatuses.has(order.status)
  const canReorder = order.items.length > 0

  useEffect(() => {
    if (!detailsOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailsOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [detailsOpen])

  const orderDetailsModal = detailsOpen
    ? createPortal(
        <div
          className="profile-order-modal-backdrop"
          role="presentation"
          onClick={() => setDetailsOpen(false)}
        >
          <section
            className="profile-order-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={detailsTitleId}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="profile-order-modal-head">
              <div>
                <span>Número do pedido</span>
                <h3 id={detailsTitleId}>{order.orderNumber}</h3>
              </div>
              <button type="button" onClick={() => setDetailsOpen(false)} aria-label="Fechar detalhes do pedido">
                <X size={18} />
              </button>
            </header>

            <div className="profile-order-detail-list">
              <div className="profile-order-detail-summary">
                <span>Status</span>
                <strong>{formatStatus(order.status)}</strong>
                <span>Pagamento</span>
                <strong>{formatPayment(order.paymentMethod)}</strong>
              </div>
              {order.items.map((item, index) => {
                const product = productsById[item.productId]
                const productImage = item.image ?? product?.image
                const customizationLines = customizationSummary(item.customization)
                const itemKey = `${order.orderId}-${item.productId}-${index}`
                return (
                  <div key={itemKey} className="profile-order-detail-row">
                    <div className="profile-order-detail-item">
                      <span className="profile-order-detail-thumb" aria-hidden="true">
                        {productImage ? (
                          <img
                            src={resolveImage(productImage)}
                            alt=""
                            onError={(event) => {
                              applyApiImageFallback(event.currentTarget)
                            }}
                          />
                        ) : (
                          item.productName.charAt(0)
                        )}
                      </span>
                      <div>
                        <strong>{item.quantity}x {item.productName}</strong>
                        {customizationLines.length > 0 && <span>{customizationLines.join(" | ")}</span>}
                      </div>
                    </div>
                    <div>
                      <strong>{formatCurrency(item.subtotal)}</strong>
                      <button
                        type="button"
                        onClick={() => onAddItem(item, `item-${itemKey}`)}
                        disabled={busyKey === `item-${itemKey}`}
                      >
                        {busyKey === `item-${itemKey}` ? "A adicionar..." : "Adicionar"}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>,
        document.body,
      )
    : null

  return (
    <article className="profile-order-card">
      <div className="profile-order-card-main">
        <div className="profile-order-title-row">
          <div>
            <span>Número do pedido</span>
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
          <span>Valor total</span>
          <strong>{formatCurrency(order.total)}</strong>
        </div>

        <div className="profile-item-preview">
          <div className="profile-thumb-stack" aria-hidden="true">
            {previewItems.map((item, index) => {
              const product = productsById[item.productId]
              return (
                <span key={`${order.orderId}-${item.productId}-${index}`}>
                  {product?.image ? <img src={resolveImage(product.image)} alt="" /> : item.productName.charAt(0)}
                </span>
              )
            })}
          </div>
          <div className="profile-item-preview-copy">
            <strong>{previewSummary}</strong>
            <p>{orderItemsCount(order)} itens neste pedido</p>
          </div>
        </div>
      </div>

      <div className="profile-order-actions">
        <button
          type="button"
          className="profile-soft-action fw-semibold"
          onClick={() => setDetailsOpen(true)}
        >
          <ReceiptText size={16} /> Ver detalhes
        </button>
        {order.paymentStatus === "paid" && (
          <button
            type="button"
            className="profile-soft-action"
            onClick={() => onViewReceipt(order)}
            disabled={busyKey === `receipt-${order.orderId}`}
          >
            <ReceiptText size={16} />
            {busyKey === `receipt-${order.orderId}` ? "A abrir..." : "Ver recibo"}
          </button>
        )}
        {canTrack && (
          <button
            type="button"
            className="profile-soft-action"
            onClick={() => onTrackOrder(order)}
          >
            <PackageCheck size={16} />
            Acompanhar pedido
          </button>
        )}
        {canReorder && (
          <button
            type="button"
            className="profile-order-again p-1 fw-semibold"
            onClick={() => onOrderAgain(order)}
            disabled={busyKey === `order-${order.orderId}`}
          >
            <RefreshCw size={14} />
            {busyKey === `order-${order.orderId}` ? "A adicionar..." : "Repetir pedido"}
          </button>
        )}
      </div>

      {orderDetailsModal}
    </article>
  )
}

function ProfileFormSection({
  children,
  description,
  eyebrow,
  icon: Icon,
  title,
}: {
  children: React.ReactNode
  description: string
  eyebrow: string
  icon: typeof UserRound
  title: string
}) {
  return (
    <section className="profile-panel profile-form-card">
      <div className="profile-form-card-heading">
        <div className="profile-form-icon"><Icon size={18} /></div>
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="profile-form-grid">{children}</div>
    </section>
  )
}

function FormField({
  children,
  label,
  wide = false,
}: {
  children: React.ReactNode
  label: string
  wide?: boolean
}) {
  return (
    <label className={wide ? "profile-field wide" : "profile-field"}>
      <span>{label}</span>
      {children}
    </label>
  )
}

export default Profile
