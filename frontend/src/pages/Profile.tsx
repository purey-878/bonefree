import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { createPortal } from "react-dom"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
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
import CustomSelect from "../components/ui/CustomSelect"
import { Pagination } from "../components/ui"
import { useToast } from "../components/ui/toastContext"
import { useAuth } from "../hooks"
import { cartService, checkoutService, customizationSummary, productService } from "../services"
import { applyApiImageFallback, resolveProductImageUrl } from "../utils/imageFallback"
import { translateUserMessage } from "../utils/messages"
import { authService } from "../services/authService"
import type { ProfileOverview } from "../services/authService"
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
import i18n, { resolvedLocale } from "../i18n"
import { primaryProductMediaUrl, productMediaUrl } from "../utils/productMedia"
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
  { value: "", labelKey: "profile.status.all" },
  { value: "pending", labelKey: "profile.status.pending" },
  { value: "confirmed", labelKey: "profile.status.confirmed" },
  { value: "in_preparation", labelKey: "profile.status.inPreparation" },
  { value: "ready", labelKey: "profile.status.ready" },
  { value: "delivered", labelKey: "profile.status.delivered" },
  { value: "cancelled", labelKey: "profile.status.cancelled" },
]

const tabs: Array<{ id: ProfileTab; labelKey: string; icon: typeof ReceiptText }> = [
  { id: "overview", labelKey: "profile.tabs.overview", icon: Sparkles },
  { id: "orders", labelKey: "profile.tabs.orders", icon: ReceiptText },
  { id: "coupons", labelKey: "profile.tabs.coupons", icon: WalletCards },
  { id: "personal", labelKey: "profile.tabs.personal", icon: UserRound },
]

const orderTerminalStatuses = new Set(["delivered", "cancelled"])

function profileTabFromParam(value: string | null): ProfileTab | null {
  if (value === "overview" || value === "orders" || value === "coupons" || value === "personal") return value
  return null
}

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
  if (orderCount >= 20 || totalSpent >= 600) return i18n.t("profile.tier.diamond", { ns: "account" })
  if (orderCount >= 10 || totalSpent >= 300) return i18n.t("profile.tier.gold", { ns: "account" })
  if (orderCount >= 4 || totalSpent >= 120) return i18n.t("profile.tier.regular", { ns: "account" })
  return i18n.t("profile.tier.new", { ns: "account" })
}

function orderItemsCount(order: OrderResponse) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0)
}

