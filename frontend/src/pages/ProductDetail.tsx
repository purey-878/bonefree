import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { MouseEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  BadgeCheck,
  CakeSlice,
  Check,
  ChevronDown,
  ChevronLeft,
  CupSoda,
  Flame,
  Leaf,
  MessageCircle,
  Minus,
  PackageCheck,
  Plus,
  RotateCcw,
  Salad,
  Sandwich,
  ShieldCheck,
  Soup,
  Star,
  Sprout,
  ThumbsUp,
  TriangleAlert,
  X,
} from "lucide-react"

import "./ProductDetail.css"
import "../theme.css"
import Navbar from "../components/Navbar"
import { AddToCartButton, Badge, ProductCard, Skeleton, StockBadge, Textarea } from "../components/ui"
import ConfirmDialog from "../components/ui/ConfirmDialog"
import { useToast } from "../components/ui/toastContext"
import { useAuth } from "../hooks/useAuth"
import { cartService, emptyCustomization, hasCustomization, productService } from "../services"
import type {
  Product,
  ProductAvailabilitySuggestions,
  ProductReview,
  ProductReviewEligibility,
  ProductReviewStats,
  ProductSuggestion,
} from "../types/product"
import type { ItemCustomization, ProductCustomizationOptions } from "../types/cart"
import { productImageFallback, resolveProductImageUrl, useApiImageFallback } from "../utils/imageFallback"
import { formatEuro } from "../utils/money"

type GalleryImage = {
  alt: string
  label: string
  src: string
}

type ReviewFilter = "all" | "5" | "4" | "with-text"
const PUBLIC_REVIEW_REACTIONS = [
  { type: "like", label: "Gostado pela equipa", Icon: ThumbsUp },
] as const

const fallbackImage = productImageFallback
const recentlyViewedKey = "bonefree_recently_viewed"
const customizationAddSurcharge = 1
const customizationOptionTranslations: Record<string, string> = {
  "extra sauce": "Molho extra",
  "extra vegan cheese": "Queijo vegan extra",
  "extra pickles": "Pickles extra",
  "extra jalapenos": "Jalapeños extra",
  "extra jalapeños": "Jalapeños extra",
  "extra salad": "Salada extra",
  "extra crispy onions": "Cebola crocante extra",
  "light sauce": "Pouco molho",
  "sauce on the side": "Molho à parte",
  "extra spicy": "Mais picante",
  "no spice": "Sem picante",
  "cut in half": "Cortado ao meio",
  pickles: "Pickles",
  onion: "Cebola",
  tomato: "Tomate",
  lettuce: "Alface",
  sauce: "Molho",
  slaw: "Couve marinada",
  coriander: "Coentros",
  spice: "Picante",
  berries: "Frutos vermelhos",
  seeds: "Sementes",
  syrup: "Calda",
}

function customizationOptionLabel(field: "remove" | "add" | "preferences", option: string) {
  const translated = customizationOptionTranslations[option.trim().toLowerCase()]
  if (translated) return translated
  if (field === "add") return option.replace(/^Extra\s+/i, "")
  return option
}

const anchoredSections = [
  { href: "#highlights", label: "Destaques" },
  { href: "#details", label: "Detalhes" },
  { href: "#reviews", label: "Avaliações" },
  { href: "#faq", label: "FAQ" },
]

function getImage(img: string | null | undefined) {
  return resolveProductImageUrl(img, fallbackImage)
}

function formatPrice(price: number | null | undefined) {
  return formatEuro(price)
}

function formatCalories(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null
  return value.toLocaleString("pt-PT", { maximumFractionDigits: 1 })
}

function productCalorieTotal(product: Product) {
  if (
    product.total_calorias != null &&
    Number.isFinite(Number(product.total_calorias)) &&
    Number(product.total_calorias) > 0
  ) {
    return Number(product.total_calorias)
  }
  const ingredientTotal = (product.ingredientes ?? []).reduce((sum, ingredient) => {
    const calories = Number(ingredient.calorias ?? 0)
    return Number.isFinite(calories) && calories > 0 ? sum + calories : sum
  }, 0)
  return ingredientTotal > 0 ? ingredientTotal : null
}

function ingredientTypeLabel(type: string) {
  const labels: Record<string, string> = {
    INGREDIENTES_NORMAIS: "ingrediente normal",
    MOLHO: "molho",
    EXTRA: "extra",
    BEBIDA: "bebida",
    BASE: "base",
    ACOMPANHAMENTO: "acompanhamento",
  }
  return labels[type] ?? type.replace("_", " ").toLowerCase()
}

function readRecentlyViewed() {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentlyViewedKey) ?? "[]") as Array<string | number>
    return parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value))
  } catch {
    return []
  }
}

