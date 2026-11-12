import { formatProductPrices } from "../utils/pricing"
import ProductPricingDetails from "../components/ProductPricingDetails"
import ProductImageLightbox from "../components/ProductImageLightbox"
import { ArrowUpRight, ChevronDown, ChevronLeft, Flame, Leaf, Sparkles, TriangleAlert, Waves, ZoomIn } from "lucide-react"
import type { MouseEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { useTranslation } from "react-i18next"
import { isApiErrorWithStatus } from "../api/errors"
import Navbar from "../components/Navbar"
import ProductLabel from "../components/ui/ProductLabel"
import ResourceNotFound from "../components/ResourceNotFound"
import { AvailabilityBadge, Badge, ProductCard, Skeleton } from "../components/ui"
import i18n, { resolvedLocale } from "../i18n"
import { productService } from "../services"
import { applyPageMetadata } from "../seo/documentMetadata"
import { pageMetadata } from "../seo/metadata"
import "../theme.css"
import type {
  Product
} from "../types/product"
import { applyApiImageFallback, productImageFallback, resolveProductImageUrl } from "../utils/imageFallback"
import { productMediaUrl } from "../utils/productMedia"
import "./ProductDetail.css"

type GalleryImage = {
  alt: string
  label: string
  src: string
}

const fallbackImage = productImageFallback
const recentlyViewedKey = "bonefree_recently_viewed"


function getImage(img: string | null | undefined) {
  return resolveProductImageUrl(img, fallbackImage)
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
  const [previewOpen, setPreviewOpen] = useState(false)
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
  useEffect(() => {
    if (loading) return;
    if (product) {
      applyPageMetadata({
        title: `${product.name} | Bonefree`,
        description: product.description || pageMetadata('/menu', locale).description,
        path: `/product/${product.id}`,
      });
    } else {
      applyPageMetadata({
        title: t('resourceNotFound.product.documentTitle'),
        description: t('resourceNotFound.product.description'), noindex: true,
      });
    }
  }, [loading, product, locale, t]);

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
  const ingredientBreakdown = product.ingredients ?? []
  const inactiveNonBaseIngredients = ingredientBreakdown.filter(ingredient => ingredient.status === "inactive" && ingredient.type !== "base")
  const inactiveIngredientNames = inactiveNonBaseIngredients.map(ingredient => ingredient.name).join(", ")
  const productCalories = formatCalories(productCalorieTotal(product))
  const activeImage = galleryImages[activeImageIndex] ?? galleryImages[0]
  return (
    <div className="pd-page">
      <Navbar />
      <div className="pd-doodles" aria-hidden="true"><Leaf /><Waves /><Sparkles /></div>

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

        <section className="pd-hero" aria-labelledby="pd-product-title">
          <div className="pd-gallery">
            <div
              ref={imageFrameRef}
              className="pd-image-frame product-detail-image-zoom"
              onMouseEnter={handleImageZoomEnter}
              onMouseMove={handleImageZoomMove}
              onMouseLeave={resetImageZoom}
            >
              <button type="button" className="pd-image-open" aria-haspopup="dialog" aria-label={t('productCard.enlargeImage', { name: product.name })} onClick={() => { resetImageZoom(); setPreviewOpen(true) }}>
              <img
                src={activeImage?.src ?? fallbackImage}
                alt={activeImage?.alt ?? product.name}
                className="pd-image"
                onError={event => {
                  applyApiImageFallback(event.currentTarget, fallbackImage)
                }}
              />
                <span className="pd-zoom-hint" aria-hidden="true"><ZoomIn size={20} /></span>
              </button>
              <div className="pd-gallery-topline">
                <Badge variant="accent" size="sm">{product.category}</Badge>
                <span><Leaf size={15} /> {t("productDetail.vegan")}</span>
              </div>
            </div>

            {(product.tags ?? []).filter(tag => tag && tag.toLowerCase() !== 'highlight').length > 0 && <div className="pd-product-labels">{(product.tags ?? []).filter(tag => tag && tag.toLowerCase() !== 'highlight').slice(0, 3).map(tag => <ProductLabel key={tag}>{tag}</ProductLabel>)}</div>}

            {galleryImages.length > 1 && <div className="pd-thumbnails" aria-label={t("productDetail.gallery")}>
              {galleryImages.map((image, index) => (
                <button

                  key={`${image.src}-${index}`}
                  type="button"
                  className={activeImageIndex === index ? "active" : undefined}
                  aria-pressed={activeImageIndex === index}
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
            </div>}

          </div>

          <aside className="pd-info-panel" aria-label={t("productDetail.productInfo")}>
            <div className="pd-badge-row">
              <AvailabilityBadge available={isAvailable} />
              <Badge variant="glass" size="sm">{t("productDetail.vegan")}</Badge>
              {product.glutenFree && <Badge variant="neutral" size="sm">{t("menu.glutenFree")}</Badge>}
              {product.containsAlcohol && <Badge variant="neutral" size="sm">{t("menu.alcohol")}</Badge>}
            </div>

            <div className="pd-title-row">
              <div>
                <h1 id="pd-product-title">{product.name}</h1>
              </div>
            </div>

            <p className="pd-desc">
              {product.description || t("productDetail.fallbackDescription")}
            </p>

            <div className="pd-price-card">
              <strong>{formatProductPrices(product)}</strong>
              {productCalories && (
                <span className="pd-calorie-line" title={t("productDetail.calories", { count: productCalories })}>
                  <Flame aria-hidden="true" />
                  {productCalories} kcal
                </span>
              )}
            </div>

            <ProductPricingDetails portions={product.portions} extras={product.extras} />
            <div className="pd-actions"><Link className="pd-reserve-btn" to="/reservations">{t("home.reserveTable")}<ArrowUpRight size={19} aria-hidden="true" /></Link><Link className="pd-menu-link" to="/menu">{t("productDetail.backMenu")}<ArrowUpRight size={17} aria-hidden="true" /></Link></div>


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


          </aside>
        </section>

        <div className="pd-detail-grid">
            <section className="pd-ingredients" aria-labelledby="pd-ingredients-title">
              <h2 id="pd-ingredients-title">{t("productDetail.ingredientsUsed")}</h2>
              {ingredientBreakdown.length > 0 ? (
                <ul>
                  {ingredientBreakdown.map(ingredient => (
                    <li key={ingredient.ingredientId}>
                      <span>{ingredient.name}</span>
                      {ingredient.status === "inactive" && <em>{t("productDetail.ingredientInactive")}</em>}
                    </li>
                  ))}
                </ul>
              ) : <p>{t("productDetail.ingredientsEmpty")}</p>}
            </section>

            <details className="pd-nutrition-details">
              <summary>{t("productDetail.ingredientCalories")}<ChevronDown size={18} aria-hidden="true" /></summary>
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
            </details>
        </div>

        <section className="pd-section pd-faq" id="faq">
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
      {previewOpen && <ProductImageLightbox src={activeImage?.src ?? fallbackImage} alt={activeImage?.alt ?? product.name} onClose={() => setPreviewOpen(false)} />}
    </div>
  )
}

export default ProductDetail