function numericSetting(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function loyaltyProfileHeadline(settings: LoyaltyCouponSettings) {
  const orderCount = Math.max(1, Math.round(numericSetting(settings.qualifyingOrderCount, 3)))
  return i18n.t("profile.coupons.headline", { ns: "account", count: orderCount, minimum: formatCurrency(settings.qualifyingOrderMinimum) })
}

function Profile() {
  const { t } = useTranslation(["account", "common"])
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
  const [filters, setFilters] = useState<HistoryFilters>(() => ({
    status: searchParams.get("status") ?? "", payment: searchParams.get("payment") ?? "",
    dateFrom: searchParams.get("date_from") ?? "", dateTo: searchParams.get("date_to") ?? "", search: searchParams.get("q") ?? "",
  }))
  const [orders, setOrders] = useState<OrderResponse[]>([])
  const [overview, setOverview] = useState<ProfileOverview | null>(null)
  const [ordersPage, setOrdersPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1))
  const [ordersPerPage, setOrdersPerPage] = useState(() => [10, 20, 50, 100].includes(Number(searchParams.get("per_page"))) ? Number(searchParams.get("per_page")) : 20)
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [ordersTotalPages, setOrdersTotalPages] = useState(0)
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([])
  const [couponsPage, setCouponsPage] = useState(() => Math.max(1, Number(searchParams.get("coupon_page")) || 1))
  const [couponsPerPage, setCouponsPerPage] = useState(() => [10, 20, 50, 100].includes(Number(searchParams.get("coupon_per_page"))) ? Number(searchParams.get("coupon_per_page")) : 20)
  const [couponsTotal, setCouponsTotal] = useState(0)
  const [couponsTotalPages, setCouponsTotalPages] = useState(0)
  const lastWrittenSearchRef = useRef(searchParams.toString())
  const skipUrlWriteRef = useRef(false)
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
        const [profileOverview, couponSettings] = await Promise.all([
          authService.getProfileOverview(),
          getPublicLoyaltyCouponSettings().catch(() => defaultLoyaltyCouponSettings),
        ])
        setOverview(profileOverview)
        setLoyaltySettings(couponSettings)
      } catch (err) {
        setError(translateUserMessage(err instanceof Error ? err.message : t("profile.errors.profileData")))
      } finally {
        setLoadingCoupons(false)
      }
    }

    void loadProfileData()
  }, [isAuthenticated, t])

  useEffect(() => {
    if (!isAuthenticated) return
    let current = true
    setLoadingCoupons(true)
    void checkoutService.getCoupons({ page: couponsPage, perPage: couponsPerPage }).then((result) => {
      if (!current) return
      setAvailableCoupons(result.items)
      setCouponsTotal(result.total)
      setCouponsTotalPages(result.totalPages)
      if (result.totalPages === 0 && couponsPage !== 1) setCouponsPage(1)
      else if (result.totalPages > 0 && couponsPage > result.totalPages) setCouponsPage(result.totalPages)
    }).catch((err) => {
      if (current) setError(translateUserMessage(err instanceof Error ? err.message : t("profile.errors.profileData")))
    }).finally(() => {
      if (current) setLoadingCoupons(false)
    })
    return () => { current = false }
  }, [couponsPage, couponsPerPage, isAuthenticated, t])

  useEffect(() => {
    if (!isAuthenticated) return
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
  }, [filters, isAuthenticated, ordersPage, ordersPerPage, t])

  const totalSpent = overview?.totalSpent ?? 0
  const totalItems = overview?.totalItems ?? 0
  const favoriteMeals = overview?.favoriteProducts ?? []

  const favoriteItem = favoriteMeals[0]?.name ?? t("profile.discovering")
  const latestOrder = overview?.latestOrder ?? null
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const displayName = `${form.name} ${form.lastName}`.trim() || user?.email || t("profile.defaultCustomer")
  const tier = customerTier(overview?.orderCount ?? 0, totalSpent)
  const couponStreak = overview?.loyaltyProgress ?? { current: 0, required: 1, remaining: 1, percent: 0, minimumSubtotal: 0 }
  const showCouponProgress = couponStreak.current > 0 && couponStreak.current < couponStreak.required

  const updateForm = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: field === "phone" ? normalizePhone(value) : value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setMessage(null)
    setError(null)
  }

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
    const nextCouponsPerPage = Number(searchParams.get("coupon_per_page"))
    setActiveTab(profileTabFromParam(searchParams.get("tab") ?? searchParams.get("section")) ?? "overview")
    setFilters({
      search: searchParams.get("q") ?? "",
      status: searchParams.get("status") ?? "",
      payment: searchParams.get("payment") ?? "",
      dateFrom: searchParams.get("date_from") ?? "",
      dateTo: searchParams.get("date_to") ?? "",
    })
    setOrdersPage(Math.max(1, Number(searchParams.get("page")) || 1))
    setOrdersPerPage([10, 20, 50, 100].includes(nextOrdersPerPage) ? nextOrdersPerPage : 20)
    setCouponsPage(Math.max(1, Number(searchParams.get("coupon_page")) || 1))
    setCouponsPerPage([10, 20, 50, 100].includes(nextCouponsPerPage) ? nextCouponsPerPage : 20)
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
    setOrDelete("payment", filters.payment)
    setOrDelete("date_from", filters.dateFrom)
    setOrDelete("date_to", filters.dateTo)
    if (ordersPage === 1) next.delete("page"); else next.set("page", String(ordersPage))
    if (ordersPerPage === 20) next.delete("per_page"); else next.set("per_page", String(ordersPerPage))
    if (couponsPage === 1) next.delete("coupon_page"); else next.set("coupon_page", String(couponsPage))
    if (couponsPerPage === 20) next.delete("coupon_per_page"); else next.set("coupon_per_page", String(couponsPerPage))
    if (next.toString() !== searchParams.toString()) {
      lastWrittenSearchRef.current = next.toString()
      setSearchParams(next, { replace: true })
    }
  }, [couponsPage, couponsPerPage, filters, ordersPage, ordersPerPage, searchParams, setSearchParams])

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

  const handleAddItem = async (item: OrderItem, key: string) => {
    try {
      setBusyKey(key)
      setActionError(null)
      setSuccessMessage(null)
      await addHistoricalItem(item)
      setSuccessMessage(t("profile.messages.itemAdded", { count: item.quantity, name: item.productName }))
      toast.success(t("profile.messages.itemAddedToast"))
    } catch (err) {
      const message = translateUserMessage(err instanceof Error ? err.message : t("errors:messages.itemAdd"))
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
          failures.push(translateUserMessage(err instanceof Error ? err.message : t("errors:messages.couldNotAdd", { item: item.productName })))
        }
      }

      if (addedCount > 0) {
        const message = t("profile.messages.itemsAdded", { count: addedCount })
        setSuccessMessage(message)
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
    setSuccessMessage(null)
    navigate(`/orders/${order.orderId}`)
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
      const message = translateUserMessage(err instanceof Error ? err.message : t("profile.errors.receipt"))
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
        setError(t("errors:messages.fixFields"))
        toast.warning(t("errors:messages.fixFields"))
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
        setMessage(t("profile.messages.updated"))
        toast.success(t("profile.messages.saved"))
    } catch (err) {
      const message = translateUserMessage(err instanceof Error ? err.message : t("profile.errors.save"))
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
          <div className="profile-loading">{t("profile.loading")}</div>
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
                <span className="profile-muted-chip">{t("profile.hero.customerProfile")}</span>
              </div>
              <h1>{displayName}</h1>
              <p><Mail size={15} /> {form.email}</p>
            </div>
          </div>

          <div className="profile-hero-actions">
            <button type="button" className="profile-primary-cta" onClick={jumpToOrders}>
              <RefreshCw size={18} />
              {t("profile.hero.reorder")}
            </button>
            <button type="button" className="profile-secondary-cta" onClick={jumpToPersonal}>
              <Pencil size={17} />
              {t("profile.hero.edit")}
            </button>
          </div>

          <div className="profile-stat-strip">
            <div>
              <span>{t("profile.hero.orders")}</span>
              <strong>{overview?.orderCount ?? 0}</strong>
            </div>
            <div>
              <span>{t("profile.hero.totalSpent")}</span>
              <strong>{formatCurrency(totalSpent)}</strong>
            </div>
            <div>
              <span>{t("profile.hero.favourite")}</span>
              <strong>{favoriteItem}</strong>
            </div>
          </div>

          {showCouponProgress && (
            <div className="profile-coupon-progress-card">
              <div className="profile-coupon-progress-copy">
                <span><Sparkles size={15} /> {t("profile.streak.label")}</span>
                <strong>{t("profile.streak.eligible", { count: couponStreak.required, current: couponStreak.current, required: couponStreak.required })}</strong>
                <p>{t("profile.streak.remaining", { count: couponStreak.remaining, minimum: formatCurrency(couponStreak.minimumSubtotal) })}</p>
              </div>
              <div className="profile-coupon-progress-track" aria-label={t("profile.streak.aria", { current: couponStreak.current, required: couponStreak.required })}>
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

        <nav className="profile-tabs" aria-label={t("profile.tabs.label")}>
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
                {t(tab.labelKey)}
              </button>
            )
          })}
        </nav>

        {activeTab === "overview" && (
          <div className="profile-overview-grid">
            <section className="profile-panel profile-overview-main">
              <div className="profile-section-heading">
                <div>
                  <span>{t("profile.overview.label")}</span>
                  <h2>{t("profile.overview.title")}</h2>
                </div>
                <button type="button" className="profile-text-button" onClick={() => selectProfileTab("orders")}>
                  {t("profile.overview.viewOrders")} <ChevronRight size={16} />
                </button>
              </div>

              <div className="profile-metric-grid">
                <div className="profile-metric-card">
                  <ShoppingBag size={18} />
                  <span>{t("profile.overview.itemsOrdered")}</span>
                  <strong>{totalItems}</strong>
                </div>
                <div className="profile-metric-card">
                  <WalletCards size={18} />
                  <span>{t("profile.overview.averageOrder")}</span>
                  <strong>{formatCurrency(overview?.averageOrderValue ?? 0)}</strong>
                </div>
                <div className="profile-metric-card">
                  <Star size={18} />
                  <span>{t("profile.overview.favourite")}</span>
                  <strong>{favoriteItem}</strong>
                </div>
              </div>

              {latestOrder ? (
                <article className="profile-feature-order">
                  <div>
                    <span className={`profile-status ${latestOrder.status}`}>{formatStatus(latestOrder.status)}</span>
                    <h3>{latestOrder.orderNumber}</h3>
                    <p>{formatDate(latestOrder.createdAt)} · {t("profile.overview.orderItems", { count: orderItemsCount(latestOrder) })} · {formatPayment(latestOrder.paymentMethod)}</p>
                  </div>
                  <div className="profile-feature-actions">
                    <strong>{formatCurrency(latestOrder.total)}</strong>
                    <button
                      type="button"
                      className="profile-order-again"
                      onClick={() => handleOrderAgain(latestOrder)}
                      disabled={busyKey === `order-${latestOrder.orderId}`}
                    >
                      {busyKey === `order-${latestOrder.orderId}` ? t("profile.overview.adding") : t("profile.hero.reorder")}
                    </button>
                  </div>
                </article>
              ) : (
                <div className="profile-empty">{t("profile.overview.firstOrder")}</div>
              )}
            </section>

            <aside className="profile-side-column">
              <section className="profile-panel">
                <div className="profile-section-heading compact">
                  <div>
                    <span>{t("profile.overview.fastReorder")}</span>
                    <h2>{t("profile.overview.favouriteMeals")}</h2>
                  </div>
                </div>
                <div className="profile-favorite-list">
                  {favoriteMeals.slice(0, 3).map((meal) => (
                    <button
                      type="button"
                      key={meal.productId}
                      className="profile-favorite-row"
                      onClick={() => navigate(`/product/${meal.productId}`)}
                    >
                      <span>{meal.name}</span>
                      <strong>{t("profile.overview.repeatCount", { count: meal.quantity })}</strong>
                    </button>
                  ))}
                  {favoriteMeals.length === 0 && <div className="profile-empty compact">{t("profile.overview.noFavourites")}</div>}
                </div>
              </section>

              <section className="profile-panel profile-contact-card">
                <div>
                  <Phone size={18} />
                  <span>{t("profile.overview.phone")}</span>
                  <strong>{form.phone || t("profile.overview.notDefined")}</strong>
                </div>
              </section>
            </aside>
          </div>
        )}

        {activeTab === "orders" && (
          <section className="profile-panel profile-orders-section">
            <div className="profile-section-heading profile-orders-heading">
              <div>
                <span>{t("profile.orders.label")}</span>
                <h2>{t("profile.orders.title")}</h2>
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
              <label>
                <CreditCard size={16} />
                <CustomSelect
                  value={filters.payment}
                  onChange={(nextValue) => updateFilter("payment", String(nextValue))}
                  options={[
                    { value: "", label: t("profile.payment.all") },
                    { value: "counter", label: t("profile.payment.counter") },
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
                {t("profile.orders.clearFilters")}
              </button>
            </div>

            {loadingOrders ? (
              <div className="profile-loading small">{t("profile.orders.loading")}</div>
            ) : (overview?.orderCount ?? 0) === 0 ? (
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
                    onAddItem={handleAddItem}
                    onOrderAgain={handleOrderAgain}
                    onTrackOrder={handleTrackOrder}
                    onViewReceipt={handleViewReceipt}
                  />
                ))}
              </div>
            )}
            <Pagination page={ordersPage} perPage={ordersPerPage} total={ordersTotal} totalPages={ordersTotalPages} onPageChange={setOrdersPage} onPerPageChange={(value) => { setOrdersPerPage(value); setOrdersPage(1) }} />
          </section>
        )}

        {activeTab === "coupons" && (
          <section className="profile-panel profile-coupons-section">
            <div className="profile-section-heading">
              <div>
                <span>{t("profile.coupons.label")}</span>
                <h2>{t("profile.coupons.title")}</h2>
              </div>
              <button type="button" className="profile-text-button" onClick={() => selectProfileTab("orders")}>
                {t("profile.coupons.reorder")} <ChevronRight size={16} />
              </button>
            </div>

            <div className="profile-loyalty-banner">
              <div>
                <Sparkles size={20} />
                <span>{t("profile.coupons.brand")}</span>
                <h3>{loyaltyProfileHeadline(loyaltySettings)}</h3>
                <p>{loyaltyCouponDetail(loyaltySettings)}</p>
              </div>
            </div>

            {loadingCoupons ? (
              <div className="profile-loading small">{t("profile.coupons.loading")}</div>
            ) : availableCoupons.length === 0 ? (
              <div className="profile-empty">
                {t("profile.coupons.empty", { minimum: formatCurrency(loyaltySettings.qualifyingOrderMinimum) })}
              </div>
            ) : (
              <div className="profile-coupon-grid">
                {availableCoupons.map((coupon) => (
                  <article key={coupon.couponId} className="profile-coupon-card">
                    <span>{coupon.type === "fixed_value" ? t("profile.coupons.fixed") : t("profile.coupons.percentage")}</span>
                    <h3>{t("profile.coupons.discount", { value: formatCurrency(coupon.value) })}</h3>
                    <p>{t("profile.coupons.useCode", { code: coupon.code })}</p>
                    <small>
                      {t("profile.coupons.minimum", { value: formatCurrency(coupon.minimumOrderValue) })}
                      {coupon.expiresAt ? ` · ${t("profile.coupons.expires", { date: formatDate(coupon.expiresAt) })}` : ""}
                    </small>
                    <Link to="/checkout" className="profile-order-again">{t("profile.coupons.use")}</Link>
                  </article>
                ))}
              </div>
            )}
            <Pagination page={couponsPage} perPage={couponsPerPage} total={couponsTotal} totalPages={couponsTotalPages} onPageChange={setCouponsPage} onPerPageChange={(value) => { setCouponsPerPage(value); setCouponsPage(1) }} />
          </section>
        )}

        {activeTab === "personal" && (
          <form className="profile-settings-layout profile-personal-layout" onSubmit={handleSave}>
            <ProfileFormSection
              eyebrow={t("profile.personal.label")}
              icon={UserRound}
              title={t("profile.personal.title")}
              description={t("profile.personal.description")}
            >
              <FormField label={t("fields.firstName", { ns: "common" })}>
                <input className={fieldErrors.name ? "is-invalid" : ""} value={form.name} onChange={(e) => updateForm("name", e.target.value)} autoComplete="given-name" />
                {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
              </FormField>
              <FormField label={t("fields.lastName", { ns: "common" })}>
                <input className={fieldErrors.lastName ? "is-invalid" : ""} value={form.lastName} onChange={(e) => updateForm("lastName", e.target.value)} autoComplete="family-name" />
                {fieldErrors.lastName && <small className="field-error">{fieldErrors.lastName}</small>}
              </FormField>
              <FormField label={t("fields.email", { ns: "common" })}>
                <input className={fieldErrors.email ? "is-invalid" : ""} type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} autoComplete="email" />
                {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
              </FormField>
              <FormField label={t("fields.phone", { ns: "common" })}>
                <input className={fieldErrors.phone ? "is-invalid" : ""} value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} autoComplete="tel" inputMode="tel" />
                {fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}
              </FormField>
            </ProfileFormSection>

            <ProfileFormSection
              eyebrow={t("profile.personal.billingLabel")}
              icon={WalletCards}
              title={t("profile.personal.billingTitle")}
              description={t("profile.personal.billingDescription")}
            >
              <FormField label={t("fields.taxId", { ns: "common" })}>
                <input className={fieldErrors.taxId ? "is-invalid" : ""} value={form.taxId} onChange={(e) => updateForm("taxId", e.target.value)} maxLength={9} inputMode="numeric" />
                {fieldErrors.taxId && <small className="field-error">{fieldErrors.taxId}</small>}
              </FormField>
              <FormField label={t("profile.personal.billingAddress")} wide>
                <input value={form.address} onChange={(e) => updateForm("address", e.target.value)} autoComplete="street-address" />
              </FormField>
              <FormField label={t("fields.postalCode", { ns: "common" })}>
                <input className={fieldErrors.postalCode ? "is-invalid" : ""} value={form.postalCode} onChange={(e) => updateForm("postalCode", e.target.value)} autoComplete="postal-code" inputMode="numeric" placeholder="0000-000" />
                {fieldErrors.postalCode && <small className="field-error">{fieldErrors.postalCode}</small>}
              </FormField>
              <FormField label={t("fields.city", { ns: "common" })}>
                <input value={form.city} onChange={(e) => updateForm("city", e.target.value)} autoComplete="address-level2" />
              </FormField>
            </ProfileFormSection>

            <div className="profile-settings-save">
              <button type="submit" className="profile-primary-cta" disabled={saving}>
                {saving ? t("profile.personal.saving") : t("profile.personal.save")}
              </button>
            </div>
          </form>
        )}

        <div className="profile-mobile-reorder">
          <button type="button" onClick={latestOrder ? () => handleOrderAgain(latestOrder) : jumpToOrders} disabled={Boolean(latestOrder && busyKey === `order-${latestOrder.orderId}`)}>
            <RefreshCw size={18} />
            {latestOrder && busyKey === `order-${latestOrder.orderId}` ? t("profile.overview.adding") : t("profile.hero.reorder")}
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
  const { t } = useTranslation("account")
  const [detailsOpen, setDetailsOpen] = useState(false)
  const previewItems = order.items.slice(0, 3)
  const firstItem = order.items[0]
  const previewExtraCount = Math.max(order.items.length - 1, 0)
  const detailsTitleId = `order-details-title-${order.orderId}`
  const previewSummary = firstItem
    ? previewExtraCount > 0
      ? t("profile.orderCard.extraItems", { count: previewExtraCount, name: firstItem.productName })
      : `${firstItem.quantity}x ${firstItem.productName}`
    : t("profile.orderCard.noItems")
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
                <span>{t("profile.orderCard.number")}</span>
                <h3 id={detailsTitleId}>{order.orderNumber}</h3>
              </div>
              <button type="button" onClick={() => setDetailsOpen(false)} aria-label={t("profile.orderCard.close")}>
                <X size={18} />
              </button>
            </header>

            <div className="profile-order-detail-list">
              <div className="profile-order-detail-summary">
                <span>{t("profile.orderCard.status")}</span>
                <strong>{formatStatus(order.status)}</strong>
                <span>{t("profile.orderCard.payment")}</span>
                <strong>{formatPayment(order.paymentMethod)}</strong>
              </div>
              {order.items.map((item, index) => {
                const product = productsById[item.productId]
                const productImage = productMediaUrl(item.media, "thumb")
                  ?? primaryProductMediaUrl(product?.media, "thumb")
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
                        {busyKey === `item-${itemKey}` ? t("profile.orderCard.adding") : t("profile.orderCard.add")}
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
        <button
          type="button"
          className="profile-soft-action fw-semibold"
          onClick={() => setDetailsOpen(true)}
        >
          <ReceiptText size={16} /> {t("profile.orderCard.details")}
        </button>
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
        {canTrack && (
          <button
            type="button"
            className="profile-soft-action"
            onClick={() => onTrackOrder(order)}
          >
            <PackageCheck size={16} />
            {t("profile.orderCard.track")}
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
            {busyKey === `order-${order.orderId}` ? t("profile.orderCard.adding") : t("profile.orderCard.repeat")}
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
