import {
  BadgeCheck,
  CakeSlice,
  ChevronDown,
  ChevronLeft,
  CupSoda,
  Flame,
  Leaf,
  PackageCheck,
  RotateCcw,
  Salad,
  Sandwich,
  ShieldCheck,
  Soup,
  Sprout,
  TriangleAlert
} from "lucide-react"
import type { MouseEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { useTranslation } from "react-i18next"
import { isApiErrorWithStatus } from "../api/errors"
import Navbar from "../components/Navbar"
import ResourceNotFound from "../components/ResourceNotFound"
import { AvailabilityBadge, Badge, ProductCard, Skeleton } from "../components/ui"
import i18n, { resolvedLocale } from "../i18n"
import { productService } from "../services"
import "../theme.css"
import type {
  Product
} from "../types/product"
import { applyApiImageFallback, productImageFallback, resolveProductImageUrl } from "../utils/imageFallback"
import { formatEuro } from "../utils/money"
import { productMediaUrl } from "../utils/productMedia"
import "./ProductDetail.css"

type GalleryImage = {
  alt: string
  label: string
  src: string
}

const fallbackImage = productImageFallback
const recentlyViewedKey = "bonefree_recently_viewed"
const anchoredSections = [
  { href: "#highlights", labelKey: "productDetail.highlights" },
  { href: "#details", labelKey: "productDetail.details" },
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
  const locale = resolvedLocale()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [product, setProduct] = useState<Product | null>(null)
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([])
  const [recentProducts, setRecentProducts] = useState<Product[]>([])
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imageFrameRef = useRef<HTMLDivElement | null>(null)
  const imageZoomRafRef = useRef<number | null>(null)
  useEffect(() => () => { if (imageZoomRafRef.current !== null) window.cancelAnimationFrame(imageZoomRafRef.current) }, [])
  useEffect(() => {
    let current = true
    const loadProduct = async () => {
      setLoading(true)
      setError(null)
      setNotFound(false)
      setActiveImageIndex(0)
      setRelatedProducts([])
      setRecentProducts([])
      await productService.getById(id ?? "", locale).then(async data => {
        if (!current) return
        setProduct(data)
        setLoading(false)
        const recentIds = readRecentlyViewed().filter(value => value !== data.id).slice(0, 8)
        try { localStorage.setItem(recentlyViewedKey, JSON.stringify([data.id, ...recentIds])) } catch { /* Browsing also works without storage. */ }
        const [related, recent] = await Promise.allSettled([
          productService.getPage({ page: 1, perPage: 5, categoryId: data.categoryId, locale }),
          recentIds.length ? productService.getPage({ page: 1, perPage: recentIds.length, productIds: recentIds, locale }) : Promise.resolve({ items: [] as Product[] }),
        ])
        if (!current) return
        if (related.status === "fulfilled") setRelatedProducts(related.value.items.filter(item => item.id !== data.id && item.categoryId === data.categoryId).slice(0, 4))
        if (recent.status === "fulfilled") setRecentProducts(recentIds.flatMap(value => recent.value.items.filter(item => item.id === value)).slice(0, 4))
      }).catch(err => {
        if (!current) return
        setProduct(null)
        if (isApiErrorWithStatus(err, 404)) setNotFound(true)
        else setError(t("productDetail.loadError"))
        setLoading(false)
      })
    }
    void loadProduct()
    return () => { current = false }
  }, [id, locale, t])
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

  if (loading) return <div className="pd-page"><Navbar /><div className="pd-loading"><Skeleton width="min(100%, 1180px)" height="620px" /></div></div>
  if (notFound) return <ResourceNotFound kind="product" />
  if (error) return <div className="pd-page"><Navbar /><div className="pd-loading pd-state-card"><p className="pd-error">{error}</p><Link to="/menu">{t("productDetail.backMenu")}</Link></div></div>
  if (!product) return null
  const isAvailable = product.available
  const unavailableLabel = t("productCard.currentlyUnavailable")
  const ingredientBreakdown = product.ingredients ?? []
  const inactiveNonBaseIngredients = ingredientBreakdown.filter(ingredient => ingredient.status === "inactive" && ingredient.type !== "base")
  const inactiveIngredientNames = inactiveNonBaseIngredients.map(ingredient => ingredient.name).join(", ")
  const productCalories = formatCalories(productCalorieTotal(product))
  const activeImage = galleryImages[activeImageIndex] ?? galleryImages[0]
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

          <aside className="pd-info-panel" aria-label={t("productDetail.productInfo")}>
            <div className="pd-badge-row">
              <AvailabilityBadge available={isAvailable} />
              <Badge variant="glass" size="sm">{t("productDetail.plantBased")}</Badge>
              {product.glutenFree && <Badge variant="neutral" size="sm">{t("menu.glutenFree")}</Badge>}
              {product.containsAlcohol && <Badge variant="neutral" size="sm">{t("menu.alcohol")}</Badge>}
            </div>

            <div className="pd-title-row">
              <div>
                <p className="pd-kicker">{t("productDetail.premium")}</p>
                <h1>{product.name}</h1>
              </div>
            </div>

            <div className="pd-price-card">
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

            <div className="pd-assurance-grid">
              <div><RotateCcw size={18} /><span>{t("productDetail.easyHelp")}</span><strong>{t("productDetail.speakTeam")}</strong></div>
              <div><ShieldCheck size={18} /><span>{t("productDetail.qualityPromise")}</span><strong>{t("productDetail.freshlyPrepared")}</strong></div>
            </div>
          </aside>
        </section>

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
              </ul>
            </article>
            <article className="pd-spec-card">
              <h3>{t("productDetail.specifications")}</h3>
              <dl>
                <div><dt>{t("productDetail.category")}</dt><dd>{product.category}</dd></div>
                <div><dt>{t("productDetail.availability")}</dt><dd>{isAvailable ? t("productCard.available") : unavailableLabel}</dd></div>
                <div><dt>{t("productDetail.caloriesLabel")}</dt><dd>{productCalories ? `${productCalories} kcal` : t("productDetail.notSpecified")}</dd></div>
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

        <section className="pd-section pd-faq" id="faq">
          <div className="pd-section-heading">
            <p>FAQ</p>
            <h2>{t("productDetail.faqTitle")}</h2>
          </div>
          <div className="pd-faq-list">
            <details><summary>{t("productDetail.faqAllergies")}<ChevronDown size={18} /></summary><p>{t("productDetail.faqAllergiesText")}</p></details>
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
    </div>
  )
}

export default ProductDetail
