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
import { isApiErrorWithStatus } from "../api/errors"
import Navbar from "../components/Navbar"
import ResourceNotFound from "../components/ResourceNotFound"
import { AddToCartButton, AvailabilityBadge, Badge, ProductCard, Skeleton, Textarea } from "../components/ui"
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
import { applyApiImageFallback, productImageFallback, resolveProductImageUrl } from "../utils/imageFallback"
import { formatEuro } from "../utils/money"
import { productMediaUrl } from "../utils/productMedia"
import { translateUserMessage } from "../utils/messages"
import { useTranslation } from "react-i18next"
import i18n, { resolvedLocale } from "../i18n"

type GalleryImage = {
  alt: string
  label: string
  src: string
}

type ReviewFilter = "all" | "5" | "4" | "with-text"
const PUBLIC_REVIEW_REACTIONS = [
  { type: "like", labelKey: "productDetail.likedByTeam", Icon: ThumbsUp },
] as const

const fallbackImage = productImageFallback
const recentlyViewedKey = "bonefree_recently_viewed"
const customizationAddSurcharge = 1
function customizationOptionLabel(_field: "remove" | "add" | "preferences", option: string) {
  return option
}

const anchoredSections = [
  { href: "#highlights", labelKey: "productDetail.highlights" },
  { href: "#details", labelKey: "productDetail.details" },
  { href: "#reviews", labelKey: "productDetail.reviewsSection" },
  { href: "#faq", labelKey: "FAQ" },
]

function getImage(img: string | null | undefined) {
  return resolveProductImageUrl(img, fallbackImage)
}

function formatPrice(price: number | null | undefined) {
  return formatEuro(price)
}

function formatCalories(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null
  return value.toLocaleString(resolvedLocale(), { maximumFractionDigits: 1 })
}

function productCalorieTotal(product: Product) {
  if (
    product.totalCalories != null &&
    Number.isFinite(Number(product.totalCalories)) &&
    Number(product.totalCalories) > 0
  ) {
    return Number(product.totalCalories)
  }
  const ingredientTotal = (product.ingredients ?? []).reduce((sum, ingredient) => {
    const calories = Number(ingredient.calories ?? 0)
    return Number.isFinite(calories) && calories > 0 ? sum + calories : sum
  }, 0)
  return ingredientTotal > 0 ? ingredientTotal : null
}

