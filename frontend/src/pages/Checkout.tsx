import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import {
  ArrowRight,
  ArrowLeft,
  Banknote,
  Check,
  ChevronDown,
  Headphones,
  MailCheck,
  MapPin,
  LoaderCircle,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  Truck,
  Trash2,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import Navbar from "../components/Navbar"
import { useToast } from "../components/ui/toastContext"
import { useAuth, useCart } from "../hooks"
import { cartService, checkoutService, customizationSummary, hasUnavailableCartItems, productService } from "../services"
import { readGuestOrderAccesses, rememberGuestOrderAccess } from "../components/orderStatusStorage"
import type { CartItem, GuestCartItem } from "../types/cart"
import type { Coupon, CouponValidation, FulfillmentMethod, PaymentMethod } from "../types/checkout"
import type { Product } from "../types/product"
import { applyApiImageFallback, resolveProductImageUrl } from "../utils/imageFallback"
import { validateEmail, validateName, validateNif, validatePhone } from "../utils/validation"
import type { FieldErrors } from "../utils/validation"
import { formatEuro } from "../utils/money"
import { resolvedLocale } from "../i18n"
import { primaryProductMediaUrl, productMediaUrl } from "../utils/productMedia"
import "./Checkout.css"

interface CheckoutForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  taxId: string
  tableNumber: string
  promoCode: string
}

interface ConfirmedOrderSnapshot {
  items: CartItem[]
  subtotal: number
  status: string
  fulfillmentMethod: FulfillmentMethod
  paymentMethod: PaymentMethod
  customer: CheckoutForm
  createdAt: string
  orderId: number
  isGuest: boolean
}

const initialForm: CheckoutForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  taxId: "",
  tableNumber: "",
  promoCode: "",
}

const VAT_RATE = 0.13
const MAX_TABLE_NUMBER = 30
const TERMINAL_ORDER_STATUSES = new Set(["delivered", "cancelled"])

const fulfillmentOptions: Array<{ value: FulfillmentMethod; labelKey: string; descriptionKey: string; icon: typeof ShoppingBag }> = [
  { value: "dine_in", labelKey: "checkout.fulfillment.dineIn", descriptionKey: "checkout.fulfillment.dineInDescription", icon: MapPin },
  { value: "takeaway", labelKey: "checkout.fulfillment.takeaway", descriptionKey: "checkout.fulfillment.takeawayDescription", icon: ShoppingBag },
]

const upsellGroups = [
  {
    label: "sauce",
    keywords: ["molho", "sauce", "aioli", "ketchup", "maionese", "maionese alho", "mostarda", "sriracha"],
  },
  {
    label: "drink",
    keywords: ["bebida", "bebidas", "drink", "agua", "sumo", "refrigerante", "cola", "coca", "fanta", "sprite", "ice tea", "limonada", "fritz", "cafe", "americano", "expresso", "cappuccino"],
  },
  {
    label: "extra",
    keywords: ["extra", "batata", "fries", "chips", "acompanhamento", "side", "salada", "sobremesa", "dessert", "brownie", "cookie", "bolo"],
  },
]

const blockedDrinkKeywords = ["alcool", "alcohol", "caipirinha", "mojito", "gin", "vodka", "rum", "cocktail", "sangria", "vinho", "cerveja"]
const blockedMainDishKeywords = ["wing", "wings", "asa", "asas", "frango", "chicken", "burger", "hamburguer", "nachos", "taco", "wrap", "kebab", "pizza", "massa"]