export const ProductDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<Product | null>(null)
  const [productsById, setProductsById] = useState<Record<string, Product>>({})
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([])
  const [recentProducts, setRecentProducts] = useState<Product[]>([])
  const [availabilitySuggestions, setAvailabilitySuggestions] = useState<ProductAvailabilitySuggestions | null>(null)
  const [reviewStats, setReviewStats] = useState<ProductReviewStats | null>(null)
  const [reviews, setReviews] = useState<ProductReview[]>([])
  const [reviewEligibility, setReviewEligibility] = useState<ProductReviewEligibility | null>(null)
  const [customizationOptions, setCustomizationOptions] = useState<ProductCustomizationOptions>({
    remove: [],
    add: [],
    preferences: [],
  })
  const [customization, setCustomization] = useState<ItemCustomization>(emptyCustomization())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [addingToCart, setAddingToCart] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastError, setToastError] = useState(false)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all")
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewTitle, setReviewTitle] = useState("")
  const [reviewComment, setReviewComment] = useState("")
  const [selectedOrderItemId, setSelectedOrderItemId] = useState<number | "">("")
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null)
  const [reviewFormOpen, setReviewFormOpen] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewToDelete, setReviewToDelete] = useState<ProductReview | null>(null)
  const navigate = useNavigate()
  const { token } = useAuth()
  const toast = useToast()
  const imageFrameRef = useRef<HTMLDivElement | null>(null)
  const imageZoomRafRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }, [id])

  useEffect(() => {
    if (!id) return
    const productId = id

    const fetchProduct = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await productService.getById(productId)
        setProduct(data)
        setCustomization(emptyCustomization())
        setQuantity(1)
        setActiveImageIndex(0)
        setEditingReviewId(null)
        setReviewTitle("")
        setReviewComment("")
        setReviewRating(0)
        setReviewFormOpen(false)

        const all = await productService.getAll()
        const byId = Object.fromEntries(all.map(p => [p.id, p]))
        setProductsById(byId)
        setRelatedProducts(
          all.filter(p => p.category === data.category && p.id !== data.id).slice(0, 4),
        )
        setRecentProducts(
          readRecentlyViewed()
            .filter(recentId => recentId !== data.id)
            .map(recentId => byId[recentId])
            .filter((item): item is Product => Boolean(item))
            .slice(0, 4),
        )

        localStorage.setItem(
          recentlyViewedKey,
          JSON.stringify([data.id, ...readRecentlyViewed().filter(recentId => recentId !== data.id)].slice(0, 8)),
        )

        if (data.stock <= 0 || data.available === false) {
          try {
            setAvailabilitySuggestions(await productService.getAvailabilitySuggestions(productId))
          } catch (suggestionError) {
            console.error("Não foi possível carregar sugestões de disponibilidade.", suggestionError)
            setAvailabilitySuggestions(null)
          }
        } else {
          setAvailabilitySuggestions(null)
        }

        try {
          setCustomizationOptions(await productService.getCustomizationOptions(productId))
        } catch (customizationError) {
          console.error("Não foi possível carregar opções de personalização.", customizationError)
          setCustomizationOptions({ remove: [], add: [], preferences: [] })
        }

        try {
          const [stats, reviewList, eligibility] = await Promise.all([
            productService.getReviewStats(productId),
            productService.getReviews(productId),
            productService.getReviewEligibility(productId),
          ])
          setReviewStats(stats)
          setReviews(reviewList)
          setReviewEligibility(eligibility)
          const firstReviewableItem = eligibility.existing_review ? null : eligibility.items.find(item => !item.existing_review)
          setSelectedOrderItemId(firstReviewableItem?.id_encomenda_produto ?? "")
        } catch (reviewLoadError) {
          console.error("Não foi possível carregar avaliações.", reviewLoadError)
          setReviewStats(null)
          setReviews([])
          setReviewEligibility(null)
          setSelectedOrderItemId("")
        }
      } catch (fetchError) {
        setError("Não foi possível carregar os detalhes do produto.")
        console.error(fetchError)
      } finally {
        setLoading(false)
      }
    }

    fetchProduct()
  }, [id, token])

  useEffect(() => {
    const frame = imageFrameRef.current
    if (imageZoomRafRef.current !== null) {
      window.cancelAnimationFrame(imageZoomRafRef.current)
      imageZoomRafRef.current = null
    }
    if (!frame) return
    frame.classList.remove("is-zooming")
    frame.style.setProperty("--pd-image-scale", "1")
    frame.style.setProperty("--pd-image-origin", "50% 50%")
  }, [activeImageIndex])

  const handleAddToCart = async (goToCheckout = false) => {
    if (!product) return
    if (Number(product.stock ?? 0) <= 0 || product.available === false) {
      setToastError(true)
      setToastMessage(Number(product.stock ?? 0) <= 0 ? "Este item está esgotado." : "Este item está indisponível.")
      setTimeout(() => setToastMessage(null), 3000)
      return
    }
    setAddingToCart(true)
    try {
      const pricedCustomization = hasCustomization(customization)
        ? {
            ...customization,
            preco_unitario_final: Number(product.price ?? 0) + (customization.add.length * customizationAddSurcharge),
          }
        : null

      await cartService.addItem(
        product.id,
        quantity,
        product.stock,
        pricedCustomization,
      )
      window.dispatchEvent(new Event("cartUpdated"))
      setToastError(false)
      setToastMessage(goToCheckout ? "Adicionado ao carrinho. A levar para o checkout." : "Adicionado ao carrinho")
      if (goToCheckout) {
        navigate("/checkout")
      } else {
        setQuantity(1)
        setCustomization(emptyCustomization())
      }
    } catch (err) {
      setToastError(true)
      setToastMessage("Não foi possível adicionar este item.")
      console.error(err)
    } finally {
      setAddingToCart(false)
      setTimeout(() => setToastMessage(null), 3000)
    }
  }

  const toggleCustomization = (field: "remove" | "add" | "preferences", value: string) => {
    setCustomization(current => {
      const exists = current[field].includes(value)
      return {
        ...current,
        [field]: exists
          ? current[field].filter(item => item !== value)
          : [...current[field], value],
      }
    })
  }

  const updateCustomizationNote = (note: string) => {
    setCustomization(current => ({ ...current, note }))
  }

  const reloadReviews = async (productId: string | number) => {
    const [stats, reviewList, eligibility] = await Promise.all([
      productService.getReviewStats(productId),
      productService.getReviews(productId),
      productService.getReviewEligibility(productId),
    ])
    setReviewStats(stats)
    setReviews(reviewList)
    setReviewEligibility(eligibility)
    const firstReviewableItem = eligibility.existing_review ? null : eligibility.items.find(item => !item.existing_review)
    setSelectedOrderItemId(firstReviewableItem?.id_encomenda_produto ?? "")
  }

  const resetReviewForm = () => {
    setEditingReviewId(null)
    setReviewFormOpen(false)
    setReviewRating(5)
    setReviewTitle("")
    setReviewComment("")
    setReviewError(null)
  }

  const handleAddReviewClick = () => {
    setReviewError(null)
    if (!reviewEligibility) {
      setToastError(true)
      setToastMessage("As avaliações ainda estão a carregar. Tente novamente dentro de instantes.")
      toast.info("As avaliações ainda estão a carregar. Tente novamente dentro de instantes.")
      setTimeout(() => setToastMessage(null), 3000)
      return
    }

    if (!reviewEligibility.authenticated) {
      setToastError(true)
      setToastMessage("Inicie sessão para escrever uma avaliação.")
      toast.warning("Inicie sessão para escrever uma avaliação.")
      setTimeout(() => setToastMessage(null), 3000)
      return
    }

    if (reviewEligibility.existing_review) {
      handleEditReview(reviewEligibility.existing_review)
      setToastError(false)
      setToastMessage("Já avaliou este produto. Pode editar a sua avaliação.")
      toast.info("Já avaliou este produto. Pode editar a sua avaliação.")
      setTimeout(() => setToastMessage(null), 3000)
      return
    }

    if (!canCreateReview) {
      setToastError(true)
      setToastMessage(reviewEligibility.message)
      toast.warning(reviewEligibility.message)
      setTimeout(() => setToastMessage(null), 3000)
      return
    }

    setEditingReviewId(null)
    setReviewFormOpen(true)
  }

  const handleSubmitReview = async () => {
    if (!product) return
    setReviewSubmitting(true)
    setReviewError(null)
    try {
      if (editingReviewId) {
        await productService.updateReview(editingReviewId, {
          rating: reviewRating,
          titulo: reviewTitle,
          comentario: reviewComment,
        })
        setToastError(false)
        setToastMessage("Avaliação atualizada.")
        toast.success("Avaliação atualizada com sucesso.")
      } else {
        if (!selectedOrderItemId) throw new Error("Escolha um item comprado para avaliar.")
        await productService.createReview(product.id, {
          id_encomenda_produto: Number(selectedOrderItemId),
          rating: reviewRating,
          titulo: reviewTitle,
          comentario: reviewComment,
        })
        setToastError(false)
        setToastMessage("Avaliação publicada.")
        toast.success("Avaliação publicada com sucesso.")
      }
      resetReviewForm()
      await reloadReviews(product.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível guardar a avaliação."
      setReviewError(message)
      setToastError(true)
      setToastMessage(message)
      toast.error(message)
    } finally {
      setReviewSubmitting(false)
      setTimeout(() => setToastMessage(null), 3000)
    }
  }

  const handleEditReview = (review: ProductReview) => {
    setEditingReviewId(review.id_review)
    setReviewFormOpen(true)
    setReviewRating(review.rating)
    setReviewTitle(review.titulo ?? "")
    setReviewComment(review.comentario ?? "")
    setReviewError(null)
  }

  const handleDeleteReview = async (review: ProductReview) => {
    setReviewToDelete(review)
  }

  const confirmDeleteReview = async () => {
    const review = reviewToDelete
    if (!review) return
    if (!product) return
    setReviewSubmitting(true)
    setReviewError(null)
    try {
      await productService.deleteReview(review.id_review)
      if (editingReviewId === review.id_review) resetReviewForm()
      await reloadReviews(product.id)
      setToastError(false)
      setToastMessage("Avaliação apagada.")
      setReviewToDelete(null)
      toast.success("Avaliação apagada com sucesso.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível apagar a avaliação."
      setReviewError(message)
      setToastError(true)
      setToastMessage(message)
      toast.error(message)
    } finally {
      setReviewSubmitting(false)
      setTimeout(() => setToastMessage(null), 3000)
    }
  }

  const renderSuggestionCard = (suggestion: ProductSuggestion) => {
    const suggestionProduct = productsById[suggestion.id_produto]
    const price = suggestion.preco ?? suggestionProduct?.price ?? 0
    const productShape: Product = {
      id: suggestion.id_produto,
      id_display: suggestion.id_produto_display,
      category: suggestion.categoria,
      name: suggestion.nome,
      description: suggestion.reason,
      image: suggestionProduct?.image ?? null,
      price,
      stock: suggestion.stock,
      customizavel: suggestionProduct?.customizavel ?? false,
    }

    return (
      <ProductCard
        key={suggestion.id_produto}
        product={productShape}
        onSelect={() => navigate(`/product/${suggestion.id_produto}`)}
      />
    )
  }

  const galleryImages = useMemo<GalleryImage[]>(() => {
    if (!product) return []
    const sources = product.images?.length ? product.images : [product.image]
    return sources
      .filter((src): src is string => typeof src === "string")
      .map(src => getImage(src))
      .filter((src, index, all) => src && all.indexOf(src) === index)
      .map((src, index) => ({
        alt: index === 0 ? product.name : `${product.name} ${index + 1}`,
        label: index === 0 ? "imagem principal" : `imagem ${index + 1}`,
        src,
      }))
  }, [product])

  if (loading) return (
    <div className="pd-page">
      <Navbar />
      <div className="pd-loading">
        <Skeleton width="min(100%, 1180px)" height="620px" radius="var(--radius-md)" />
      </div>
    </div>
  )

  if (error) return (
    <div className="pd-page">
      <Navbar />
      <div className="pd-loading pd-state-card">
        <p className="pd-error">{error}</p>
        <button className="pd-back-btn" onClick={() => navigate("/menu")}>Voltar ao menu</button>
      </div>
    </div>
  )

  if (!product) return null

  const inStock = product.stock > 0
  const canPurchase = inStock && product.available !== false
  const unavailableLabel = inStock ? "Indisponível" : "Esgotado"
  const addToCartBlockedLabel = inStock ? "Adicionar ao carrinho" : "Esgotado"
  const buyNowBlockedLabel = inStock ? "Comprar agora" : "Esgotado"
  const ingredientBreakdown = product.ingredientes ?? []
  const inactiveNonBaseIngredients = ingredientBreakdown.filter(
    ingredient => ingredient.status === 0 && ingredient.tipo !== "BASE",
  )
  const inactiveIngredientNames = inactiveNonBaseIngredients.map(ingredient => ingredient.nome).join(", ")
  const productCalories = formatCalories(productCalorieTotal(product))
  const substituteSuggestions = availabilitySuggestions?.substitutes ?? []
  const substituteIds = new Set(substituteSuggestions.map(suggestion => suggestion.id_produto))
  const similarDishSuggestions = (availabilitySuggestions?.similar_dishes ?? [])
    .filter(suggestion => !substituteIds.has(suggestion.id_produto))
  const hasSuggestions = !canPurchase && (substituteSuggestions.length > 0 || similarDishSuggestions.length > 0)
  const averageRating = reviewStats?.rating_medio
  const totalReviews = reviewStats?.total_reviews ?? 0
  const existingProductReview = reviewEligibility?.existing_review ?? null
  const reviewableItems = existingProductReview ? [] : reviewEligibility?.items.filter(item => !item.existing_review) ?? []
  const canCreateReview = Boolean(reviewEligibility?.authenticated && reviewableItems.length > 0)
  const showReviewForm = (reviewFormOpen && canCreateReview) || editingReviewId !== null
  const activeImage = galleryImages[activeImageIndex] ?? galleryImages[0]
  const discountPercent = Number(product.discount_percent ?? 0)
  const showDiscount =
    discountPercent > 0 &&
    product.original_price != null &&
    Number(product.original_price) > Number(product.price ?? 0)
  const selectedCustomizationCount =
    customization.remove.length +
    customization.add.length +
    customization.preferences.length +
    (customization.note?.trim() ? 1 : 0)
  const customizedUnitPrice =
    Number(product.price ?? 0) + (customization.add.length * customizationAddSurcharge)
  const customizationGroups = [
    { key: "remove", label: "Remover", options: customizationOptions.remove },
    { key: "add", label: `Adicionar (+${formatEuro(customizationAddSurcharge)} cada)`, options: customizationOptions.add },
    { key: "preferences", label: "Preferências", options: customizationOptions.preferences },
  ] as const
  const filteredReviews = reviews.filter(review => {
    if (reviewFilter === "5") return review.rating === 5
    if (reviewFilter === "4") return review.rating >= 4
    if (reviewFilter === "with-text") return Boolean(review.comentario?.trim() || review.titulo?.trim())
    return true
  })

  const handleImageZoomEnter = () => {
    const frame = imageFrameRef.current
    if (!frame) return
    frame.classList.add("is-zooming")
    frame.style.setProperty("--pd-image-scale", "1.9")
  }

  const handleImageZoomMove = (event: MouseEvent<HTMLDivElement>) => {
    const frame = event.currentTarget
    const bounds = frame.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width) * 100
    const y = ((event.clientY - bounds.top) / bounds.height) * 100

    if (imageZoomRafRef.current !== null) {
      window.cancelAnimationFrame(imageZoomRafRef.current)
    }

    imageZoomRafRef.current = window.requestAnimationFrame(() => {
      frame.style.setProperty(
        "--pd-image-origin",
        `${Math.max(0, Math.min(100, x))}% ${Math.max(0, Math.min(100, y))}%`,
      )
      imageZoomRafRef.current = null
    })
  }

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate("/menu")
  }

  const resetImageZoom = () => {
    const frame = imageFrameRef.current
    if (imageZoomRafRef.current !== null) {
      window.cancelAnimationFrame(imageZoomRafRef.current)
      imageZoomRafRef.current = null
    }
    if (!frame) return
    frame.classList.remove("is-zooming")
    frame.style.setProperty("--pd-image-scale", "1")
    frame.style.setProperty("--pd-image-origin", "50% 50%")
  }

  return (
    <div className="pd-page">
      <Navbar />

      <div className="pd-floating-food-bg" aria-hidden="true">
        <span className="pd-food-float pd-food-float-salad"><Salad /></span>
        <span className="pd-food-float pd-food-float-soup"><Soup /></span>
        <span className="pd-food-float pd-food-float-sandwich"><Sandwich /></span>
        <span className="pd-food-float pd-food-float-drink"><CupSoda /></span>
        <span className="pd-food-float pd-food-float-cake"><CakeSlice /></span>
        <span className="pd-food-float pd-food-float-salad-2"><Salad /></span>
        <span className="pd-food-float pd-food-float-soup-2"><Soup /></span>
        <span className="pd-food-float pd-food-float-sandwich-2"><Sandwich /></span>
        <span className="pd-food-float pd-food-float-drink-2"><CupSoda /></span>
        <span className="pd-food-float pd-food-float-cake-2"><CakeSlice /></span>
      </div>

      {toastMessage && (
        <div className={`bonefree-toast ${toastError ? "error" : ""}`} role={toastError ? "alert" : "status"}>
          <span className="bonefree-toast-icon" aria-hidden="true">
            {toastError ? "!" : <Check size={15} strokeWidth={2.7} />}
          </span>
          <span className="bonefree-toast-message">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss"
            className="toast-close"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(reviewToDelete)}
        title="Apagar esta avaliação?"
        description="Esta avaliação será removida da página do produto."
        confirmText="Apagar avaliação"
        cancelText="Cancelar"
        danger
        loading={reviewSubmitting}
        onConfirm={() => void confirmDeleteReview()}
        onCancel={() => {
          if (!reviewSubmitting) setReviewToDelete(null)
        }}
      />

      <main className="pd-shell">
        <nav className="pd-breadcrumb" aria-label="Breadcrumb">
          <button className="pd-back-btn" onClick={handleBack} type="button">
            <ChevronLeft size={17} />
            Voltar
          </button>
          <Link to="/">Início</Link>
          <span>/</span>
          <Link to="/menu">Menu</Link>
          <span>/</span>
          <Link to="/menu">{product.category}</Link>
          <span>/</span>
          <strong>{product.name}</strong>
        </nav>

        <section className="pd-hero ">
          <div className="pd-gallery ">
            <div
              ref={imageFrameRef}
              className="pd-image-frame product-detail-image-zoom"
              onMouseEnter={handleImageZoomEnter}
              onMouseMove={handleImageZoomMove}
              onMouseLeave={resetImageZoom}
            >
              <img
                src={activeImage?.src ?? fallbackImage}
                alt={activeImage?.alt ?? product.name}
                className="pd-image p-4"
                onError={event => {
                  useApiImageFallback(event.currentTarget, fallbackImage)
                }}
              />
            <div className="pd-gallery-topline ">
              <Badge variant="accent" size="sm">{product.category}</Badge>
              <span><Leaf size={15} /> 100% vegan</span>
            </div>
            </div>

            <div className="pd-thumbnails  " aria-label="Miniaturas da galeria do produto">
              {galleryImages.map((image, index) => (
                <button
             
                  key={`${image.src}-${index}`}
                  type="button"
                  className={activeImageIndex === index ? "active p-1" : "p-2"}
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`Show ${image.label}`}
                >
                  <img
                    src={image.src}
                    alt=""
                    onError={event => {
                      useApiImageFallback(event.currentTarget, fallbackImage)
                    }}
                  />
                </button>
              ))}
            </div>

            <div className="pd-gallery-meta" >
              <span><Leaf size={16} /> 100% vegan</span>
              <span><Sprout size={16} /> Ingredientes vegetais</span>
              <span><BadgeCheck size={16} /> Preparado fresco</span>
            </div>
          </div>

          <aside className="pd-buy-panel" aria-label="Opções de compra">
            <div className="pd-badge-row">
              <StockBadge stock={product.stock} inStock={inStock} />
              <Badge variant="glass" size="sm">Vegetal</Badge>
              <Badge variant="neutral" size="sm">Pedido à mesa</Badge>
            </div>

            <div className="pd-title-row">
              <div>
                <p className="pd-kicker">Item premium do menu</p>
                <h1>{product.name}</h1>
              </div>
            </div>

            <a className="pd-rating-link" href="#reviews">
              <span>
                <Star size={17} fill="currentColor" />
                {averageRating?.toFixed(1) ?? "Novo"}
              </span>
              <strong>{totalReviews} {totalReviews === 1 ? "avaliação" : "avaliações"}</strong>
            </a>

            <div className="pd-price-card">
              {showDiscount && <em>{discountPercent}% desconto</em>}
              {showDiscount && <del>{formatPrice(product.original_price)}</del>}
              <strong className="red">{formatPrice(product.price)}</strong>
              {productCalories && (
                <span className="pd-calorie-line" title={`${productCalories} quilocalorias`}>
                  <Flame aria-hidden="true" />
                  {productCalories} kcal
                </span>
              )}
            </div>

            <p className="pd-desc">
              {product.description || "A carefully crafted dish made with fresh, plant-based ingredients and finished to order."}
            </p>

            {inactiveNonBaseIngredients.length > 0 && (
              <div className="pd-ingredient-alert" role="status">
                <TriangleAlert size={18} aria-hidden="true" />
                <div>
                  <strong>Ingrediente temporariamente indisponível</strong>
                  <span>
                    {inactiveIngredientNames}. A equipa pode ajustar a preparação deste prato.
                  </span>
                </div>
              </div>
            )}

            {inStock && product.customizavel && (
              <details className="pd-customizer" open>
                <summary>
                  <span>Personalizar pedido</span>
                  <strong>{selectedCustomizationCount} selecionados</strong>
                  <ChevronDown size={18} />
                </summary>
                <div className="pd-customizer-body">
                  <p className="pd-customizer-note">
                    Adicionar um item custa mais {formatEuro(customizationAddSurcharge)}. Remover ingredientes não reduz o preço.
                  </p>
                  {customizationGroups.map(group => (
                    group.options.length > 0 && (
                      <div className="pd-customizer-group" key={group.key}>
                        <h3>{group.label}</h3>
                        <div className="pd-option-pills">
                          {group.options.map(option => {
                            const selected = customization[group.key].includes(option)

                            return (
                              <button
                                key={option}
                                type="button"
                                className={[
                                  "pd-option-pill",
                                  `pd-option-pill-${group.key}`,
                                  selected ? "selected" : "",
                                ].filter(Boolean).join(" ")}
                                onClick={() => toggleCustomization(group.key, option)}
                              >
                                {group.key === "remove" && <Minus size={15} aria-hidden="true" />}
                                {group.key === "add" && <Plus size={15} aria-hidden="true" />}
                                <span>{customizationOptionLabel(group.key, option)}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  ))}
                  <label className="pd-custom-note">
                    Instruções especiais
                    <Textarea
                      rows={3}
                      maxLength={280}
                      value={customization.note ?? ""}
                      onChange={event => updateCustomizationNote(event.target.value)}
                      placeholder="Nota de alergia, preferência de molho ou pedido para a cozinha"
                    />
                  </label>
                </div>
              </details>
            )}

            <div className="pd-purchase-row">
              <div className="pd-qty-row" aria-label={`Quantidade de ${product.name}`}>
                <button
                  className="pd-qty-btn"
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={!canPurchase || quantity <= 1}
                  aria-label="Diminuir quantidade"
                >
                  <Minus size={18} />
                </button>
                <span className="pd-qty-num">{quantity}</span>
                <button
                  className="pd-qty-btn"
                  type="button"
                  onClick={() => setQuantity(q => Math.min(product.stock, q + 1))}
                  disabled={!canPurchase || quantity >= product.stock}
                  aria-label="Aumentar quantidade"
                >
                  <Plus size={18} />
                </button>
              </div>

              <AddToCartButton
                className="pd-cta"
                onClick={() => handleAddToCart(false)}
                disabled={!canPurchase || addingToCart}
                isLoading={addingToCart}
                outOfStock={!inStock}
                price={customizedUnitPrice}
                quantity={quantity}
              >
                {!canPurchase ? addToCartBlockedLabel : undefined}
              </AddToCartButton>
            </div>

            <button
              className="pd-buy-now"
              type="button"
              onClick={() => handleAddToCart(true)}
              disabled={!canPurchase || addingToCart}
            >
              {canPurchase ? "Comprar agora" : buyNowBlockedLabel}
            </button>

            <div className="pd-assurance-grid">
              <div><RotateCcw size={18} /><span>Ajuda fácil</span><strong>Fale com a equipa</strong></div>
              <div><ShieldCheck size={18} /><span>Promessa de qualidade</span><strong>Preparado fresco</strong></div>
            </div>
          </aside>
        </section>

        {hasSuggestions && (
          <section className="pd-section pd-related pd-suggestions pd-suggestions-top">
            <div className="pd-section-heading">
              <p>Alternativas disponíveis</p>
              <h2>Pratos semelhantes prontos agora</h2>
            </div>
            {substituteSuggestions.length > 0 && (
              <div className="pd-suggestion-block">
                <h3>Substitutos</h3>
                <div className="pd-related-grid">{substituteSuggestions.map(renderSuggestionCard)}</div>
              </div>
            )}
            {similarDishSuggestions.length > 0 && (
              <div className="pd-suggestion-block">
                <h3>Pratos semelhantes</h3>
                <div className="pd-related-grid">{similarDishSuggestions.map(renderSuggestionCard)}</div>
              </div>
            )}
          </section>
        )}

        <nav className="pd-anchor-nav" aria-label="Secções de detalhe do produto">
          {anchoredSections.map(section => (
            <a key={section.href} href={section.href}>{section.label}</a>
          ))}
        </nav>

        <section className="pd-section pd-highlights" id="highlights">
          <div className="pd-section-heading">
            <p>Porque convence</p>
            <h2>Feito para dar confiança antes da primeira garfada</h2>
          </div>
          <div className="pd-highlight-grid">
            <article><PackageCheck size={22} /><h3>Preparação fresca</h3><p>Preparado perto da recolha ou do serviço à mesa para manter textura e sabor.</p></article>
            <article><BadgeCheck size={22} /><h3>Padrões vegetais</h3><p>Pensado para refeições vegan com controlos claros de personalização e apoio da equipa.</p></article>
            <article><ShieldCheck size={22} /><h3>Checkout fiável</h3><p>Carrinho e checkout mantêm-se persistentes, previsíveis e otimizados para pedir sem complicações.</p></article>
          </div>
        </section>

        <section className="pd-section pd-details" id="details">
          <div className="pd-section-heading">
            <p>Informação do produto</p>
            <h2>Detalhes que facilitam a escolha</h2>
          </div>
          <div className="pd-info-grid">
            <article className="pd-copy-card">
              <h3>Description</h3>
              <p>{product.description || "A signature plant-based plate crafted with balanced texture, bright flavor, and a clean finish."}</p>
              <ul>
                <li>Porção equilibrada para uma pessoa ou para partilhar à mesa.</li>
                <li>Notas de preparação personalizáveis para preferências alimentares.</li>
                <li>Preparado pela cozinha após o pedido para garantir mais frescura.</li>
              </ul>
            </article>
            <article className="pd-spec-card">
              <h3>Especificações</h3>
              <dl>
                <div><dt>Categoria</dt><dd>{product.category}</dd></div>
                <div><dt>Disponibilidade</dt><dd>{canPurchase ? `${product.stock} disponíveis` : unavailableLabel}</dd></div>
                <div><dt>Calorias</dt><dd>{productCalories ? `${productCalories} kcal` : "Não indicado"}</dd></div>
                <div><dt>Personalização</dt><dd>{product.customizavel ? "Disponível" : "Preparação padrão"}</dd></div>
                <div><dt>Dieta</dt><dd>100% vegan</dd></div>
              </dl>
            </article>
            <article className="pd-nutrition-card">
              <div className="pd-nutrition-head">
                <div>
                  <h3>Calorias por ingrediente</h3>
                  <p>Estimado a partir das quantidades guardadas e das kcal por grama.</p>
                </div>
                {productCalories && <strong>{productCalories} kcal</strong>}
              </div>
              {ingredientBreakdown.length > 0 ? (
                <div className="pd-nutrition-list">
                  {ingredientBreakdown.map((ingredient) => {
                    const calories = formatCalories(ingredient.calorias)
                    const caloriesPerGram = formatCalories(ingredient.calorias_por_grama)
                    const inactive = ingredient.status === 0
                    return (
                      <div key={ingredient.id_ingrediente} className={`pd-nutrition-row ${inactive ? "is-inactive" : ""}`}>
                        <div>
                          <strong>
                            {ingredient.nome}
                            {inactive && <em>Indisponível</em>}
                          </strong>
                          <span>{ingredientTypeLabel(ingredient.tipo)} · {ingredient.quantidade || "quantity not set"}</span>
                        </div>
                        <div>
                          <span>{caloriesPerGram ? `${caloriesPerGram} kcal/g` : "kcal/g not set"}</span>
                          <strong>{calories ? `${calories} kcal` : "0 kcal"}</strong>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="pd-nutrition-empty">A discriminação calórica por ingrediente ainda não está listada para este item.</p>
              )}
            </article>
          </div>
        </section>

        <section className="pd-section pd-reviews" id="reviews">
          <div className="pd-review-heading">
            <div className="pd-section-heading">
              <p>Avaliações dos clientes</p>
              <h2>{totalReviews > 0 ? `${averageRating?.toFixed(1)} de média` : "Seja o primeiro a avaliar"}</h2>
            </div>
            <button type="button" className="pd-add-review-btn mb-4" onClick={handleAddReviewClick}>
              {existingProductReview ? "Editar avaliação" : "Adicionar avaliação"}
            </button>
          </div>

          <div className="pd-review-toolbar">
            {(["all", "5", "4", "with-text"] as ReviewFilter[]).map(filter => (
              <button
                key={filter}
                type="button"
                className={reviewFilter === filter ? "active" : ""}
                onClick={() => setReviewFilter(filter)}
              >
                {filter === "all" ? "Todas" : filter === "with-text" ? "Com texto" : `${filter}+ estrelas`}
              </button>
            ))}
          </div>

          {showReviewForm && (
            <div className="pd-review-form">
              <div className="pd-review-form-head">
                <div>
                  <p>{editingReviewId ? "Editar a sua avaliação" : "A sua avaliação"}</p>
                  <h3>{editingReviewId ? "Atualize o que partilhou" : "Avalie um item comprado"}</h3>
                </div>
                {(editingReviewId || reviewFormOpen) && <button type="button" onClick={resetReviewForm}>Cancelar</button>}
              </div>

              {!editingReviewId && reviewableItems.length > 1 && (
                <label className="pd-review-field">
                  Item comprado
                 
                </label>
              )}

              <div className="pd-review-stars" aria-label="Avaliação">
                {[1, 2, 3, 4, 5].map(value => (
                  <button
                    key={value}
                    type="button"
                    className={value <= reviewRating ? "active" : ""}
                    onClick={() => setReviewRating(value)}
                    aria-label={`${value} estrelas`}
                  >
                    <Star size={20} fill="currentColor" />
                  </button>
                ))}
              </div>

              <label className="pd-review-field">
                Título
                <input maxLength={120} value={reviewTitle} onChange={event => setReviewTitle(event.target.value)} placeholder="Um título rápido" />
              </label>

              <label className="pd-review-field">
                Comentário
                <Textarea rows={4} maxLength={1000} value={reviewComment} onChange={event => setReviewComment(event.target.value)} placeholder="O que se destacou?" />
              </label>

              {reviewError && <p className="pd-review-error">{reviewError}</p>}
              <button type="button" className="pd-review-submit" onClick={handleSubmitReview} disabled={reviewSubmitting || (!editingReviewId && !selectedOrderItemId)}>
                {reviewSubmitting ? "A guardar..." : editingReviewId ? "Guardar avaliação" : "Publicar avaliação"}
              </button>
            </div>
          )}

          {!showReviewForm && reviewEligibility?.authenticated && <p className="pd-review-note">{reviewEligibility.message}</p>}
          {!showReviewForm && reviewEligibility && !reviewEligibility.authenticated && (
            <div className="pd-review-login">
              <p>{reviewEligibility.message}</p>
              <Link to="/login">Iniciar sessão para escrever uma avaliação</Link>
            </div>
          )}

          <div className="pd-review-list">
            {filteredReviews.length > 0 ? (
              filteredReviews.map(review => {
                const adminReactions = PUBLIC_REVIEW_REACTIONS.map(({ type, label, Icon }) => ({
                  type,
                  label,
                  Icon,
                  count: review.reactions?.filter(reaction => reaction.tipo === type).length ?? 0,
                })).filter(reaction => reaction.count > 0)

                return (
                  <article key={review.id_review} className="pd-review-item">
                    <div className="pd-review-item-head">
                      <div>
                        <strong>{review.cliente_nome ?? "Cliente BONEFREE"}</strong>
                        <span>{new Date(review.data_criacao).toLocaleDateString("pt-PT")}</span>
                      </div>
                      <div className="pd-review-item-rating"><Star size={16} fill="currentColor" />{review.rating}</div>
                    </div>
                    {review.titulo && <h3>{review.titulo}</h3>}
                    {review.comentario && <p>{review.comentario}</p>}
                    {adminReactions.length > 0 && (
                      <div className="pd-review-reactions" aria-label="Reações da equipa">
                        {adminReactions.map(({ type, label, Icon, count }) => (
                          <span key={type} title={label}>
                            <Icon size={14} />
                            {count}
                          </span>
                        ))}
                      </div>
                    )}
                    {review.reply?.texto && (
                      <div className="pd-review-admin-reply">
                        <div>
                          <MessageCircle size={16} />
                          <strong>Resposta da BONEFREE</strong>
                          <span>{new Date(review.reply.updated_at || review.reply.created_at).toLocaleDateString("pt-PT")}</span>
                        </div>
                        <p>{review.reply.texto}</p>
                      </div>
                    )}
                    {review.is_owner && (
                      <div className="pd-review-actions">
                        <button type="button" onClick={() => handleEditReview(review)}>Editar</button>
                        <button type="button" onClick={() => handleDeleteReview(review)} disabled={reviewSubmitting}>Apagar</button>
                      </div>
                    )}
                  </article>
                )
              })
            ) : (
              <div className="pd-empty-card">
                <h3>Nenhuma avaliação corresponde a este filtro</h3>
                <p>Experimente outro filtro ou volte mais tarde depois de mais clientes pedirem.</p>
              </div>
            )}
          </div>
        </section>

        <section className="pd-section pd-faq" id="faq">
          <div className="pd-section-heading">
            <p>FAQ</p>
            <h2>Respostas antes do checkout</h2>
          </div>
          <div className="pd-faq-list">
            <details open><summary>Posso personalizar este item?<ChevronDown size={18} /></summary><p>{product.customizavel ? "Sim. Use o painel de personalização acima para remover, adicionar ou indicar preferências." : "Este item usa preparação padrão, mas pode pedir orientação à equipa."}</p></details>
            <details><summary>A estimativa de entrega é precisa?<ChevronDown size={18} /></summary><p>A estimativa reflete a janela de preparação atual e pode mudar se a cozinha estiver ocupada.</p></details>
            <details><summary>E se tiver alergias?<ChevronDown size={18} /></summary><p>Adicione uma nota antes do checkout e fale com a equipa antes de pedir para confirmar ingredientes.</p></details>
            <details><summary>Posso voltar a pedir isto mais tarde?<ChevronDown size={18} /></summary><p>Sim. O seu histórico de pedidos pode ser usado para rever itens anteriores e voltar a pedir produtos disponíveis.</p></details>
          </div>
        </section>

        {relatedProducts.length > 0 && (
          <section className="pd-section pd-related pd-popular">
            <div className="pd-section-heading">
              <p>Mais populares</p>
              <h2>Favoritos dos clientes em {product.category}</h2>
            </div>
            <div className="pd-related-grid">
              {relatedProducts.map(rel => (
                <ProductCard key={rel.id} product={rel} onSelect={() => navigate(`/product/${rel.id}`)} />
              ))}
            </div>
          </section>
        )}

        {recentProducts.length > 0 && (
          <section className="pd-section pd-related">
            <div className="pd-section-heading">
              <p>Vistos recentemente</p>
              <h2>Continue a comparar</h2>
            </div>
            <div className="pd-related-grid">
              {recentProducts.map(recent => (
                <ProductCard key={recent.id} product={recent} onSelect={() => navigate(`/product/${recent.id}`)} />
              ))}
            </div>
          </section>
        )}
      </main>

      <div className="pd-mobile-bar" aria-label="Barra de compra móvel">
        <div>
          <span>{product.name}</span>
          <strong>{formatPrice(customizedUnitPrice * quantity)}</strong>
        </div>
        <button type="button" onClick={() => handleAddToCart(false)} disabled={!canPurchase || addingToCart}>
          {canPurchase ? "Adicionar ao carrinho" : addToCartBlockedLabel}
        </button>
      </div>
    </div>
  )
}

export default ProductDetail