function ingredientTypeLabel(type: string) {
  const labels: Record<string, string> = {
    INGREDIENTES_NORMAIS: i18n.t("productDetail.ingredientTypes.normal", { ns: "storefront" }),
    MOLHO: i18n.t("productDetail.ingredientTypes.sauce", { ns: "storefront" }),
    EXTRA: i18n.t("productDetail.ingredientTypes.extra", { ns: "storefront" }),
    BEBIDA: i18n.t("productDetail.ingredientTypes.drink", { ns: "storefront" }),
    BASE: i18n.t("productDetail.ingredientTypes.base", { ns: "storefront" }),
    ACOMPANHAMENTO: i18n.t("productDetail.ingredientTypes.side", { ns: "storefront" }),
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
  const { t } = useTranslation("storefront")
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
  const [notFound, setNotFound] = useState(false)
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
      let primaryProductLoaded = false
      setLoading(true)
      setError(null)
      setNotFound(false)
      try {
        const data = await productService.getById(productId)
        primaryProductLoaded = true
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

        if (!data.available) {
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
          const firstReviewableItem = eligibility.existingReview ? null : eligibility.items.find(item => !item.existingReview)
          setSelectedOrderItemId(firstReviewableItem?.orderProductId ?? "")
        } catch (reviewLoadError) {
          console.error("Não foi possível carregar avaliações.", reviewLoadError)
          setReviewStats(null)
          setReviews([])
          setReviewEligibility(null)
          setSelectedOrderItemId("")
        }
      } catch (fetchError) {
        if (!primaryProductLoaded && isApiErrorWithStatus(fetchError, 404)) {
          setProduct(null)
          setNotFound(true)
          return
        }
        setError(t("productDetail.loadError"))
        console.error(fetchError)
      } finally {
        setLoading(false)
      }
    }

    fetchProduct()
  }, [id, token, t])

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
    if (!product.available) {
      setToastError(true)
      setToastMessage(product.unavailableReason || t("productDetail.unavailableItem"))
      setTimeout(() => setToastMessage(null), 3000)
      return
    }
    setAddingToCart(true)
    try {
      const pricedCustomization = hasCustomization(customization)
        ? {
            ...customization,
            finalUnitPrice: Number(product.price ?? 0) + (customization.add.length * customizationAddSurcharge),
          }
        : null

      await cartService.addItem(
        product.id,
        quantity,
        pricedCustomization,
      )
      window.dispatchEvent(new Event("cartUpdated"))
      setToastError(false)
      setToastMessage(goToCheckout ? t("productDetail.addedCheckout") : t("productDetail.added"))
      if (goToCheckout) {
        navigate("/checkout")
      } else {
        setQuantity(1)
        setCustomization(emptyCustomization())
      }
    } catch (err) {
      setToastError(true)
      setToastMessage(t("productDetail.addError"))
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
    const firstReviewableItem = eligibility.existingReview ? null : eligibility.items.find(item => !item.existingReview)
    setSelectedOrderItemId(firstReviewableItem?.orderProductId ?? "")
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
      setToastMessage(t("productDetail.reviewsLoading"))
      toast.info(t("productDetail.reviewsLoading"))
      setTimeout(() => setToastMessage(null), 3000)
      return
    }

    if (!reviewEligibility.authenticated) {
      setToastError(true)
      setToastMessage(t("productDetail.reviewLogin"))
      toast.warning(t("productDetail.reviewLogin"))
      setTimeout(() => setToastMessage(null), 3000)
      return
    }

    if (reviewEligibility.existingReview) {
      handleEditReview(reviewEligibility.existingReview)
      setToastError(false)
      setToastMessage(t("productDetail.alreadyReviewed"))
      toast.info(t("productDetail.alreadyReviewed"))
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
          title: reviewTitle,
          comment: reviewComment,
        })
        setToastError(false)
        setToastMessage(t("productDetail.reviewUpdated"))
        toast.success(t("productDetail.reviewUpdatedSuccess"))
      } else {
        if (!selectedOrderItemId) throw new Error(t("productDetail.choosePurchased"))
        await productService.createReview(product.id, {
          orderProductId: Number(selectedOrderItemId),
          rating: reviewRating,
          title: reviewTitle,
          comment: reviewComment,
        })
        setToastError(false)
        setToastMessage(t("productDetail.reviewPublished"))
        toast.success(t("productDetail.reviewPublishedSuccess"))
      }
      resetReviewForm()
      await reloadReviews(product.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : t("productDetail.reviewSaveError")
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
    setEditingReviewId(review.reviewId)
    setReviewFormOpen(true)
    setReviewRating(review.rating)
    setReviewTitle(review.title ?? "")
    setReviewComment(review.comment ?? "")
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
      await productService.deleteReview(review.reviewId)
      if (editingReviewId === review.reviewId) resetReviewForm()
      await reloadReviews(product.id)
      setToastError(false)
      setToastMessage(t("productDetail.reviewDeleted"))
      setReviewToDelete(null)
      toast.success(t("productDetail.reviewDeletedSuccess"))
    } catch (err) {
      const message = err instanceof Error ? err.message : t("productDetail.reviewDeleteError")
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
    const suggestionProduct = productsById[suggestion.productId]
    const price = suggestion.price ?? suggestionProduct?.price ?? 0
    const productShape: Product = {
      id: suggestion.productId,
      idDisplay: suggestion.productDisplayId,
      category: suggestion.category,
      name: suggestion.name,
      description: suggestion.reason,
      media: suggestionProduct?.media ?? [],
      price,
      available: true,
      customizable: suggestionProduct?.customizable ?? false,
    }

    return (
      <ProductCard
        key={suggestion.productId}
        product={productShape}
        onSelect={() => navigate(`/product/${suggestion.productId}`)}
      />
    )
  }

  const galleryImages = useMemo<GalleryImage[]>(() => {
    if (!product) return []
    const sources = product.media.map((media) => productMediaUrl(media, "detail"))
    return sources
      .filter((src): src is string => typeof src === "string")
      .map(src => getImage(src))
      .filter((src, index, all) => src && all.indexOf(src) === index)
      .map((src, index) => ({
        alt: index === 0 ? product.name : `${product.name} ${index + 1}`,
        label: index === 0 ? t("productDetail.mainImage") : t("productDetail.image", { count: index + 1 }),
        src,
      }))
  }, [product, t])

  if (loading) return (
    <div className="pd-page">
      <Navbar />
      <div className="pd-loading">
        <Skeleton width="min(100%, 1180px)" height="620px" radius="var(--radius-md)" />
      </div>
    </div>
  )

  if (notFound) return <ResourceNotFound kind="product" />

  if (error) return (
    <div className="pd-page">
      <Navbar />
      <div className="pd-loading pd-state-card">
        <p className="pd-error">{error}</p>
        <button className="pd-back-btn" onClick={() => navigate("/menu")}>{t("productDetail.backMenu")}</button>
      </div>
    </div>
  )

  if (!product) return null

  const canPurchase = product.available
  const unavailableLabel = t("productCard.currentlyUnavailable")
  const addToCartBlockedLabel = canPurchase ? t("productDetail.addToCart") : unavailableLabel
  const buyNowBlockedLabel = canPurchase ? t("productDetail.buyNow") : unavailableLabel
  const ingredientBreakdown = product.ingredients ?? []
  const inactiveNonBaseIngredients = ingredientBreakdown.filter(
    ingredient => ingredient.status === "inactive" && ingredient.type !== "base",
  )
  const inactiveIngredientNames = inactiveNonBaseIngredients.map(ingredient => ingredient.name).join(", ")
  const productCalories = formatCalories(productCalorieTotal(product))
  const substituteSuggestions = availabilitySuggestions?.substitutes ?? []
  const substituteIds = new Set(substituteSuggestions.map(suggestion => suggestion.productId))
  const similarDishSuggestions = (availabilitySuggestions?.similarDishes ?? [])
    .filter(suggestion => !substituteIds.has(suggestion.productId))
  const hasSuggestions = !canPurchase && (substituteSuggestions.length > 0 || similarDishSuggestions.length > 0)
  const averageRating = reviewStats?.averageRating
  const totalReviews = reviewStats?.totalReviews ?? 0
  const existingProductReview = reviewEligibility?.existingReview ?? null
  const reviewableItems = existingProductReview ? [] : reviewEligibility?.items.filter(item => !item.existingReview) ?? []
  const canCreateReview = Boolean(reviewEligibility?.authenticated && reviewableItems.length > 0)
  const showReviewForm = (reviewFormOpen && canCreateReview) || editingReviewId !== null
  const activeImage = galleryImages[activeImageIndex] ?? galleryImages[0]
  const discountPercent = Number(product.discountPercent ?? 0)
  const showDiscount =
    discountPercent > 0 &&
    product.originalPrice != null &&
    Number(product.originalPrice) > Number(product.price ?? 0)
  const selectedCustomizationCount =
    customization.remove.length +
    customization.add.length +
    customization.preferences.length +
    (customization.note?.trim() ? 1 : 0)
  const customizedUnitPrice =
    Number(product.price ?? 0) + (customization.add.length * customizationAddSurcharge)
  const customizationGroups = [
    { key: "remove", label: t("productDetail.remove"), options: customizationOptions.remove },
    { key: "add", label: t("productDetail.addEach", { price: formatEuro(customizationAddSurcharge) }), options: customizationOptions.add },
    { key: "preferences", label: t("productDetail.preferences"), options: customizationOptions.preferences },
  ] as const
  const filteredReviews = reviews.filter(review => {
    if (reviewFilter === "5") return review.rating === 5
    if (reviewFilter === "4") return review.rating >= 4
    if (reviewFilter === "with-text") return Boolean(review.comment?.trim() || review.title?.trim())
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
            aria-label={t("productDetail.dismiss")}
            className="toast-close"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(reviewToDelete)}
        title={t("productDetail.deleteReviewTitle")}
        description={t("productDetail.deleteReviewDescription")}
        confirmText={t("productDetail.deleteReview")}
        cancelText={t("productDetail.cancel")}
        danger
        loading={reviewSubmitting}
        onConfirm={() => void confirmDeleteReview()}
        onCancel={() => {
          if (!reviewSubmitting) setReviewToDelete(null)
        }}
      />

      <main className="pd-shell">
        <nav className="pd-breadcrumb" aria-label={t("productDetail.breadcrumb")}>
          <button className="pd-back-btn" onClick={handleBack} type="button">
            <ChevronLeft size={17} />
            {t("productDetail.back")}
          </button>
          <Link to="/">{t("productDetail.home")}</Link>
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
                  applyApiImageFallback(event.currentTarget, fallbackImage)
                }}
              />
            <div className="pd-gallery-topline ">
              <Badge variant="accent" size="sm">{product.category}</Badge>
              <span><Leaf size={15} /> {t("productDetail.vegan")}</span>
            </div>
            </div>

            <div className="pd-thumbnails  " aria-label={t("productDetail.gallery")}>
              {galleryImages.map((image, index) => (
                <button

                  key={`${image.src}-${index}`}
                  type="button"
                  className={activeImageIndex === index ? "active p-1" : "p-2"}
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={t("productDetail.showImage", { label: image.label })}
                >
                  <img
                    src={image.src}
                    alt=""
                    onError={event => {
                      applyApiImageFallback(event.currentTarget, fallbackImage)
                    }}
                  />
                </button>
              ))}
            </div>

            <div className="pd-gallery-meta" >
              <span><Leaf size={16} /> {t("productDetail.vegan")}</span>
              <span><Sprout size={16} /> {t("productDetail.plantIngredients")}</span>
              <span><BadgeCheck size={16} /> {t("productDetail.freshlyPrepared")}</span>
            </div>
          </div>

          <aside className="pd-buy-panel" aria-label={t("productDetail.purchaseOptions")}>
            <div className="pd-badge-row">
              <AvailabilityBadge available={canPurchase} />
              <Badge variant="glass" size="sm">{t("productDetail.plantBased")}</Badge>
              <Badge variant="neutral" size="sm">{t("productDetail.tableOrder")}</Badge>
            </div>

            <div className="pd-title-row">
              <div>
                <p className="pd-kicker">{t("productDetail.premium")}</p>
                <h1>{product.name}</h1>
              </div>
            </div>

            <a className="pd-rating-link" href="#reviews">
              <span>
                <Star size={17} fill="currentColor" />
                {averageRating?.toFixed(1) ?? t("productDetail.new")}
              </span>
              <strong>{t("productDetail.reviews", { count: totalReviews })}</strong>
            </a>

            <div className="pd-price-card">
              {showDiscount && <em>{t("productDetail.discount", { count: discountPercent })}</em>}
              {showDiscount && <del>{formatPrice(product.originalPrice)}</del>}
              <strong className="red">{formatPrice(product.price)}</strong>
              {productCalories && (
                <span className="pd-calorie-line" title={t("productDetail.calories", { count: productCalories })}>
                  <Flame aria-hidden="true" />
                  {productCalories} kcal
                </span>
              )}
            </div>

            <p className="pd-desc">
              {product.description || t("productDetail.fallbackDescription")}
            </p>

            {inactiveNonBaseIngredients.length > 0 && (
              <div className="pd-ingredient-alert" role="status">
                <TriangleAlert size={18} aria-hidden="true" />
                <div>
                  <strong>{t("productDetail.ingredientUnavailable")}</strong>
                  <span>
                    {t("productDetail.ingredientAdjustment", { ingredients: inactiveIngredientNames })}
                  </span>
                </div>
              </div>
            )}

            {canPurchase && product.customizable && (
              <details className="pd-customizer" open>
                <summary>
                  <span>{t("productDetail.customiseOrder")}</span>
                  <strong>{t("productDetail.selected", { count: selectedCustomizationCount })}</strong>
                  <ChevronDown size={18} />
                </summary>
                <div className="pd-customizer-body">
                  <p className="pd-customizer-note">
                    {t("productDetail.customisationNote", { price: formatEuro(customizationAddSurcharge) })}
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
                    {t("productDetail.specialInstructions")}
                    <Textarea
                      rows={3}
                      maxLength={280}
                      value={customization.note ?? ""}
                      onChange={event => updateCustomizationNote(event.target.value)}
                      placeholder={t("productDetail.notePlaceholder")}
                    />
                  </label>
                </div>
              </details>
            )}

            <div className="pd-purchase-row">
              <div className="pd-qty-row" aria-label={t("productDetail.quantity", { name: product.name })}>
                <button
                  className="pd-qty-btn"
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={!canPurchase || quantity <= 1}
                  aria-label={t("productDetail.decrease")}
                >
                  <Minus size={18} />
                </button>
                <span className="pd-qty-num">{quantity}</span>
                <button
                  className="pd-qty-btn"
                  type="button"
                  onClick={() => setQuantity(q => Math.min(99, q + 1))}
                  disabled={!canPurchase || quantity >= 99}
                  aria-label={t("productDetail.increase")}
                >
                  <Plus size={18} />
                </button>
              </div>

              <AddToCartButton
                className="pd-cta"
                onClick={() => handleAddToCart(false)}
                disabled={!canPurchase || addingToCart}
                isLoading={addingToCart}
                unavailable={!canPurchase}
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
              {canPurchase ? t("productDetail.buyNow") : buyNowBlockedLabel}
            </button>

            <div className="pd-assurance-grid">
              <div><RotateCcw size={18} /><span>{t("productDetail.easyHelp")}</span><strong>{t("productDetail.speakTeam")}</strong></div>
              <div><ShieldCheck size={18} /><span>{t("productDetail.qualityPromise")}</span><strong>{t("productDetail.freshlyPrepared")}</strong></div>
            </div>
          </aside>
        </section>

        {hasSuggestions && (
          <section className="pd-section pd-related pd-suggestions pd-suggestions-top">
            <div className="pd-section-heading">
              <p>{t("productDetail.alternatives")}</p>
              <h2>{t("productDetail.similarReady")}</h2>
            </div>
            {substituteSuggestions.length > 0 && (
              <div className="pd-suggestion-block">
                <h3>{t("productDetail.substitutes")}</h3>
                <div className="pd-related-grid">{substituteSuggestions.map(renderSuggestionCard)}</div>
              </div>
            )}
            {similarDishSuggestions.length > 0 && (
              <div className="pd-suggestion-block">
                <h3>{t("productDetail.similar")}</h3>
                <div className="pd-related-grid">{similarDishSuggestions.map(renderSuggestionCard)}</div>
              </div>
            )}
          </section>
        )}

        <nav className="pd-anchor-nav" aria-label={t("productDetail.sections")}>
          {anchoredSections.map(section => (
            <a key={section.href} href={section.href}>{section.labelKey === "FAQ" ? "FAQ" : t(section.labelKey)}</a>
          ))}
        </nav>

        <section className="pd-section pd-highlights" id="highlights">
          <div className="pd-section-heading">
            <p>{t("productDetail.why")}</p>
            <h2>{t("productDetail.confidence")}</h2>
          </div>
          <div className="pd-highlight-grid">
            <article><PackageCheck size={22} /><h3>{t("productDetail.freshPreparation")}</h3><p>{t("productDetail.freshPreparationText")}</p></article>
            <article><BadgeCheck size={22} /><h3>{t("productDetail.plantStandards")}</h3><p>{t("productDetail.plantStandardsText")}</p></article>
            <article><ShieldCheck size={22} /><h3>{t("productDetail.reliableCheckout")}</h3><p>{t("productDetail.reliableCheckoutText")}</p></article>
          </div>
        </section>

        <section className="pd-section pd-details" id="details">
          <div className="pd-section-heading">
            <p>{t("productDetail.productInfo")}</p>
            <h2>{t("productDetail.choiceDetails")}</h2>
          </div>
          <div className="pd-info-grid">
            <article className="pd-copy-card">
              <h3>{t("productDetail.description")}</h3>
              <p>{product.description || t("productDetail.signatureDescription")}</p>
              <ul>
                <li>{t("productDetail.portion")}</li>
                <li>{t("productDetail.personalNotes")}</li>
                <li>{t("productDetail.madeAfterOrder")}</li>
              </ul>
            </article>
            <article className="pd-spec-card">
              <h3>{t("productDetail.specifications")}</h3>
              <dl>
                <div><dt>{t("productDetail.category")}</dt><dd>{product.category}</dd></div>
                <div><dt>{t("productDetail.availability")}</dt><dd>{canPurchase ? t("productCard.available") : unavailableLabel}</dd></div>
                <div><dt>{t("productDetail.caloriesLabel")}</dt><dd>{productCalories ? `${productCalories} kcal` : t("productDetail.notSpecified")}</dd></div>
                <div><dt>{t("productDetail.customisation")}</dt><dd>{product.customizable ? t("productCard.available") : t("productDetail.standardPreparation")}</dd></div>
                <div><dt>{t("productDetail.diet")}</dt><dd>{t("productDetail.vegan")}</dd></div>
              </dl>
            </article>
            <article className="pd-nutrition-card">
              <div className="pd-nutrition-head">
                <div>
                  <h3>{t("productDetail.ingredientCalories")}</h3>
                  <p>{t("productDetail.calorieEstimate")}</p>
                </div>
                {productCalories && <strong>{productCalories} kcal</strong>}
              </div>
              {ingredientBreakdown.length > 0 ? (
                <div className="pd-nutrition-list">
                  {ingredientBreakdown.map((ingredient) => {
                    const calories = formatCalories(ingredient.calories)
                    const caloriesPerGram = formatCalories(ingredient.caloriesPerGram)
                    const inactive = ingredient.status === "inactive"
                    return (
                      <div key={ingredient.ingredientId} className={`pd-nutrition-row ${inactive ? "is-inactive" : ""}`}>
                        <div>
                          <strong>
                            {ingredient.name}
                            {inactive && <em>{t("productDetail.ingredientInactive")}</em>}
                          </strong>
                          <span>{ingredientTypeLabel(ingredient.type)} · {ingredient.quantity || t("productDetail.quantityUndefined")}</span>
                        </div>
                        <div>
                          <span>{caloriesPerGram ? `${caloriesPerGram} kcal/g` : t("productDetail.kcalUndefined")}</span>
                          <strong>{calories ? `${calories} kcal` : "0 kcal"}</strong>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="pd-nutrition-empty">{t("productDetail.nutritionEmpty")}</p>
              )}
            </article>
          </div>
        </section>

        <section className="pd-section pd-reviews" id="reviews">
          <div className="pd-review-heading">
            <div className="pd-section-heading">
              <p>{t("productDetail.customerReviews")}</p>
              <h2>{totalReviews > 0 ? t("productDetail.average", { rating: averageRating?.toFixed(1) }) : t("productDetail.firstReview")}</h2>
            </div>
            <button type="button" className="pd-add-review-btn mb-4" onClick={handleAddReviewClick}>
              {existingProductReview ? t("productDetail.editReview") : t("productDetail.addReview")}
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
                {filter === "all" ? t("productDetail.allReviews") : filter === "with-text" ? t("productDetail.withText") : t("productDetail.stars", { count: filter })}
              </button>
            ))}
          </div>

          {showReviewForm && (
            <div className="pd-review-form">
              <div className="pd-review-form-head">
                <div>
                  <p>{editingReviewId ? t("productDetail.editYours") : t("productDetail.yourReview")}</p>
                  <h3>{editingReviewId ? t("productDetail.updateShared") : t("productDetail.reviewPurchased")}</h3>
                </div>
                {(editingReviewId || reviewFormOpen) && <button type="button" onClick={resetReviewForm}>{t("productDetail.cancel")}</button>}
              </div>

              {!editingReviewId && reviewableItems.length > 1 && (
                <label className="pd-review-field">
                  {t("productDetail.purchasedItem")}

                </label>
              )}

              <div className="pd-review-stars" aria-label={t("productDetail.rating")}>
                {[1, 2, 3, 4, 5].map(value => (
                  <button
                    key={value}
                    type="button"
                    className={value <= reviewRating ? "active" : ""}
                    onClick={() => setReviewRating(value)}
                    aria-label={t("productDetail.star", { count: value })}
                  >
                    <Star size={20} fill="currentColor" />
                  </button>
                ))}
              </div>

              <label className="pd-review-field">
                {t("productDetail.title")}
                <input maxLength={120} value={reviewTitle} onChange={event => setReviewTitle(event.target.value)} placeholder={t("productDetail.titlePlaceholder")} />
              </label>

              <label className="pd-review-field">
                {t("productDetail.comment")}
                <Textarea rows={4} maxLength={1000} value={reviewComment} onChange={event => setReviewComment(event.target.value)} placeholder={t("productDetail.commentPlaceholder")} />
              </label>

              {reviewError && <p className="pd-review-error">{reviewError}</p>}
              <button type="button" className="pd-review-submit" onClick={handleSubmitReview} disabled={reviewSubmitting || (!editingReviewId && !selectedOrderItemId)}>
                {reviewSubmitting ? t("productDetail.saving") : editingReviewId ? t("productDetail.saveReview") : t("productDetail.publishReview")}
              </button>
            </div>
          )}

          {!showReviewForm && reviewEligibility?.authenticated && <p className="pd-review-note">{translateUserMessage(reviewEligibility.message)}</p>}
          {!showReviewForm && reviewEligibility && !reviewEligibility.authenticated && (
            <div className="pd-review-login">
              <p>{translateUserMessage(reviewEligibility.message)}</p>
              <Link to="/login">{t("productDetail.reviewSignIn")}</Link>
            </div>
          )}

          <div className="pd-review-list">
            {filteredReviews.length > 0 ? (
              filteredReviews.map(review => {
                const adminReactions = PUBLIC_REVIEW_REACTIONS.map(({ type, labelKey, Icon }) => ({
                  type,
                  label: t(labelKey),
                  Icon,
                  count: review.reactions?.filter(reaction => reaction.type === type).length ?? 0,
                })).filter(reaction => reaction.count > 0)

                return (
                  <article key={review.reviewId} className="pd-review-item">
                    <div className="pd-review-item-head">
                      <div>
                        <strong>{review.customerName ?? t("productDetail.customer")}</strong>
                        <span>{new Date(review.createdAt).toLocaleDateString(resolvedLocale())}</span>
                      </div>
                      <div className="pd-review-item-rating"><Star size={16} fill="currentColor" />{review.rating}</div>
                    </div>
                    {review.title && <h3>{review.title}</h3>}
                    {review.comment && <p>{review.comment}</p>}
                    {adminReactions.length > 0 && (
                      <div className="pd-review-reactions" aria-label={t("productDetail.teamReactions")}>
                        {adminReactions.map(({ type, label, Icon, count }) => (
                          <span key={type} title={label}>
                            <Icon size={14} />
                            {count}
                          </span>
                        ))}
                      </div>
                    )}
                    {review.reply?.text && (
                      <div className="pd-review-admin-reply">
                        <div>
                          <MessageCircle size={16} />
                          <strong>{t("productDetail.bonefreeReply")}</strong>
                          <span>{new Date(review.reply.updatedAt || review.reply.createdAt).toLocaleDateString(resolvedLocale())}</span>
                        </div>
                        <p>{review.reply.text}</p>
                      </div>
                    )}
                    {review.isOwner && (
                      <div className="pd-review-actions">
                        <button type="button" onClick={() => handleEditReview(review)}>{t("productDetail.edit")}</button>
                        <button type="button" onClick={() => handleDeleteReview(review)} disabled={reviewSubmitting}>{t("productDetail.delete")}</button>
                      </div>
                    )}
                  </article>
                )
              })
            ) : (
              <div className="pd-empty-card">
                <h3>{t("productDetail.noMatchingReviews")}</h3>
                <p>{t("productDetail.noMatchingReviewsText")}</p>
              </div>
            )}
          </div>
        </section>

        <section className="pd-section pd-faq" id="faq">
          <div className="pd-section-heading">
            <p>FAQ</p>
            <h2>{t("productDetail.faqTitle")}</h2>
          </div>
          <div className="pd-faq-list">
            <details open><summary>{t("productDetail.faqCustomise")}<ChevronDown size={18} /></summary><p>{product.customizable ? t("productDetail.faqCustomiseYes") : t("productDetail.faqCustomiseNo")}</p></details>
            <details><summary>{t("productDetail.faqEstimate")}<ChevronDown size={18} /></summary><p>{t("productDetail.faqEstimateText")}</p></details>
            <details><summary>{t("productDetail.faqAllergies")}<ChevronDown size={18} /></summary><p>{t("productDetail.faqAllergiesText")}</p></details>
            <details><summary>{t("productDetail.faqReorder")}<ChevronDown size={18} /></summary><p>{t("productDetail.faqReorderText")}</p></details>
          </div>
        </section>

        {relatedProducts.length > 0 && (
          <section className="pd-section pd-related pd-popular">
            <div className="pd-section-heading">
              <p>{t("productDetail.popular")}</p>
              <h2>{t("productDetail.favourites", { category: product.category })}</h2>
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
              <p>{t("productDetail.recentlyViewed")}</p>
              <h2>{t("productDetail.compare")}</h2>
            </div>
            <div className="pd-related-grid">
              {recentProducts.map(recent => (
                <ProductCard key={recent.id} product={recent} onSelect={() => navigate(`/product/${recent.id}`)} />
              ))}
            </div>
          </section>
        )}
      </main>

      <div className="pd-mobile-bar" aria-label={t("productDetail.mobileBar")}>
        <div>
          <span>{product.name}</span>
          <strong>{formatPrice(customizedUnitPrice * quantity)}</strong>
        </div>
        <button type="button" onClick={() => handleAddToCart(false)} disabled={!canPurchase || addingToCart}>
          {canPurchase ? t("productDetail.addToCart") : addToCartBlockedLabel}
        </button>
      </div>
    </div>
  )
}

export default ProductDetail
