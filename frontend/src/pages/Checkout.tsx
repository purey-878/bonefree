import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import {
  ArrowRight,
  ArrowLeft,
  Banknote,
  Check,
  ChevronDown,
  CreditCard,
  Download,
  Headphones,
  MailCheck,
  MapPin,
  LoaderCircle,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  Smartphone,
  Truck,
  Trash2,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import Navbar from "../components/Navbar"
import { useToast } from "../components/ui/toastContext"
import { useAuth, useCart } from "../hooks"
import { cartService, checkoutService, customizationSummary, productService } from "../services"
import { rememberActiveOrder } from "../components/orderStatusStorage"
import type { CartItem, GuestCartItem } from "../types/cart"
import type { Coupon, CouponValidation, FulfillmentMethod, PaymentMethod } from "../types/checkout"
import type { Product } from "../types/product"
import { resolveProductImageUrl, useApiImageFallback } from "../utils/imageFallback"
import { validateEmail, validateName, validateNif } from "../utils/validation"
import type { FieldErrors } from "../utils/validation"
import { formatEuro } from "../utils/money"
import "./Checkout.css"

interface CheckoutForm {
  firstName: string
  lastName: string
  email: string
  nif: string
  tableNumber: string
  promoCode: string
}

interface CardForm {
  number: string
  expiry: string
  cvv: string
  holder: string
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
}

const initialForm: CheckoutForm = {
  firstName: "",
  lastName: "",
  email: "",
  nif: "",
  tableNumber: "",
  promoCode: "",
}

const initialCardForm: CardForm = {
  number: "",
  expiry: "",
  cvv: "",
  holder: "",
}

const VAT_RATE = 0.13
const MAX_TABLE_NUMBER = 30
const TERMINAL_ORDER_STATUSES = new Set(["entregue", "servido", "cancelada", "reembolsada"])

const paymentOptions: Array<{ value: PaymentMethod; label: string; icon: typeof CreditCard }> = [
  { value: "cash", label: "Pagar ao balcão", icon: Banknote },
  { value: "card", label: "Cartão", icon: CreditCard },
  { value: "mbway", label: "MB Way", icon: Smartphone },
]

const fulfillmentOptions: Array<{ value: FulfillmentMethod; label: string; description: string; icon: typeof ShoppingBag }> = [
  { value: "dine_in", label: "Comer no restaurante", description: "Coma na BONEFREE com serviço à mesa opcional.", icon: MapPin },
  { value: "takeaway", label: "Para levar", description: "Embalado para levar ao balcão.", icon: ShoppingBag },
]

const upsellGroups = [
  {
    label: "Molho extra",
    keywords: ["molho", "sauce", "aioli", "ketchup", "maionese", "maionese alho", "mostarda", "sriracha"],
  },
  {
    label: "Bebida",
    keywords: ["bebida", "bebidas", "drink", "agua", "sumo", "refrigerante", "cola", "coca", "fanta", "sprite", "ice tea", "limonada", "fritz", "cafe", "americano", "expresso", "cappuccino"],
  },
  {
    label: "Extra",
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
  const isAlcoholic = Boolean(product.contains_alcohol) || blockedDrinkKeywords.some((keyword) => searchable.includes(keyword))

  if (!isAlcoholic && upsellGroups[1].keywords.some((keyword) => searchable.includes(keyword))) {
    return "Bebida"
  }

  const looksLikeSauce = upsellGroups[0].keywords.some((keyword) => searchable.includes(keyword))
  const looksLikeMainDish = blockedMainDishKeywords.some((keyword) => searchable.includes(keyword))
  if (looksLikeSauce && !looksLikeMainDish) {
    return "Molho extra"
  }

  const looksLikeSmallExtra = upsellGroups[2].keywords.some((keyword) => searchable.includes(keyword))
  if (looksLikeSmallExtra && !looksLikeMainDish) {
    return "Extra"
  }

  return null
}

function isCartItem(item: CartItem | GuestCartItem): item is CartItem {
  return "nome" in item
}

function getFulfillmentLabel(method: FulfillmentMethod) {
  return fulfillmentOptions.find((option) => option.value === method)?.label ?? method
}

function getPaymentMethodLabel(method: PaymentMethod) {
  return paymentOptions.find((option) => option.value === method)?.label ?? method
}

function checkoutImageUrl(src?: string | null) {
  return resolveProductImageUrl(src)
}

function formatCardNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim()
}

function cardType(value: string) {
  const digits = value.replace(/\D/g, "")
  if (/^4/.test(digits)) return "Visa"
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard"
  if (/^3[47]/.test(digits)) return "Amex"
  return digits.length ? "Cartão" : ""
}

function luhnValid(value: string) {
  const digits = value.replace(/\D/g, "")
  if (digits.length < 12) return false
  let sum = 0
  let alternate = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let number = Number(digits[index])
    if (alternate) {
      number *= 2
      if (number > 9) number -= 9
    }
    sum += number
    alternate = !alternate
  }
  return sum % 10 === 0
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

function validateCard(card: CardForm): FieldErrors<keyof CardForm> {
  const errors: FieldErrors<keyof CardForm> = {}
  const digits = card.number.replace(/\D/g, "")
  if (!luhnValid(card.number)) errors.number = "Introduza um número de cartão válido."
  const [monthRaw, yearRaw] = card.expiry.split("/")
  const month = Number(monthRaw)
  const year = Number(yearRaw)
  const now = new Date()
  const expiryDate = new Date(2000 + year, month)
  if (!/^\d{2}\/\d{2}$/.test(card.expiry) || month < 1 || month > 12 || expiryDate <= new Date(now.getFullYear(), now.getMonth())) {
    errors.expiry = "Introduza uma data de validade futura válida."
  }
  if (!/^\d{3,4}$/.test(card.cvv)) errors.cvv = "O CVV deve ter 3 ou 4 dígitos."
  if (!card.holder.trim() || !/^[A-Za-zÀ-ÖØ-öø-ÿ '’-]+$/.test(card.holder.trim())) {
    errors.holder = "Introduza o nome do titular do cartão."
  }
  if (cardType(card.number) === "Amex" && digits.length !== 15) errors.number = "Os cartões Amex devem ter 15 dígitos."
  return errors
}

function Checkout() {
  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading, refreshUser } = useAuth()
  const { cart, loading, error, clearError, addItem, updateQuantity, removeItem } = useCart()
  const toast = useToast()
  const [form, setForm] = useState(initialForm)
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>("dine_in")
  const [payment, setPayment] = useState<PaymentMethod>("card")
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
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false)
  const [receiptDownloadError, setReceiptDownloadError] = useState<string | null>(null)
  const [activeOrderCount, setActiveOrderCount] = useState<number | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof CheckoutForm>>({})
  const [cardForm, setCardForm] = useState<CardForm>(initialCardForm)
  const [cardErrors, setCardErrors] = useState<FieldErrors<keyof CardForm>>({})
  const [cartBusyKey, setCartBusyKey] = useState<string | null>(null)
  const [upsellProducts, setUpsellProducts] = useState<Product[]>([])
  const [upsellBusyId, setUpsellBusyId] = useState<number | null>(null)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login", { replace: true, state: { from: "/checkout" } })
    }
  }, [authLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (!user) return
    setForm((current) => ({
      ...current,
      firstName: user.nome ?? "",
      lastName: user.apelido ?? "",
      email: user.email ?? "",

      nif: user.nif ?? "",
    }))
  }, [user])

  useEffect(() => {
    if (fulfillment !== "takeaway") return
    setForm((current) => current.tableNumber ? { ...current, tableNumber: "" } : current)
    setFieldErrors((current) => ({ ...current, tableNumber: undefined }))
  }, [fulfillment])

  const items = useMemo<CartItem[]>(
    () => cart?.itens?.flatMap((item) => isCartItem(item) ? [item] : []) ?? [],
    [cart],
  )
  const subtotal = Number(cart?.total ?? 0)
  const discount = Math.min(subtotal, Number(appliedCoupon?.desconto ?? 0))
  const total = Math.max(0, subtotal - discount)
  const vatAmount = total - total / (1 + VAT_RATE)
  const subtotalExVat = total - vatAmount
  const checkoutUpsells = useMemo(() => {
    const cartProductIds = new Set(items.map((item) => item.id_produto))
    const candidates = upsellProducts
      .map((product) => ({ product, label: getUpsellLabel(product) }))
      .filter(({ product, label }) => {
        const hasStock = product.stock > 0 && product.available !== false && !product.unavailable_due_to_inactive_base
        return hasStock && !cartProductIds.has(product.id) && Boolean(label)
      })
      .sort((a, b) => {
        const aGroup = upsellGroups.findIndex((group) => group.label === a.label)
        const bGroup = upsellGroups.findIndex((group) => group.label === b.label)
        return aGroup - bGroup || a.product.price - b.product.price
      })

    const sauces = candidates.filter((item) => item.label === "Molho extra").slice(0, 2)
    const drinks = candidates.filter((item) => item.label === "Bebida").slice(0, 2)
    const selected = [...drinks, ...sauces]
    const selectedIds = new Set(selected.map((item) => item.product.id))
    const fillers = candidates
      .filter((item) => item.label === "Extra" && !selectedIds.has(item.product.id))
      .slice(0, Math.max(0, 4 - selected.length))

    return [...selected, ...fillers].map((item) => item.product)
  }, [items, upsellProducts])

  useEffect(() => {
    if (!isAuthenticated) return

    checkoutService.getCoupons()
      .then(setAvailableCoupons)
      .catch((err) => console.error("Não foi possível carregar cupões.", err))
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return

    productService.getAll()
      .then(setUpsellProducts)
      .catch((err) => console.error("Não foi possível carregar extras do checkout.", err))
  }, [isAuthenticated])

  const updateForm = (field: keyof CheckoutForm, value: string) => {
    const nextValue = value
    setForm((current) => ({ ...current, [field]: nextValue }))
    setFormError(null)
    const validators: Partial<Record<keyof CheckoutForm, (input: string) => string>> = {
      firstName: validateName,
      lastName: validateName,
      email: validateEmail,
      nif: (input) => validateNif(input),
    }
    const nextError = validators[field]?.(nextValue) ?? ""
    setFieldErrors((current) => ({ ...current, [field]: nextError || undefined }))
    if (field === "promoCode") setAppliedCoupon(null)
  }

  const updateCardField = (field: keyof CardForm, value: string) => {
    const nextValue = field === "number"
      ? formatCardNumber(value)
      : field === "expiry"
        ? formatExpiry(value)
        : field === "cvv"
          ? value.replace(/\D/g, "").slice(0, 4)
          : value
    const nextCard = { ...cardForm, [field]: nextValue }
    setCardForm(nextCard)
    setCardErrors(validateCard(nextCard))
  }

  const validate = () => {
    const errors: FieldErrors<keyof CheckoutForm> = {}
    const firstNameError = validateName(form.firstName)
    const lastNameError = validateName(form.lastName)
    const emailError = validateEmail(form.email)
    const nifError = validateNif(form.nif)
    if (firstNameError) errors.firstName = firstNameError
    if (lastNameError) errors.lastName = lastNameError
    if (emailError) errors.email = emailError
    if (nifError) errors.nif = nifError

    const tableValue = form.tableNumber.trim()
    const tableNum = Number(tableValue)
    if (fulfillment === "dine_in" && tableValue && (!Number.isInteger(tableNum) || tableNum < 1 || tableNum > MAX_TABLE_NUMBER)) {
      errors.tableNumber = `Introduza um número de mesa válido (1-${MAX_TABLE_NUMBER}).`
    }

    if (items.length === 0) {
      return "O carrinho está vazio."
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return "Corrija os campos assinalados."
    if (payment === "card") {
      const nextCardErrors = validateCard(cardForm)
      setCardErrors(nextCardErrors)
      if (Object.keys(nextCardErrors).length > 0) return "Corrija os campos do cartão assinalados."
    }
    return null
  }

  const handleQuantityChange = async (item: CartItem, quantity: number) => {
    const key = `${item.cart_log_id}-${item.id_produto}`
    try {
      setCartBusyKey(key)
      setFormError(null)
      await updateQuantity(item.id_produto, quantity, item.stock, item.cart_log_id, item.customizacao)
      if (appliedCoupon) setAppliedCoupon(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível atualizar este artigo."
      setFormError(message)
      toast.error(message)
    } finally {
      setCartBusyKey(null)
    }
  }

  const handleRemoveItem = async (item: CartItem) => {
    const key = `${item.cart_log_id}-${item.id_produto}`
    try {
      setCartBusyKey(key)
      setFormError(null)
      await removeItem(item.id_produto, item.cart_log_id, item.customizacao)
      if (appliedCoupon) setAppliedCoupon(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível remover este artigo."
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
      await addItem(product.id, 1, product.stock)
      if (appliedCoupon) setAppliedCoupon(null)
      toast.success(`${product.name} adicionado ao pedido.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : `Não foi possível adicionar ${product.name}.`
      setFormError(message)
      toast.error(message)
    } finally {
      setUpsellBusyId(null)
    }
  }

  const handleApplyCoupon = async () => {
    const code = form.promoCode.trim()
    if (!code) {
      setFormError("Introduza primeiro um código de cupão.")
      toast.warning("Introduza primeiro um código de cupão.")
      return
    }

    try {
      setIsApplyingCoupon(true)
      setFormError(null)
      setAppliedCoupon(await checkoutService.validateCoupon(code, subtotal))
      toast.success("Cupão aplicado com sucesso.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível aplicar o cupão."
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
      setReceiptDownloadError(null)
      const order = await checkoutService.createOrder({
        customer: {
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          email: form.email.trim(),
          nif: form.nif.trim() || null,
          table_number: fulfillment === "dine_in" && form.tableNumber.trim() ? parseInt(form.tableNumber, 10) : null,
        },
        fulfillment_method: fulfillment,
        payment_method: payment,
        promo_code: appliedCoupon?.codigo ?? null,
        items: items.map((item) => ({
          id_produto: item.id_produto,
          quantidade: item.quantidade,
          customizacao: item.customizacao ?? null,
        })),
      })
      setConfirmedOrder({
        items,
        subtotal,
        status: order.status,
        fulfillmentMethod: order.metodo_entrega,
        paymentMethod: order.metodo_pagamento,
        customer: { ...form },
        createdAt: new Date().toISOString(),
        orderId: order.id_pedido,
      })
      setOrderNumber(order.numero_pedido)
      setEarnedCoupon(order.cupom_gerado ?? null)
      setShowStatusPopup(true)
      rememberActiveOrder(order.id_pedido)
      checkoutService.getHistory()
        .then((history) => {
          setActiveOrderCount(history.filter((historyOrder) => !TERMINAL_ORDER_STATUSES.has(historyOrder.status)).length)
        })
        .catch((historyError) => {
          console.error("Nao foi possivel verificar pedidos em curso.", historyError)
          setActiveOrderCount(null)
        })
      cartService.finishCheckout()
      if (!user?.nif && form.nif.trim()) {
        await refreshUser()
      }
      toast.success("Pedido efetuado com sucesso.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível efetuar o pedido."
      setFormError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDownloadReceipt = async () => {
    if (!confirmedOrder?.orderId) {
      setReceiptDownloadError("O recibo ainda não está pronto.")
      toast.warning("O recibo ainda não está pronto.")
      return
    }

    try {
      setIsDownloadingReceipt(true)
      setReceiptDownloadError(null)
      const { blob, filename } = await checkoutService.downloadReceipt(confirmedOrder.orderId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      toast.success("Recibo descarregado com sucesso.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível descarregar o recibo."
      setReceiptDownloadError(message)
      toast.error(message)
    } finally {
      setIsDownloadingReceipt(false)
    }
  }

  if (authLoading || !isAuthenticated) {
    return (
      <section className="checkout-page site-page">
        <main className="checkout-shell checkout-confirmation-shell">
          <div className="checkout-loading">A redirecionar para o login...</div>
        </main>
      </section>
    )
  }

  if (orderNumber) {
    const confirmationItems = confirmedOrder?.items ?? items
    const confirmationSubtotal = confirmedOrder?.subtotal ?? subtotal
    const confirmationDiscount = Math.min(confirmationSubtotal, Number(appliedCoupon?.desconto ?? 0))
    const confirmationTotal = Math.max(0, confirmationSubtotal - confirmationDiscount)
    const confirmationCustomer = confirmedOrder?.customer ?? form
    const confirmationFulfillment = confirmedOrder?.fulfillmentMethod ?? fulfillment
    const confirmationPayment = confirmedOrder?.paymentMethod ?? payment
    const purchaseDate = new Date(confirmedOrder?.createdAt ?? Date.now())
    const purchaseDateLabel = purchaseDate.toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short" })
    const estimatedTimeLabel = new Date(purchaseDate.getTime() + 18 * 60 * 1000).toLocaleTimeString("pt-PT", {
      hour: "numeric",
      minute: "2-digit",
    })
    const rawStatus = confirmedOrder?.status ?? "confirmada"
    const readableStatus = ({
      pendente: "com pagamento pendente",
      confirmada: "recebido",
      em_preparacao: "em preparação",
      pronta: "pronto",
      entregue: "entregue",
      cancelada: "cancelado",
    } as Record<string, string>)[rawStatus] ?? rawStatus.replace(/_/g, " ")
    const isCounterPayment = confirmationPayment === "cash"
    const paymentLabel = getPaymentMethodLabel(confirmationPayment)
    const paymentMethodLabel = confirmationPayment === "card"
      ? "Visa terminado em 4242"
      : confirmationPayment === "cash"
        ? "Pagar ao balcão"
        : "MB Way aprovado"
    const paymentReference = `BONEFREE-${confirmedOrder?.orderId ?? orderNumber}`
    const customerName = `${confirmationCustomer.firstName} ${confirmationCustomer.lastName}`.trim()
    const tableLabel = confirmationFulfillment === "dine_in" && confirmationCustomer.tableNumber
      ? `Mesa ${confirmationCustomer.tableNumber}`
      : confirmationFulfillment === "takeaway"
        ? "Balcão para levar"
        : "Entrega ao balcão"
    const imageForItem = (src?: string) => {
      return resolveProductImageUrl(src)
    }
    const paymentNote = confirmationPayment === "cash"
      ? "Pague ao balcão para a cozinha começar a preparar o pedido."
      : "Pagamento recebido. A cozinha já tem o seu pedido."
    const confirmationMessage = isCounterPayment
      ? "Obrigado pela sua compra. O pedido foi confirmado e aguarda pagamento ao balcão."
      : "Obrigado pela sua compra. O pedido foi confirmado."
    const nextStepMessage = isCounterPayment
      ? "Pague ao balcão e acompanhe a barra de progresso inferior."
      : "Acompanhe a barra de progresso inferior para ver atualizações em direto."
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
              <p className="order-status-popup-title">Pedido recebido</p>
              <p className="order-status-popup-copy">
                {orderNumber} está {readableStatus}. {paymentNote}
              </p>
              <p className="order-status-popup-next">{nextStepMessage}</p>
            </div>
            <button type="button" onClick={() => setShowStatusPopup(false)} aria-label="Fechar estado do pedido">
              x
            </button>
          </aside>
        )}
        <main className="checkout-shell checkout-confirmation-shell confirmation-premium-shell">
          <div className="confirmation-premium-container">
            <div className="confirmation-top-actions">
              <button type="button" className="confirmation-back-action" onClick={goBack}>
                <ArrowLeft size={16} strokeWidth={2.4} />
                Voltar
              </button>
              <Link to="/menu" className="confirmation-shop-action">
                Continuar a comprar
              </Link>
            </div>

            <section className="confirmation-premium-hero" aria-labelledby="payment-success-title">
              <div className="confirmation-success-motion" aria-hidden="true">
                <svg className="confirmation-checkmark" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" />
                  <path d="M 29 52 L 44 67 L 72 35" />
                </svg>
              </div>

              <div className="confirmation-hero-copy">
                <p className="confirmation-kicker">Confirmação do pedido</p>
                <h1 id="payment-success-title">Pagamento efetuado</h1>
                <p>{confirmationMessage}</p>
              </div>

              <div className="confirmation-hero-metrics" aria-label="Detalhes do recibo">
                <div>
                  <span>Número do pedido</span>
                  <strong>{orderNumber}</strong>
                </div>
                <div>
                  <span>Referência de pagamento</span>
                  <strong>{paymentReference}</strong>
                </div>
                <div>
                  <span>Purchased</span>
                  <strong>{purchaseDateLabel}</strong>
                </div>
              </div>

              <div className="confirmation-email-banner">
                <MailCheck size={20} strokeWidth={2.4} aria-hidden="true" />
                <span>E-mail de confirmação enviado para {confirmationCustomer.email}</span>
              </div>
            </section>

            <div className="confirmation-premium-grid">
              <div className="confirmation-main-stack">
                <section className="confirmation-panel confirmation-restaurant-panel" aria-labelledby="restaurant-title">
                  <div className="confirmation-section-heading">
                    <div>
                      <p>No restaurante</p>
                      <h2 id="restaurant-title">Próximos passos</h2>
                    </div>
                    <button type="button" className="confirmation-text-link" onClick={highlightOrderStatus}>
                      Mostrar barra de progresso <ArrowRight size={16} strokeWidth={2.4} />
                    </button>
                  </div>

                  <div className="confirmation-info-grid">
                    <div className="confirmation-info-tile">
                      <MapPin size={18} strokeWidth={2.4} />
                      <span>Local</span>
                      <strong>{tableLabel}</strong>
                    </div>
                    <div className="confirmation-info-tile">
                      <Truck size={18} strokeWidth={2.4} />
                      <span>Entrega à cozinha</span>
                      <strong>{isCounterPayment ? "Após pagamento ao balcão" : "Enviado para a cozinha"}</strong>
                    </div>
                    <div className="confirmation-info-tile">
                      <ShoppingBag size={18} strokeWidth={2.4} />
                      <span>Pronto por volta das</span>
                      <strong>{estimatedTimeLabel}</strong>
                    </div>
                    <div className="confirmation-info-tile">
                      <Check size={18} strokeWidth={2.4} />
                      <span>Estado atual</span>
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
                      <span className="summary-title" id="summary-title">Resumo do pedido</span>
                      <span className="summary-count">{confirmationItems.length} {confirmationItems.length === 1 ? "artigo" : "artigos"} neste pedido</span>
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
                        const customizationLines = customizationSummary(item.customizacao)
                        return (
                          <div key={`${item.cart_log_id}-${item.id_produto}`} className="confirmation-item confirmation-item-premium">
                            <img
                              src={imageForItem(item.caminho_imagem)}
                              alt=""
                              onError={(event) => {
                                useApiImageFallback(event.currentTarget)
                              }}
                            />
                            <div className="item-details">
                              <div>
                                <p className="item-name">{item.nome}</p>
                                <p className="item-meta">Qtd. {item.quantidade}</p>
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
                        <span>Subtotal (IVA incluído)</span>
                        <strong>{formatEuro(confirmationSubtotal)}</strong>
                      </div>
                      {confirmationDiscount > 0 && (
                        <div className="total-row">
                          <span>Descontos</span>
                          <strong>-{formatEuro(confirmationDiscount)}</strong>
                        </div>
                      )}
                      <div className="total-row payment-row">
                        <span>Método de pagamento</span>
                        <strong>{paymentMethodLabel}</strong>
                      </div>
                      <div className="total-row final">
                        <span>Total pago</span>
                        <strong>{formatEuro(confirmationTotal)}</strong>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="confirmation-panel confirmation-support-panel" aria-labelledby="support-title">
                  <div className="confirmation-section-heading">
                    <div>
                      <p>Apoio</p>
                      <h2 id="support-title">Estamos aqui se precisar de ajuda</h2>
                    </div>
                  </div>
                  <div className="trust-card-grid">
                    <div className="trust-card">
                      <MailCheck size={22} strokeWidth={2.4} />
                      <strong>Recibo enviado</strong>
                      <span >O recibo do pedido foi enviado para  {confirmationCustomer.email}.</span>
                    </div>
                    
                    <div className="trust-card">
                      <ShoppingBag size={22} strokeWidth={2.4} />
                      <strong>Atualizações da cozinha</strong>
                      <span>A barra de progresso inferior é atualizada à medida que o seu pedido avança na cozinha.</span>
                    </div>
                    <div className="trust-card">
                      <Headphones size={22} strokeWidth={2.4} />
                      <strong>Algo não está bem?</strong>
                      <span>Podemos ajudar ao balcão com substituições, reembolsos ou correções do pedido.</span>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="confirmation-receipt-card" aria-label="Recibo">
                <div className="receipt-card-top">
                  <ReceiptText size={24} strokeWidth={2.4} aria-hidden="true" />
                  <div>
                    <p>Recibo</p>
                    <h2>Pedido {orderNumber}</h2>
                  </div>
                </div>

                <div className="receipt-detail-list">
                  <div>
                    <span>Cliente</span>
                    <strong>{customerName || "Cliente"}</strong>
                  </div>
                  <div>
                    <span>Pagamento</span>
                    <strong>{paymentLabel}</strong>
                  </div>
                  <div>
                    <span>ID da Transação</span>
                    <strong>{paymentReference}</strong>
                  </div>
                  <div>
                    <span>Tipo de pedido</span>
                    <strong>{getFulfillmentLabel(confirmationFulfillment)}</strong>
                  </div>
                  <div>
                    <span>Handoff</span>
                    <strong>{tableLabel}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{readableStatus}</strong>
                  </div>
                  <div>
                    <span>Total pago</span>
                    <strong>{formatEuro(confirmationTotal)}</strong>
                  </div>
                </div>

                {earnedCoupon && (
                  <div className="loyalty-callout">
                    <Sparkles size={18} strokeWidth={2.4} aria-hidden="true" />
                    <span>Ganhou um cupão para a próxima vez. Consulte a página de perfil: <strong>{earnedCoupon}</strong></span>
                  </div>
                )}

                {hasMultipleActiveOrders && (
                  <div className="multi-order-callout">
                    <ShoppingBag size={18} strokeWidth={2.4} aria-hidden="true" />
                    <span>
                      Tem {activeOrderCount} pedidos em curso. Para acompanhar todos, abra os{" "}
                      <Link to="/profile?tab=orders">pedidos no perfil</Link>.
                    </span>
                  </div>
                )}

                <div className="receipt-actions">
                  <button type="button" className="bonefree-button confirmation-primary-action" onClick={highlightOrderStatus}>
                    Acompanhar pedido
                  </button>
                  <Link to="/profile?tab=orders" className="confirmation-secondary-action">
                    Ver detalhes do pedido
                  </Link>
                  <button
                    type="button"
                    className="confirmation-secondary-action"
                    onClick={handleDownloadReceipt}
                    disabled={isDownloadingReceipt}
                    aria-busy={isDownloadingReceipt}
                  >
                    <Download size={16} strokeWidth={2.4} />
                    {isDownloadingReceipt ? "A preparar PDF..." : "Descarregar recibo"}
                  </button>
                  {receiptDownloadError && (
                    <p className="receipt-download-error" role="alert">{receiptDownloadError}</p>
                  )}
                  <button type="button" className="confirmation-secondary-action" onClick={goBack}>
                    <ArrowLeft size={16} strokeWidth={2.4} />
                    Voltar
                  </button>
                  <Link to="/menu" className="confirmation-secondary-action">
                    Continuar a comprar
                  </Link>
                  <Link to="/contact" className="confirmation-secondary-action">
                    Contactar apoio
                  </Link>
                </div>
              </aside>
            </div>
          </div>

          <div className="confirmation-mobile-cta" aria-label="Ações do pedido">
            <div>
              <span>Total pago</span>
              <strong>{formatEuro(confirmationTotal)}</strong>
            </div>
            <button type="button" className="bonefree-button" onClick={highlightOrderStatus}>
              Acompanhar pedido
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
            <p className="checkout-eyebrow">Pedido à mesa</p>
            <h1>Confirme o seu pedido</h1>
          </div>
          <Link to="/cart" className="bonefree-button-secondary">Voltar ao carrinho</Link>
        </div>

        {!loading && items.length > 0 && checkoutUpsells.length > 0 && (
          <section className="checkout-upsell-funnel glass-panel" aria-label="Bebidas, molhos e extras">
            <div className="checkout-upsell-heading">
              <div>
                <span>Adicionar ao pedido</span>
                <strong>Bebidas, molhos e extras</strong>
              </div>
              <small>Antes de finalizar</small>
            </div>
            <div className="checkout-upsell-list">
              {checkoutUpsells.map((product) => {
                const label = getUpsellLabel(product) ?? "Adicionar"
                const busy = upsellBusyId === product.id
                return (
                  <article key={product.id} className="checkout-upsell-item">
                    <img src={checkoutImageUrl(product.image)} alt="" onError={(event) => useApiImageFallback(event.currentTarget)} />
                    <div>
                      <span>{label}</span>
                      <strong>{product.name}</strong>
                      <small>{formatEuro(product.price)}</small>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAddUpsell(product)}
                      disabled={busy}
                      aria-label={`Adicionar ${product.name}`}
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
            <button type="button" onClick={clearError}>Fechar</button>
          </div>
        )}

        {loading ? (
          <div className="checkout-loading">A carregar o pedido...</div>
        ) : items.length === 0 ? (
          <div className="checkout-empty glass-panel">
            <h2>O carrinho está vazio</h2>
            <p>Adicione alguns pratos antes de finalizar o pedido.</p>
            <Link to="/menu" className="bonefree-button">Ver menu</Link>
          </div>
        ) : (
          <form className="checkout-grid" onSubmit={handleSubmit}>
            <div className="checkout-main">
              <section className="checkout-panel glass-panel">
                <div className="checkout-panel-header">
                  <span>1</span>
                  <div>
                    <h2>Os seus dados</h2>
                    <p>Utilizaremos estas informações para o seu recibo e para as atualizações da sua encomenda.</p>
                  </div>
                </div>

                <div className="checkout-fields two-columns">
                  <label>
                    Nome
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
                    Apelido
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
                    E-mail
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
                    NIF (opcional)
                    <input
                      value={form.nif}
                      onChange={(e) => updateForm("nif", e.target.value)}
                      className={fieldErrors.nif ? "is-invalid" : ""}
                      autoComplete="off"
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="Opcional"
                      aria-invalid={Boolean(fieldErrors.nif)}
                    />
                    {fieldErrors.nif && (
                      <small className="field-error">{fieldErrors.nif}</small>
                    )}
                  </label>
                </div>

                <div className="checkout-fiscal-note">
                  <ReceiptText size={17} strokeWidth={2.4} aria-hidden="true" />
                  <p>
                    Quer que a morada apareca na fatura/recibo? Adicione ou atualize a morada de faturacao no{" "}
                    <Link to="/profile?tab=personal">perfil</Link> antes de finalizar o pedido.
                  </p>
                </div>


                <div className="checkout-table-number">
                  <div className="checkout-fulfillment-options" role="radiogroup" aria-label="Tipo de pedido">
                    {fulfillmentOptions.map(({ value, label, description, icon: Icon }) => (
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
                          <strong>{label}</strong>
                          <small>{description}</small>
                        </span>
                      </label>
                    ))}
                  </div>

                  {fulfillment === "dine_in" && (
                    <label className="checkout-table-field">
                      <span className="checkout-field-label-row">
                        <span>Número da mesa</span>
                        <span>Opcional</span>
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
                          placeholder={`Mesa 1-${MAX_TABLE_NUMBER}`}
                        />
                      </span>
                      {fieldErrors.tableNumber && <small className="field-error">{fieldErrors.tableNumber}</small>}
                      <small>Deixe em branco se a equipa for atribuir o ponto de entrega.</small>
                    </label>
                  )}


                </div>
              </section>

              <section className="checkout-panel glass-panel">
                <div className="checkout-panel-header">
                  <span>2</span>
                  <div>
                    <h2>Método de pagamento</h2>
                    <p>Como pretende pagar o seu pedido?</p>
                  </div>
                </div>

                <div className="checkout-payment-pills">
                  {paymentOptions.map(({ value, label, icon: Icon }) => (
                    <label key={value} className={`payment-pill ${payment === value ? "active" : ""}`}>
                      <input type="radio" name="payment" value={value} checked={payment === value} onChange={() => setPayment(value)} />
                      <span className="payment-pill-icon">
                        <Icon size={20} strokeWidth={2.4} aria-hidden="true" />
                      </span>
                      <span className="payment-pill-text">
                        {label}
                      </span>
                    </label>
                  ))}
                </div>

                {payment === "card" && (
                  <div className="checkout-card-fields animated-section">
                    <label>
                      Número do cartão
                      <span className="checkout-card-input-wrap">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          placeholder="4242 4242 4242 4242"
                          maxLength={23}
                          value={cardForm.number}
                          onChange={(event) => updateCardField("number", event.target.value)}
                          aria-invalid={Boolean(cardErrors.number)}
                        />
                        {cardType(cardForm.number) && <small>{cardType(cardForm.number)}</small>}
                      </span>
                      {cardErrors.number && <small className="field-error">{cardErrors.number}</small>}
                    </label>
                    <div className="two-columns">
                      <label>
                        Validade
                        <input type="text" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" maxLength={5} value={cardForm.expiry} onChange={(event) => updateCardField("expiry", event.target.value)} aria-invalid={Boolean(cardErrors.expiry)} />
                        {cardErrors.expiry && <small className="field-error">{cardErrors.expiry}</small>}
                      </label>
                      <label>
                        CVV
                        <input type="text" inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4} value={cardForm.cvv} onChange={(event) => updateCardField("cvv", event.target.value)} aria-invalid={Boolean(cardErrors.cvv)} />
                        {cardErrors.cvv && <small className="field-error">{cardErrors.cvv}</small>}
                      </label>
                    </div>
                    <label>
                      Nome do titular
                      <input type="text" autoComplete="cc-name" placeholder="Nome no cartão" value={cardForm.holder} onChange={(event) => updateCardField("holder", event.target.value)} aria-invalid={Boolean(cardErrors.holder)} />
                      {cardErrors.holder && <small className="field-error">{cardErrors.holder}</small>}
                    </label>
                  </div>
                )}

              </section>

            </div>

            <aside className="checkout-summary">
              <div className="checkout-summary-card glass-panel">
                <h2>Resumo do pedido</h2>

                <div className="checkout-summary-items checkout-mini-cart">
                  {items.map((item) => {
                    const customizationLines = customizationSummary(item.customizacao)
                    const busy = cartBusyKey === `${item.cart_log_id}-${item.id_produto}`
                    return (
                      <div key={`${item.cart_log_id}-${item.id_produto}`} className="checkout-summary-item checkout-summary-item-detailed checkout-mini-cart-item">
                        <img src={checkoutImageUrl(item.caminho_imagem)} alt={item.nome} onError={(event) => useApiImageFallback(event.currentTarget)} />
                        <div className="checkout-mini-cart-copy">
                          <span>
                            {item.nome}
                            {customizationLines.length > 0 && (
                              <small>{customizationLines.join(" | ")}</small>
                            )}
                          </span>
                          <div className="checkout-mini-cart-actions">
                            <div className="checkout-qty-control" aria-label={`Quantidade de ${item.nome}`}>
                              <button type="button" onClick={() => handleQuantityChange(item, item.quantidade - 1)} disabled={busy} aria-label={`Diminuir ${item.nome}`}>-</button>
                              <strong>{busy ? <LoaderCircle className="checkout-item-spinner" size={15} aria-hidden="true" /> : item.quantidade}</strong>
                              <button type="button" onClick={() => handleQuantityChange(item, item.quantidade + 1)} disabled={busy} aria-label={`Aumentar ${item.nome}`}>+</button>
                            </div>
                            <strong>{formatEuro(item.subtotal)}</strong>
                            <button type="button" className="checkout-remove-item" onClick={() => handleRemoveItem(item)} disabled={busy} aria-label={`Remover ${item.nome}`}>
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="checkout-totals">
                  <div><span>Subtotal</span><strong>{formatEuro(subtotalExVat)}</strong></div>
                  <div><span>IVA (13%)</span><strong>{formatEuro(vatAmount)}</strong></div>
                  {discount > 0 && <div><span>Cupão</span><strong>-{formatEuro(discount)}</strong></div>}
                  <div className="checkout-total-line"><span>Total</span><strong>{formatEuro(total)}</strong></div>
                  <p className="checkout-vat-note">IVA incluído</p>
                </div>

                <div className="checkout-meta">
                  <div>
                    <span>Tipo de pedido</span>
                    <strong>{getFulfillmentLabel(fulfillment)}</strong>
                  </div>
                  <div>
                    <span>Local</span>
                    <strong>{fulfillment === "takeaway" ? "Balcão para levar" : form.tableNumber ? `Mesa ${form.tableNumber}` : "Entrega ao balcão"}</strong>
                  </div>
                  <div>
                    <span>Pagamento</span>
                    <strong>{getPaymentMethodLabel(payment)}</strong>
                  </div>
                </div>

                <div className={`checkout-coupon-card ${showCouponEntry || appliedCoupon ? "open" : ""}`}>
                  <button
                    type="button"
                    className="checkout-coupon-toggle"
                    onClick={() => setShowCouponEntry((current) => !current)}
                    aria-expanded={showCouponEntry}
                    aria-controls="checkout-coupon-entry"
                  >
                    <span><Sparkles size={16} strokeWidth={2.4} /> Cupão?</span>
                    <strong>{appliedCoupon ? `-${formatEuro(appliedCoupon.desconto)}` : "Adicionar código"}</strong>
                  </button>

                  {showCouponEntry && (
                    <div className="checkout-promo-code" id="checkout-coupon-entry">
                      <label>
                        Código do cupão
                        <div className="checkout-promo-row">
                          <input
                            list="available-coupons"
                            value={form.promoCode}
                            onChange={(e) => updateForm("promoCode", e.target.value)}
                            placeholder="Introduza o código, se tiver"
                          />
                          <button type="button" onClick={handleApplyCoupon} disabled={isApplyingCoupon || subtotal <= 0}>
                            {isApplyingCoupon ? "A aplicar..." : "Aplicar"}
                          </button>
                        </div>
                        <datalist id="available-coupons">
                          {availableCoupons.map((coupon) => (
                            <option key={coupon.id_cupom} value={coupon.codigo}>
                              {formatEuro(coupon.valor)} off
                            </option>
                          ))}
                        </datalist>
                        {appliedCoupon && (
                          <small>Cupão aplicado: -{formatEuro(appliedCoupon.desconto)}</small>
                        )}
                      </label>
                    </div>
                  )}
                </div>

                {formError && <p className="checkout-form-error">{formError}</p>}

                <button type="submit" className="checkout-submit bonefree-button" disabled={isSubmitting || items.length === 0}>
                  {isSubmitting ? "A efetuar pedido..." : `Fazer pedido - ${formatEuro(total)}`}
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