function normalizeSearchText(value?: string | string[] | null) {
  const text = Array.isArray(value) ? value.join(" ") : value ?? ""
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function getUpsellLabel(product: Product) {
  const name = normalizeSearchText(product.name)
  const category = normalizeSearchText([product.category, ...(product.tags ?? [])])
  const searchable = `${name} ${category}`
  const isAlcoholic = Boolean(product.containsAlcohol) || blockedDrinkKeywords.some((keyword) => searchable.includes(keyword))

  if (!isAlcoholic && upsellGroups[1].keywords.some((keyword) => searchable.includes(keyword))) {
    return "drink"
  }

  const looksLikeSauce = upsellGroups[0].keywords.some((keyword) => searchable.includes(keyword))
  const looksLikeMainDish = blockedMainDishKeywords.some((keyword) => searchable.includes(keyword))
  if (looksLikeSauce && !looksLikeMainDish) {
    return "sauce"
  }

  const looksLikeSmallExtra = upsellGroups[2].keywords.some((keyword) => searchable.includes(keyword))
  if (looksLikeSmallExtra && !looksLikeMainDish) {
    return "extra"
  }

  return null
}

function isCartItem(item: CartItem | GuestCartItem): item is CartItem {
  return "name" in item
}

function checkoutImageUrl(src?: string | null) {
  return resolveProductImageUrl(src)
}

function Checkout() {
  const { t } = useTranslation(["storefront", "common"])
  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading, refreshUser } = useAuth()
  const { cart, loading, error, clearError, addItem, updateQuantity, removeItem } = useCart()
  const toast = useToast()
  const [form, setForm] = useState(initialForm)
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>("dine_in")
  const payment: PaymentMethod = "counter"
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([])
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidation | null>(null)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [earnedCoupon, setEarnedCoupon] = useState<string | null>(null)
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrderSnapshot | null>(null)
  const [showOrderSummary, setShowOrderSummary] = useState(true)
  const [showStatusPopup, setShowStatusPopup] = useState(false)
  const [showCouponEntry, setShowCouponEntry] = useState(false)
  const [activeOrderCount, setActiveOrderCount] = useState<number | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof CheckoutForm>>({})
  const [cartBusyKey, setCartBusyKey] = useState<string | null>(null)
  const [upsellProducts, setUpsellProducts] = useState<Product[]>([])
  const [upsellBusyId, setUpsellBusyId] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    setForm((current) => ({
      ...current,
      firstName: user.name ?? "",
      lastName: user.lastName ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      taxId: user.taxId ?? "",
    }))
  }, [user])

  useEffect(() => {
    if (fulfillment !== "takeaway") return
    setForm((current) => current.tableNumber ? { ...current, tableNumber: "" } : current)
    setFieldErrors((current) => ({ ...current, tableNumber: undefined }))
  }, [fulfillment])

  const items = useMemo<CartItem[]>(
    () => cart?.items?.flatMap((item) => isCartItem(item) ? [item] : []) ?? [],
    [cart],
  )
  const subtotal = Number(cart?.total ?? 0)
  const hasUnavailableItems = hasUnavailableCartItems(items)
  const discount = Math.min(subtotal, Number(appliedCoupon?.discount ?? 0))
  const total = Math.max(0, subtotal - discount)
  const vatAmount = total - total / (1 + VAT_RATE)
  const subtotalExVat = total - vatAmount
  const checkoutUpsells = useMemo(() => {
    const cartProductIds = new Set(items.map((item) => item.productId))
    const candidates = upsellProducts
      .map((product) => ({ product, label: getUpsellLabel(product) }))
      .filter(({ product, label }) => {
        return product.available && !cartProductIds.has(product.id) && Boolean(label)
      })
      .sort((a, b) => {
        const aGroup = upsellGroups.findIndex((group) => group.label === a.label)
        const bGroup = upsellGroups.findIndex((group) => group.label === b.label)
        return aGroup - bGroup || (a.product.price ?? 0) - (b.product.price ?? 0)
      })

    const sauces = candidates.filter((item) => item.label === "sauce").slice(0, 2)
    const drinks = candidates.filter((item) => item.label === "drink").slice(0, 2)
    const selected = [...drinks, ...sauces]
    const selectedIds = new Set(selected.map((item) => item.product.id))
    const fillers = candidates
      .filter((item) => item.label === "extra" && !selectedIds.has(item.product.id))
      .slice(0, Math.max(0, 4 - selected.length))

    return [...selected, ...fillers].map((item) => item.product)
  }, [items, upsellProducts])

  useEffect(() => {
    if (!isAuthenticated) return

      checkoutService.getAllCoupons()
      .then(setAvailableCoupons)
      .catch((err) => console.error("Não foi possível carregar cupões.", err))
  }, [isAuthenticated])

  useEffect(() => {
    productService.getPage({ page: 1, perPage: 20, sort: "popular" })
      .then((result) => setUpsellProducts(result.items))
      .catch((err) => console.error("Não foi possível carregar extras do checkout.", err))
  }, [])

  const updateForm = (field: keyof CheckoutForm, value: string) => {
    const nextValue = value
    setForm((current) => ({ ...current, [field]: nextValue }))
    setFormError(null)
    const validators: Partial<Record<keyof CheckoutForm, (input: string) => string>> = {
      firstName: validateName,
      lastName: validateName,
      email: (input) => input.trim() ? validateEmail(input) : "",
      phone: (input) => validatePhone(input, false),
      taxId: (input) => validateNif(input),
    }
    const nextError = validators[field]?.(nextValue) ?? ""
    setFieldErrors((current) => ({ ...current, [field]: nextError || undefined }))
    if (field === "promoCode") setAppliedCoupon(null)
  }

  const validate = () => {
    const errors: FieldErrors<keyof CheckoutForm> = {}
    const firstNameError = validateName(form.firstName)
    const lastNameError = validateName(form.lastName)
    const emailError = form.email.trim() ? validateEmail(form.email) : ""
    const phoneError = validatePhone(form.phone, false)
    const nifError = validateNif(form.taxId)
    if (firstNameError) errors.firstName = firstNameError
    if (lastNameError) errors.lastName = lastNameError
    if (emailError) errors.email = emailError
    if (phoneError) errors.phone = phoneError
    if (nifError) errors.taxId = nifError

    const tableValue = form.tableNumber.trim()
    const tableNum = Number(tableValue)
    if (fulfillment === "dine_in" && tableValue && (!Number.isInteger(tableNum) || tableNum < 1 || tableNum > MAX_TABLE_NUMBER)) {
      errors.tableNumber = t("checkout.fulfillment.invalidTable", { max: MAX_TABLE_NUMBER })
    }

    if (items.length === 0) {
      return t("checkout.validation.empty")
    }
    if (hasUnavailableItems) {
      return t("checkout.validation.unavailable")
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return t("checkout.validation.fixFields")
    return null
  }

  const handleQuantityChange = async (item: CartItem, quantity: number) => {
    const key = `${item.cartProductId}-${item.productId}`
    try {
      setCartBusyKey(key)
      setFormError(null)
      await updateQuantity(item.productId, quantity, item.cartProductId, item.customization)
      if (appliedCoupon) setAppliedCoupon(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : t("checkout.errors.updateItem")
      setFormError(message)
      toast.error(message)
    } finally {
      setCartBusyKey(null)
    }
  }

  const handleRemoveItem = async (item: CartItem) => {
    const key = `${item.cartProductId}-${item.productId}`
    try {
      setCartBusyKey(key)
      setFormError(null)
      await removeItem(item.productId, item.cartProductId, item.customization)
      if (appliedCoupon) setAppliedCoupon(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : t("checkout.errors.removeItem")
      setFormError(message)
      toast.error(message)
    } finally {
      setCartBusyKey(null)
    }
  }

  const handleAddUpsell = async (product: Product) => {
    try {
      setUpsellBusyId(product.id)
      setFormError(null)
      await addItem(product.id, 1)
      if (appliedCoupon) setAppliedCoupon(null)
      toast.success(t("checkout.upsell.addedNamed", { name: product.name }))
    } catch (err) {
      const message = err instanceof Error ? err.message : t("checkout.upsell.addFailedNamed", { name: product.name })
      setFormError(message)
      toast.error(message)
    } finally {
      setUpsellBusyId(null)
    }
  }

  const handleApplyCoupon = async () => {
    const code = form.promoCode.trim()
    if (!code) {
      setFormError(t("checkout.coupon.missing"))
      toast.warning(t("checkout.coupon.missing"))
      return
    }

    try {
      setIsApplyingCoupon(true)
      setFormError(null)
      setAppliedCoupon(await checkoutService.validateCoupon(code, subtotal))
      toast.success(t("checkout.coupon.success"))
    } catch (err) {
      const message = err instanceof Error ? err.message : t("checkout.coupon.failed")
      setAppliedCoupon(null)
      setFormError(message)
      toast.error(message)
    } finally {
      setIsApplyingCoupon(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validate()

    if (validationError) {
      setFormError(validationError)
      toast.warning(validationError)
      return
    }

    try {
      setIsSubmitting(true)
      setFormError(null)
      const order = await checkoutService.createOrder({
        customer: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          taxId: form.taxId.trim() || null,
          tableNumber: fulfillment === "dine_in" && form.tableNumber.trim() ? parseInt(form.tableNumber, 10) : null,
        },
        fulfillmentMethod: fulfillment,
        paymentMethod: "counter",
        promoCode: appliedCoupon?.code ?? null,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          customization: item.customization ?? null,
        })),
      })
      setConfirmedOrder({
        items,
        subtotal,
        status: order.status,
        fulfillmentMethod: order.deliveryMethod,
        paymentMethod: "counter",
        customer: { ...form },
        createdAt: new Date().toISOString(),
        orderId: order.orderId,
        isGuest: !isAuthenticated,
      })
      setOrderNumber(order.orderNumber)
      setEarnedCoupon(order.generatedCoupon ?? null)
      setShowStatusPopup(true)
      rememberGuestOrderAccess(
        order.orderId,
        order.orderAccessToken,
        order.orderAccessExpiresAt,
        true,
        order.createdAt,
      )
      if (isAuthenticated) {
        checkoutService.getAllHistory()
          .then((history) => {
            setActiveOrderCount(history.filter((historyOrder) => !TERMINAL_ORDER_STATUSES.has(historyOrder.status)).length)
          })
          .catch((historyError) => {
            console.error("Nao foi possivel verificar pedidos em curso.", historyError)
            setActiveOrderCount(null)
          })
      } else {
        const guestAccesses = readGuestOrderAccesses()
        Promise.allSettled(
          guestAccesses.map((access) => checkoutService.getOrder(access.orderId, access.accessToken)),
        ).then((results) => {
          const activeCount = results.filter(
            (result) => result.status === "fulfilled" && !TERMINAL_ORDER_STATUSES.has(result.value.status),
          ).length
          setActiveOrderCount(activeCount || guestAccesses.length)
        })
      }
      cartService.finishCheckout()
      if (isAuthenticated && !user?.taxId && form.taxId.trim()) {
        await refreshUser()
      }
      toast.success(t("checkout.success"))
    } catch (err) {
      const message = err instanceof Error ? err.message : t("checkout.errors.placeOrder")
      setFormError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <section className="checkout-page site-page">
        <main className="checkout-shell checkout-confirmation-shell">
          <div className="checkout-loading">{t("checkout.session")}</div>
        </main>
      </section>
    )
  }

  if (orderNumber) {
    const confirmationItems = confirmedOrder?.items ?? items
    const confirmationSubtotal = confirmedOrder?.subtotal ?? subtotal
    const confirmationDiscount = Math.min(confirmationSubtotal, Number(appliedCoupon?.discount ?? 0))
    const confirmationTotal = Math.max(0, confirmationSubtotal - confirmationDiscount)
    const confirmationCustomer = confirmedOrder?.customer ?? form
    const confirmationFulfillment = confirmedOrder?.fulfillmentMethod ?? fulfillment
    const confirmationPayment = confirmedOrder?.paymentMethod ?? payment
    const confirmationIsGuest = confirmedOrder?.isGuest ?? !isAuthenticated
    const purchaseDate = new Date(confirmedOrder?.createdAt ?? Date.now())
    const purchaseDateLabel = purchaseDate.toLocaleString(resolvedLocale(), { dateStyle: "medium", timeStyle: "short" })
    const estimatedTimeLabel = new Date(purchaseDate.getTime() + 18 * 60 * 1000).toLocaleTimeString(resolvedLocale(), {
      hour: "numeric",
      minute: "2-digit",
    })
    const rawStatus = confirmedOrder?.status ?? "confirmed"
    const readableStatus = ({
      pending: t("checkout.confirmation.status.pending"),
      confirmed: t("checkout.confirmation.status.confirmed"),
      in_preparation: t("checkout.confirmation.status.inPreparation"),
      ready: t("checkout.confirmation.status.ready"),
      delivered: t("checkout.confirmation.status.delivered"),
      cancelled: t("checkout.confirmation.status.cancelled"),
    } as Record<string, string>)[rawStatus] ?? rawStatus.replace(/_/g, " ")
    const paymentLabel = confirmationPayment === "counter" ? t("checkout.payment.counter") : confirmationPayment
    const paymentMethodLabel = t("checkout.payment.counter")
    const customerName = `${confirmationCustomer.firstName} ${confirmationCustomer.lastName}`.trim()
    const tableLabel = confirmationFulfillment === "dine_in" && confirmationCustomer.tableNumber
      ? t("checkout.fulfillment.table", { number: confirmationCustomer.tableNumber })
      : confirmationFulfillment === "takeaway"
        ? t("checkout.fulfillment.takeawayCounter")
        : t("checkout.fulfillment.counterDelivery")
    const imageForItem = (src?: string | null) => {
      return resolveProductImageUrl(src)
    }
    const paymentNote = t("checkout.payment.note")
    const confirmationMessage = confirmationIsGuest
      ? t("checkout.confirmation.guestMessage")
      : t("checkout.confirmation.accountMessage")
    const hasMultipleActiveOrders = activeOrderCount !== null && activeOrderCount > 1
    const highlightOrderStatus = () => {
      window.dispatchEvent(new Event("order-status-highlight"))
      setShowStatusPopup(false)
    }
    const goBack = () => {
      if (window.history.length > 1) {
        navigate(-1)
        return
      }

      navigate("/menu")
    }

    return (
      <section className="checkout-page site-page">
        <Navbar />
        {showStatusPopup && (
          <aside className="order-status-popup" role="status" aria-live="polite">
            <div className="order-status-popup-icon" aria-hidden="true">
              <Check size={18} strokeWidth={3} />
            </div>
            <div>
              <p className="order-status-popup-title">{t("checkout.confirmation.received")}</p>
              <p className="order-status-popup-copy">{t("checkout.confirmation.popup", { order: orderNumber, status: readableStatus, paymentNote })}</p>
            </div>
            <button type="button" onClick={() => setShowStatusPopup(false)} aria-label={t("checkout.confirmation.closeStatus")}>
              x
            </button>
          </aside>
        )}
        <main className="checkout-shell checkout-confirmation-shell confirmation-premium-shell">
          <div className="confirmation-premium-container">
            <div className="confirmation-top-actions">
              <button type="button" className="confirmation-back-action" onClick={goBack}>
                <ArrowLeft size={16} strokeWidth={2.4} />
                {t("checkout.confirmation.back")}
              </button>
              <Link to="/menu" className="confirmation-shop-action">
                {t("checkout.confirmation.continueShopping")}
              </Link>
            </div>

            <section className="confirmation-premium-hero" aria-labelledby="order-confirmation-title">
              <div className="confirmation-success-motion" aria-hidden="true">
                <svg className="confirmation-checkmark" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" />
                  <path d="M 29 52 L 44 67 L 72 35" />
                </svg>
              </div>

              <div className="confirmation-hero-copy">
                <p className="confirmation-kicker">{t("checkout.confirmation.kicker")}</p>
                <h1 id="order-confirmation-title">{t("checkout.confirmation.received")}</h1>
                <p>{confirmationMessage}</p>
              </div>

              <div className="confirmation-hero-metrics" aria-label={t("checkout.confirmation.details")}>
                <div>
                  <span>{t("checkout.confirmation.number")}</span>
                  <strong>{orderNumber}</strong>
                </div>
                <div>
                  <span>{t("checkout.summary.payment")}</span>
                  <strong>{t("checkout.confirmation.atCounter")}</strong>
                </div>
                <div>
                  <span>{t("checkout.confirmation.purchased")}</span>
                  <strong>{purchaseDateLabel}</strong>
                </div>
              </div>

              <div className="confirmation-email-banner">
                <Banknote size={20} strokeWidth={2.4} aria-hidden="true" />
                <span>{t("checkout.confirmation.paymentPendingNote")}</span>
              </div>
            </section>

            <div className="confirmation-premium-grid">
              <div className="confirmation-main-stack">
                <section className="confirmation-panel confirmation-restaurant-panel" aria-labelledby="restaurant-title">
                  <div className="confirmation-section-heading">
                    <div>
                      <p>{t("checkout.confirmation.restaurant")}</p>
                      <h2 id="restaurant-title">{t("checkout.confirmation.nextSteps")}</h2>
                    </div>
                    <button type="button" className="confirmation-text-link" onClick={highlightOrderStatus}>
                      {t("checkout.confirmation.showProgress")} <ArrowRight size={16} strokeWidth={2.4} />
                    </button>
                  </div>

                  <div className="confirmation-info-grid">
                    <div className="confirmation-info-tile">
                      <MapPin size={18} strokeWidth={2.4} />
                      <span>{t("checkout.confirmation.location")}</span>
                      <strong>{tableLabel}</strong>
                    </div>
                    <div className="confirmation-info-tile">
                      <Truck size={18} strokeWidth={2.4} />
                      <span>{t("checkout.confirmation.kitchenHandover")}</span>
                      <strong>{t("checkout.confirmation.afterPayment")}</strong>
                    </div>
                    <div className="confirmation-info-tile">
                      <ShoppingBag size={18} strokeWidth={2.4} />
                      <span>{t("checkout.confirmation.readyAround")}</span>
                      <strong>{estimatedTimeLabel}</strong>
                    </div>
                    <div className="confirmation-info-tile">
                      <Check size={18} strokeWidth={2.4} />
                      <span>{t("checkout.confirmation.currentStatus")}</span>
                      <strong>{readableStatus}</strong>
                    </div>
                  </div>
                </section>

                <section className="confirmation-panel confirmation-summary-panel" aria-labelledby="summary-title">
                  <button
                    className="confirmation-summary-toggle confirmation-summary-premium-toggle"
                    onClick={() => setShowOrderSummary(!showOrderSummary)}
                    aria-expanded={showOrderSummary}
                    aria-controls="confirmation-order-summary"
                    type="button"
                  >
                    <span>
                      <span className="summary-title" id="summary-title">{t("checkout.confirmation.summary")}</span>
                      <span className="summary-count">{t("checkout.confirmation.items", { count: confirmationItems.length })}</span>
                    </span>
                    <ChevronDown
                      className={`summary-toggle-icon ${showOrderSummary ? "open" : ""}`}
                      size={20}
                      strokeWidth={2.6}
                      aria-hidden="true"
                    />
                  </button>

                  <div className={`confirmation-summary-content confirmation-summary-premium-content ${showOrderSummary ? "open" : ""}`} id="confirmation-order-summary">
                    <div className="confirmation-items">
                      {confirmationItems.map((item) => {
                        const customizationLines = customizationSummary(item.customization)
                        return (
                          <div key={`${item.cartProductId}-${item.productId}`} className="confirmation-item confirmation-item-premium">
                            <img
                              src={imageForItem(productMediaUrl(item.media, "thumb"))}
                              alt=""
                              onError={(event) => {
                                applyApiImageFallback(event.currentTarget)
                              }}
                            />
                            <div className="item-details">
                              <div>
                                <p className="item-name">{item.name}</p>
                                <p className="item-meta">{t("checkout.confirmation.quantityShort", { count: item.quantity })}</p>
                                {customizationLines.length > 0 && (
                                  <p className="item-customizations">{customizationLines.join(" | ")}</p>
                                )}
                              </div>
                            </div>
                            <span className="item-price">{formatEuro(item.subtotal)}</span>
                          </div>
                        )
                      })}
                    </div>

                    <div className="confirmation-totals">
                      <div className="total-row">
                        <span>{t("checkout.summary.subtotalVat")}</span>
                        <strong>{formatEuro(confirmationSubtotal)}</strong>
                      </div>
                      {confirmationDiscount > 0 && (
                        <div className="total-row">
                          <span>{t("checkout.confirmation.discounts")}</span>
                          <strong>-{formatEuro(confirmationDiscount)}</strong>
                        </div>
                      )}
                      <div className="total-row payment-row">
                        <span>{t("checkout.payment.title")}</span>
                        <strong>{paymentMethodLabel}</strong>
                      </div>
                      <div className="total-row final">
                        <span>{t("checkout.summary.totalDue")}</span>
                        <strong>{formatEuro(confirmationTotal)}</strong>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="confirmation-panel confirmation-support-panel" aria-labelledby="support-title">
                  <div className="confirmation-section-heading">
                    <div>
                      <p>{t("checkout.confirmation.supportLabel")}</p>
                      <h2 id="support-title">{t("checkout.confirmation.supportHeading")}</h2>
                    </div>
                  </div>
                  <div className="trust-card-grid">
                    <div className="trust-card">
                      <MailCheck size={22} strokeWidth={2.4} />
                      <strong>{t("checkout.confirmation.receiptAfterPayment")}</strong>
                      <span>{t("checkout.confirmation.receiptText")}</span>
                    </div>

                    <div className="trust-card">
                      <ShoppingBag size={22} strokeWidth={2.4} />
                      <strong>{t("checkout.confirmation.kitchenUpdates")}</strong>
                      <span>{t("checkout.confirmation.kitchenUpdatesText")}</span>
                    </div>
                    <div className="trust-card">
                      <Headphones size={22} strokeWidth={2.4} />
                      <strong>{t("checkout.confirmation.supportTitle")}</strong>
                      <span>{t("checkout.confirmation.supportText")}</span>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="confirmation-receipt-card" aria-label={t("checkout.confirmation.summary")}>
                <div className="receipt-card-top">
                  <ReceiptText size={24} strokeWidth={2.4} aria-hidden="true" />
                  <div>
                    <p>{t("checkout.confirmation.shortSummary")}</p>
                    <h2>{t("checkout.confirmation.orderLabel", { number: orderNumber })}</h2>
                  </div>
                </div>

                <div className="receipt-detail-list">
                  <div>
                    <span>{t("checkout.confirmation.customer")}</span>
                    <strong>{customerName || t("checkout.confirmation.customer")}</strong>
                  </div>
                  <div>
                    <span>{t("checkout.summary.payment")}</span>
                    <strong>{paymentLabel}</strong>
                  </div>
                  <div>
                    <span>{t("checkout.summary.type")}</span>
                    <strong>{confirmationFulfillment === "dine_in" ? t("checkout.fulfillment.dineIn") : t("checkout.fulfillment.takeaway")}</strong>
                  </div>
                  <div>
                    <span>{t("checkout.confirmation.handoff")}</span>
                    <strong>{tableLabel}</strong>
                  </div>
                  <div>
                    <span>{t("checkout.confirmation.statusLabel")}</span>
                    <strong>{readableStatus}</strong>
                  </div>
                  <div>
                    <span>{t("checkout.summary.totalDue")}</span>
                    <strong>{formatEuro(confirmationTotal)}</strong>
                  </div>
                </div>

                {earnedCoupon && (
                  <div className="loyalty-callout">
                    <Sparkles size={18} strokeWidth={2.4} aria-hidden="true" />
                    <span>{t("checkout.confirmation.earnedVoucher", { code: earnedCoupon })}</span>
                  </div>
                )}

                {hasMultipleActiveOrders && (
                  <div className="multi-order-callout">
                    <ShoppingBag size={18} strokeWidth={2.4} aria-hidden="true" />
                    <span>
                      {t("checkout.confirmation.multipleOrders", { count: activeOrderCount })}{" "}
                      <Link to={confirmationIsGuest ? "/orders" : "/profile?tab=orders"}>{t("checkout.confirmation.myOrders")}</Link>.
                    </span>
                  </div>
                )}

                <div className="receipt-actions">
                  <button type="button" className="bonefree-button confirmation-primary-action" onClick={highlightOrderStatus}>
                    {t("checkout.confirmation.track")}
                  </button>
                  <Link to={`/orders/${confirmedOrder?.orderId ?? ""}`} className="confirmation-secondary-action">
                    {t("checkout.confirmation.viewDetails")}
                  </Link>
                  {confirmationIsGuest && (
                    <Link to="/login" state={{ from: "/menu" }} className="confirmation-secondary-action">
                      {t("checkout.confirmation.guestAccount")}
                    </Link>
                  )}
                  <button type="button" className="confirmation-secondary-action" onClick={goBack}>
                    <ArrowLeft size={16} strokeWidth={2.4} />
                    {t("checkout.confirmation.back")}
                  </button>
                  <Link to="/menu" className="confirmation-secondary-action">
                    {t("checkout.confirmation.continueShopping")}
                  </Link>
                  <Link to="/contact" className="confirmation-secondary-action">
                    {t("checkout.confirmation.support")}
                  </Link>
                </div>
              </aside>
            </div>
          </div>

          <div className="confirmation-mobile-cta" aria-label={t("checkout.confirmation.actions")}>
            <div>
              <span>{t("checkout.summary.totalDue")}</span>
              <strong>{formatEuro(confirmationTotal)}</strong>
            </div>
            <button type="button" className="bonefree-button" onClick={highlightOrderStatus}>
              {t("checkout.confirmation.track")}
            </button>
          </div>
        </main>
      </section>
    )
  }

  return (
    <section className="checkout-page site-page">
      <Navbar />

      <main className="checkout-shell">
        <div className="checkout-header">
          <div>
            <p className="checkout-eyebrow">{t("checkout.eyebrow")}</p>
            <h1>{t("checkout.title")}</h1>
          </div>
          <Link to="/cart" className="bonefree-button-secondary">{t("checkout.backCart")}</Link>
        </div>

        {!loading && items.length > 0 && checkoutUpsells.length > 0 && (
          <section className="checkout-upsell-funnel glass-panel" aria-label={t("checkout.upsell.aria")}>
            <div className="checkout-upsell-heading">
              <div>
                <span>{t("checkout.upsell.addToOrder")}</span>
                <strong>{t("checkout.upsell.title")}</strong>
              </div>
              <small>{t("checkout.upsell.beforeFinish")}</small>
            </div>
            <div className="checkout-upsell-list">
              {checkoutUpsells.map((product) => {
                const label = getUpsellLabel(product)
                const busy = upsellBusyId === product.id
                return (
                  <article key={product.id} className="checkout-upsell-item">
                    <img src={checkoutImageUrl(primaryProductMediaUrl(product.media, "thumb"))} alt="" onError={(event) => applyApiImageFallback(event.currentTarget)} />
                    <div>
                      <span>{t(`checkout.upsell.groups.${label ?? "add"}`)}</span>
                      <strong>{product.name}</strong>
                      <small>{formatEuro(product.price)}</small>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAddUpsell(product)}
                      disabled={busy}
                      aria-label={t("checkout.upsell.addNamed", { name: product.name })}
                    >
                      {busy ? <LoaderCircle className="checkout-item-spinner" size={15} aria-hidden="true" /> : "+"}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {error && (
          <div className="checkout-alert" role="alert">
            {error}
            <button type="button" onClick={clearError}>{t("checkout.close")}</button>
          </div>
        )}

        {loading ? (
          <div className="checkout-loading">{t("checkout.load")}</div>
        ) : items.length === 0 ? (
          <div className="checkout-empty glass-panel">
            <h2>{t("checkout.empty.title")}</h2>
            <p>{t("checkout.empty.text")}</p>
            <Link to="/menu" className="bonefree-button">{t("checkout.empty.menu")}</Link>
          </div>
        ) : (
          <form className="checkout-grid" onSubmit={handleSubmit}>
            <div className="checkout-main">
              <section className="checkout-panel glass-panel">
                <div className="checkout-panel-header">
                  <span>1</span>
                  <div>
                    <h2>{t("checkout.customer.title")}</h2>
                    <p>{t("checkout.customer.description")}</p>
                  </div>
                </div>

                <div className="checkout-fields two-columns">
                  <label>
                    {t("fields.firstName", { ns: "common" })}
                    <input
                      className={fieldErrors.firstName ? "is-invalid" : ""}
                      value={form.firstName}
                      onChange={(e) => updateForm("firstName", e.target.value)}
                      autoComplete="given-name"
                      aria-invalid={Boolean(fieldErrors.firstName)}
                    />
                    {fieldErrors.firstName && (
                      <small className="field-error">{fieldErrors.firstName}</small>
                    )}
                  </label>

                  <label>
                    {t("fields.lastName", { ns: "common" })}
                    <input
                      className={fieldErrors.lastName ? "is-invalid" : ""}
                      value={form.lastName}
                      onChange={(e) => updateForm("lastName", e.target.value)}
                      autoComplete="family-name"
                      aria-invalid={Boolean(fieldErrors.lastName)}
                    />
                    {fieldErrors.lastName && (
                      <small className="field-error">{fieldErrors.lastName}</small>
                    )}
                  </label>
                </div>

                <div className="checkout-fields two-columns">
                  <label>
                    {t("fields.email", { ns: "common" })} ({t("checkout.fulfillment.optional").toLocaleLowerCase(resolvedLocale())})
                    <input
                      className={fieldErrors.email ? "is-invalid" : ""}
                      type="email"
                      value={form.email}
                      onChange={(e) => updateForm("email", e.target.value)}
                      autoComplete="email"
                      inputMode="email"
                      aria-invalid={Boolean(fieldErrors.email)}
                    />
                    {fieldErrors.email && (
                      <small className="field-error">{fieldErrors.email}</small>
                    )}
                  </label>

                  <label>
                    {t("fields.phone", { ns: "common" })} ({t("checkout.fulfillment.optional").toLocaleLowerCase(resolvedLocale())})
                    <input
                      value={form.phone}
                      onChange={(e) => updateForm("phone", e.target.value)}
                      className={fieldErrors.phone ? "is-invalid" : ""}
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="+351 912 345 678"
                      aria-invalid={Boolean(fieldErrors.phone)}
                    />
                    {fieldErrors.phone && (
                      <small className="field-error">{fieldErrors.phone}</small>
                    )}
                  </label>
                </div>

                <div className="checkout-fields two-columns">
                  <label>
                    {t("fields.taxId", { ns: "common" })} ({t("checkout.fulfillment.optional").toLocaleLowerCase(resolvedLocale())})
                    <input
                      value={form.taxId}
                      onChange={(e) => updateForm("taxId", e.target.value)}
                      className={fieldErrors.taxId ? "is-invalid" : ""}
                      autoComplete="off"
                      inputMode="numeric"
                      maxLength={9}
                      placeholder={t("checkout.fulfillment.optional")}
                      aria-invalid={Boolean(fieldErrors.taxId)}
                    />
                    {fieldErrors.taxId && (
                      <small className="field-error">{fieldErrors.taxId}</small>
                    )}
                  </label>
                </div>

                {isAuthenticated ? (
                  <div className="checkout-fiscal-note">
                    <ReceiptText size={17} strokeWidth={2.4} aria-hidden="true" />
                    <p>
                      {t("checkout.customer.fiscalBefore")}{" "}
                      <Link to="/profile?tab=personal">{t("checkout.customer.profile")}</Link>{" "}{t("checkout.customer.fiscalAfter")}
                    </p>
                  </div>
                ) : (
                  <div className="checkout-fiscal-note">
                    <Sparkles size={17} strokeWidth={2.4} aria-hidden="true" />
                    <p>
                      {t("checkout.customer.guestBefore")}{" "}
                      <Link to="/login" state={{ from: "/checkout" }}>{t("checkout.customer.signIn")}</Link>{" "}{t("checkout.customer.guestOr")}{" "}
                      <Link to="/register" state={{ from: "/checkout" }}>{t("checkout.customer.register")}</Link>.
                    </p>
                  </div>
                )}


                <div className="checkout-table-number">
                  <div className="checkout-fulfillment-options" role="radiogroup" aria-label={t("checkout.fulfillment.label")}>
                    {fulfillmentOptions.map(({ value, labelKey, descriptionKey, icon: Icon }) => (
                      <label key={value} className={`fulfillment-pill ${fulfillment === value ? "active" : ""}`}>
                        <input
                          type="radio"
                          name="fulfillment"
                          value={value}
                          checked={fulfillment === value}
                          onChange={() => setFulfillment(value)}
                        />
                        <span className="fulfillment-pill-icon">
                          <Icon size={20} strokeWidth={2.4} aria-hidden="true" />
                        </span>
                        <span className="fulfillment-pill-text">
                          <strong>{t(labelKey)}</strong>
                          <small>{t(descriptionKey)}</small>
                        </span>
                      </label>
                    ))}
                  </div>

                  {fulfillment === "dine_in" && (
                    <label className="checkout-table-field">
                      <span className="checkout-field-label-row">
                        <span>{t("checkout.fulfillment.tableNumber")}</span>
                        <span>{t("checkout.fulfillment.optional")}</span>
                      </span>
                      <span className="checkout-table-input-wrap">
                        <MapPin size={18} strokeWidth={2.4} aria-hidden="true" />
                        <input
                          type="number"
                          min="1"
                          max={MAX_TABLE_NUMBER}
                          value={form.tableNumber}
                          onChange={(e) => updateForm("tableNumber", e.target.value)}
                          className={fieldErrors.tableNumber ? "is-invalid" : ""}
                          placeholder={t("checkout.fulfillment.tablePlaceholder", { max: MAX_TABLE_NUMBER })}
                        />
                      </span>
                      {fieldErrors.tableNumber && <small className="field-error">{fieldErrors.tableNumber}</small>}
                      <small>{t("checkout.fulfillment.tableHelp")}</small>
                    </label>
                  )}


                </div>
              </section>

              <section className="checkout-panel glass-panel">
                <div className="checkout-panel-header">
                  <span>2</span>
                  <div>
                    <h2>{t("checkout.payment.title")}</h2>
                    <p>{t("checkout.payment.description")}</p>
                  </div>
                </div>

                <div className="checkout-payment-pills" role="note" aria-label={t("checkout.payment.counter")}>
                  <div className="payment-pill active">
                    <span className="payment-pill-icon">
                      <Banknote size={20} strokeWidth={2.4} aria-hidden="true" />
                    </span>
                    <span className="payment-pill-text">
                      <strong>{t("checkout.payment.counter")}</strong>
                      <small>{t("checkout.payment.counterDescription")}</small>
                    </span>
                  </div>
                </div>

              </section>

            </div>

            <aside className="checkout-summary">
              <div className="checkout-summary-card glass-panel">
                <h2>{t("checkout.summary.title")}</h2>

                <div className="checkout-summary-items checkout-mini-cart">
                  {items.map((item) => {
                    const customizationLines = customizationSummary(item.customization)
                    const busy = cartBusyKey === `${item.cartProductId}-${item.productId}`
                    return (
                      <div key={`${item.cartProductId}-${item.productId}`} className="checkout-summary-item checkout-summary-item-detailed checkout-mini-cart-item">
                        <img src={checkoutImageUrl(productMediaUrl(item.media, "thumb"))} alt={item.name} onError={(event) => applyApiImageFallback(event.currentTarget)} />
                        <div className="checkout-mini-cart-copy">
                          <span>
                            {item.name}
                            {customizationLines.length > 0 && (
                              <small>{customizationLines.join(" | ")}</small>
                            )}
                            {!item.available && (
                              <small className="checkout-form-error">{item.unavailableReason || t("checkout.summary.unavailable")}</small>
                            )}
                          </span>
                          <div className="checkout-mini-cart-actions">
                            <div className="checkout-qty-control" aria-label={t("checkout.summary.quantity", { name: item.name })}>
                              <button type="button" onClick={() => handleQuantityChange(item, item.quantity - 1)} disabled={busy} aria-label={t("checkout.summary.decrease", { name: item.name })}>-</button>
                              <strong>{busy ? <LoaderCircle className="checkout-item-spinner" size={15} aria-hidden="true" /> : item.quantity}</strong>
                              <button type="button" onClick={() => handleQuantityChange(item, item.quantity + 1)} disabled={busy || item.quantity >= 99} aria-label={t("checkout.summary.increase", { name: item.name })}>+</button>
                            </div>
                            <strong>{formatEuro(item.subtotal)}</strong>
                            <button type="button" className="checkout-remove-item" onClick={() => handleRemoveItem(item)} disabled={busy} aria-label={t("checkout.summary.remove", { name: item.name })}>
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="checkout-totals">
                  <div><span>{t("checkout.summary.subtotal")}</span><strong>{formatEuro(subtotalExVat)}</strong></div>
                  <div><span>{t("checkout.summary.vat")}</span><strong>{formatEuro(vatAmount)}</strong></div>
                  {discount > 0 && <div><span>{t("checkout.summary.voucher")}</span><strong>-{formatEuro(discount)}</strong></div>}
                  <div className="checkout-total-line"><span>{t("checkout.summary.total")}</span><strong>{formatEuro(total)}</strong></div>
                  <p className="checkout-vat-note">{t("checkout.summary.vatIncluded")}</p>
                </div>

                <div className="checkout-meta">
                  <div>
                    <span>{t("checkout.summary.type")}</span>
                    <strong>{fulfillment === "dine_in" ? t("checkout.fulfillment.dineIn") : t("checkout.fulfillment.takeaway")}</strong>
                  </div>
                  <div>
                    <span>{t("checkout.summary.location")}</span>
                    <strong>{fulfillment === "takeaway" ? t("checkout.fulfillment.takeawayCounter") : form.tableNumber ? t("checkout.fulfillment.table", { number: form.tableNumber }) : t("checkout.fulfillment.counterDelivery")}</strong>
                  </div>
                  <div>
                    <span>{t("checkout.summary.payment")}</span>
                    <strong>{payment === "counter" ? t("checkout.payment.counter") : payment}</strong>
                  </div>
                </div>

                {isAuthenticated && (
                <div className={`checkout-coupon-card ${showCouponEntry || appliedCoupon ? "open" : ""}`}>
                  <button
                    type="button"
                    className="checkout-coupon-toggle"
                    onClick={() => setShowCouponEntry((current) => !current)}
                    aria-expanded={showCouponEntry}
                    aria-controls="checkout-coupon-entry"
                  >
                    <span><Sparkles size={16} strokeWidth={2.4} /> {t("checkout.coupon.prompt")}</span>
                    <strong>{appliedCoupon ? `-${formatEuro(appliedCoupon.discount)}` : t("checkout.coupon.addCode")}</strong>
                  </button>

                  {showCouponEntry && (
                    <div className="checkout-promo-code" id="checkout-coupon-entry">
                      <label>
                        {t("checkout.coupon.label")}
                        <div className="checkout-promo-row">
                          <input
                            list="available-coupons"
                            value={form.promoCode}
                            onChange={(e) => updateForm("promoCode", e.target.value)}
                            placeholder={t("checkout.coupon.placeholder")}
                          />
                          <button type="button" onClick={handleApplyCoupon} disabled={isApplyingCoupon || subtotal <= 0}>
                            {isApplyingCoupon ? t("checkout.coupon.applying") : t("actions.apply", { ns: "common" })}
                          </button>
                        </div>
                        <datalist id="available-coupons">
                          {availableCoupons.map((coupon) => (
                            <option key={coupon.couponId} value={coupon.code}>
                              {t("checkout.coupon.valueOff", { value: formatEuro(coupon.value) })}
                            </option>
                          ))}
                        </datalist>
                        {appliedCoupon && (
                          <small>{t("checkout.coupon.applied", { discount: formatEuro(appliedCoupon.discount) })}</small>
                        )}
                      </label>
                    </div>
                  )}
                </div>
                )}

                {formError && <p className="checkout-form-error">{formError}</p>}

                {hasUnavailableItems && (
                  <p className="checkout-form-error">{t("checkout.validation.unavailableContinue")}</p>
                )}

                <p className="checkout-prototype-notice">{t("checkout.prototypeNotice")}</p>

                <button type="submit" className="checkout-submit bonefree-button" disabled={isSubmitting || items.length === 0 || hasUnavailableItems}>

                  {isSubmitting ? t("checkout.submitting") : t("checkout.submit", { total: formatEuro(total) })}
                </button>
              </div>
            </aside>
          </form>
        )}
      </main>
    </section>
  )
}

export default Checkout
