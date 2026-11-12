import type { CatalogPortion, CatalogExtra } from "../../types/pricing";
import { ArrowRight, Flame } from 'lucide-react'
import type {
  ComponentPropsWithoutRef,
  MouseEvent,
  SyntheticEvent,
} from 'react'
import styled, { css } from 'styled-components'
import { useState } from 'react'
import ProductImageLightbox from '../ProductImageLightbox'
import ProductLabel from './ProductLabel'

import { useTranslation } from 'react-i18next'
import { resolvedLocale } from '../../i18n'
import type { ProductMedia as ProductMediaItem } from '../../types/product'
import { applyApiImageFallback, productImageFallback, resolveProductImageUrl } from '../../utils/imageFallback'
import { formatProductPrices, formatSizePrice } from '../../utils/pricing'
import { primaryProductMediaUrl } from '../../utils/productMedia'
import { AvailabilityBadge, Badge } from './Badge'

export type ProductCardProduct = {
  category: string
  description?: string | null
  id: string | number
  media?: ProductMediaItem[]
  name: string
  portions?: CatalogPortion[]
  extras?: CatalogExtra[]
  effectiveStartingPrice?: number | null
  price?: number | null
  totalCalories?: number | null
  tags?: string[]
  highlighted?: boolean
  available?: boolean
  unavailableReason?: string | null
  unavailableDueToUnavailableBase?: boolean
}

export type ProductCardProps = Omit<
  ComponentPropsWithoutRef<'article'>,
  'children'
> & {
  currencySymbol?: string
  imageFallback?: string
  onSelect?: (product: ProductCardProduct) => void
  product: ProductCardProduct
  resolveImageSrc?: (image: string | null | undefined) => string
  tone?: 'dark' | 'light'
}

const defaultImageFallback = productImageFallback

function defaultResolveImageSrc(image: string | null | undefined) {
  return resolveProductImageUrl(image, defaultImageFallback)
}

function formatCalories(calories: number | null | undefined) {
  if (calories == null || !Number.isFinite(Number(calories))) return null
  return Number(calories).toLocaleString(resolvedLocale(), { maximumFractionDigits: 0 })
}

const ProductCardShell = styled.article<{ $tone: 'dark' | 'light'; $dimUnavailable: boolean; $clickable: boolean }>`
  --product-card-radius: 30px;
  --product-card-media-radius: 24px;
  position: relative;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 0.9rem;
  overflow: hidden;
  padding: 0.85rem;
  border: none;
  border-radius: var(--product-card-radius);
  background: var(--glass-bg-strong);
  box-shadow: var(--shadow-glass), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  color: var(--brand-ink);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  will-change: transform, box-shadow;
  transition:
    box-shadow 320ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1);

  ${({ $clickable }) =>
    $clickable &&
    css`
      cursor: pointer;
    `}

  &::before {
    position: absolute;
    inset: 0;
    content: '';
    pointer-events: none;
    border-radius: inherit;
    background:
      linear-gradient(140deg, rgba(255, 255, 255, 0.14), transparent 34%),
      linear-gradient(320deg, rgba(253, 205, 67, 0.08), transparent 42%);
    opacity: 0.9;
  }

  &:hover {
    box-shadow:
      0 26px 74px rgba(0, 0, 0, 0.28),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
    transform: translateY(-3px);
  }

  &:hover img {
    transform: translateZ(0) scale(1.025);
  }

  ${({ $dimUnavailable }) =>
    $dimUnavailable &&
    css`
      filter: grayscale(0.72);
      opacity: 0.66;

      &:hover {
        transform: none;
      }
    `}

  ${({ $tone }) =>
    $tone === 'light' &&
    css`
      --product-card-title: #17211d;
      --product-card-description: #67756d;
      --product-card-media-bg:
        radial-gradient(circle at 50% 12%, rgba(253, 205, 67, 0.14), transparent 42%),
        linear-gradient(180deg, #f8faf6, #eef4ec);

      background: #ffffff;
      box-shadow: 0 16px 40px rgba(23, 33, 29, 0.1);
      color: #17211d;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;

      &::before {
        background: linear-gradient(180deg, rgba(253, 205, 67, 0.06), transparent 35%);
        opacity: 1;
      }

      &:hover {
        box-shadow: 0 20px 48px rgba(23, 33, 29, 0.13);
      }

      .product-card-category {
        background: #f7efd1;
        border-color: #ead078;
        color: #6b560a;
      }

      .product-card-availability.in {
        background: #eef8ed;
        border-color: #bfe0ba;
        color: #276c37;
      }

      .product-card-availability.out {
        background: #fff0ef;
        border-color: #efbbb7;
        color: #a83b32;
      }

    `}
`

const mediaStyles = css`
  position: relative;
  display: block;
  width: 100%;
  height: clamp(240px, 24vw, 260px);
  overflow: hidden;
  border: 0;
  border-radius: var(--product-card-media-radius);
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.08), transparent 68%),
    rgba(8, 17, 15, 0.54);
  background: var(
    --product-card-media-bg,
    radial-gradient(circle at center, rgba(255, 255, 255, 0.08), transparent 68%),
    rgba(8, 17, 15, 0.54)
  );
  color: inherit;

  .product-card-image-tags {
    position: absolute;
    top: 1rem;
    left: 0;
    z-index: 2;
    display: flex;
    max-width: calc(100% - 1rem);
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
    filter: drop-shadow(0 3px 5px rgba(23, 33, 29, .15));
    pointer-events: none;
  }
`

const ProductMediaButton = styled.button`
  ${mediaStyles}
  cursor: zoom-in;

  &:hover img {
    transform: translateZ(0) scale(1.025);
  }
`

const ProductImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: .5rem;
  transform: translateZ(0) scale(1);
  will-change: transform;
  transition: transform 680ms cubic-bezier(0.22, 1, 0.36, 1);
`

const ProductBody = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.95rem;
`

const ProductTop = styled.div`
  display: grid;
  gap: 0.72rem;
`

const ProductMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
`

const ProductTitle = styled.h3`
  margin: 0;
  color: var(--product-card-title, var(--white));
  font-size: 1.06rem;
  line-height: 1.22;
`

const ProductTitleButton = styled.button`
  display: inline;
  width: fit-content;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    color: var(--brand-secondary);
  }
`

const ProductDescription = styled.p`
  display: -webkit-box;
  min-height: 2.55rem;
  margin: 0;
  overflow: hidden;
  color: var(--product-card-description, var(--brand-muted));
  font-size: 0.9rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`

const ProductFooter = styled.div`
  display: grid;
  gap: 0.75rem;
  margin-top: auto;
`

const ProductPriceRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`

const ProductDetailsButton = styled.a`
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.55rem 0.8rem;
  border: 0;
  border-radius: var(--product-card-radius);
  background: transparent;
  color: var(--product-card-description, var(--brand-muted));
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;

  &:hover {
    color: var(--product-card-description, var(--brand-muted));
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  &:focus-visible {
    outline: 2px solid #076050;
    outline-offset: 2px;
  }
`

const ProductPrice = styled.span`
  &.product-size-prices {
    display: grid;
    gap: 0.15rem;
    font-size: 1rem;
    line-height: 1.5;
  }
  color: #b42318;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
`

const ProductCalories = styled.span`
  display: inline-flex;
  min-height: 1.55rem;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid rgba(180, 35, 24, 0.16);
  border-radius: 999px;
  background: #fff3ed;
  color: #9f2d20;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  padding: 0 0.55rem;

  svg {
    width: 0.82rem;
    height: 0.82rem;
  }
`

const PriceStack = styled.div`
  display: grid;
  min-width: 0;
  max-width: 100%;
  gap: 0.25rem;

  .product-pricing-note {
    color: var(--brand-muted);
    font-size: 0.75rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
`

export function ProductCard({
  className,
  currencySymbol = '€',
  imageFallback = defaultImageFallback,
  onSelect,
  product,
  resolveImageSrc = defaultResolveImageSrc,
  tone = 'light',
  ...props
}: ProductCardProps) {
  const { t } = useTranslation('storefront')
  const [previewOpen, setPreviewOpen] = useState(false)
  void currencySymbol
  const availableSizes = product.portions?.filter(option => option.isAvailable) ?? []
  const unavailable = product.available === false
  const baseUnavailable = Boolean(product.unavailableDueToUnavailableBase)
  const dimUnavailable = unavailable && !baseUnavailable
  const imageSrc = resolveImageSrc(primaryProductMediaUrl(product.media, 'card'))

  const displayTags = (product.tags ?? [])
    .filter((tag) => tag && tag.toLowerCase() !== 'highlight')
    .slice(0, 3)
  const hasImageTags = displayTags.length > 0
  const calories = formatCalories(product.totalCalories)

  const handleSelect = () => {
    onSelect?.(product)
  }

  const handleSelectClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    handleSelect()
  }

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    applyApiImageFallback(event.currentTarget, imageFallback)
  }

  return (<>
    <ProductCardShell
      $tone={tone}
      $dimUnavailable={dimUnavailable}
      $clickable={Boolean(onSelect)}
      className={className}
      {...props}
      onClick={onSelect ? handleSelect : props.onClick}
    >
        <ProductMediaButton
          aria-label={t('productCard.enlargeImage', { name: product.name })}
          aria-haspopup="dialog"
          onClick={event => {
            event.stopPropagation()
            setPreviewOpen(true)
          }}
          className="product-card-media"
          type="button"
        >
          {hasImageTags && (
            <div className="product-card-image-tags">
              {displayTags.map((tag) => (
                <ProductLabel key={tag}>{tag}</ProductLabel>
              ))}
            </div>
          )}
          <ProductImage
            alt={product.name}
            decoding="async"
            loading="lazy"
            onError={handleImageError}
            src={imageSrc}
          />
        </ProductMediaButton>
      <ProductBody className="product-card-body">
        <ProductTop>
          <ProductMeta>
            <Badge className="product-card-category" size="sm" variant="accent">
              {product.category}
            </Badge>
            <AvailabilityBadge
              className={`product-card-availability ${unavailable ? 'out' : 'in'}`}
              available={!unavailable}
            />
            {calories && (
              <ProductCalories title={t('productCard.calories', { count: calories })}>
                <Flame aria-hidden="true" />
                {calories} kcal
              </ProductCalories>
            )}
          </ProductMeta>

          <ProductTitle>
            {onSelect ? (
              <ProductTitleButton className="fw-bold" onClick={handleSelectClick} type="button">
                {product.name}
              </ProductTitleButton>
            ) : (
              product.name
            )}
          </ProductTitle>

          <ProductDescription>
            {product.description ||
              t('productCard.fallbackDescription')}
          </ProductDescription>
        </ProductTop>

        <ProductFooter>
          <ProductPriceRow>
            <PriceStack>

              <ProductPrice className={product.portions?.length ? 'product-size-prices' : undefined}>
                {availableSizes.length ? <>
                  {availableSizes.slice(0, 2).map((option, index) => (
                    <span key={option.id ?? index}>{formatSizePrice(option)}</span>
                  ))}
                  {availableSizes.length > 2 && <span>+{availableSizes.length - 2}</span>}
                </> : formatProductPrices(product)}
              </ProductPrice>
              {!!product.extras?.some(option => option.isAvailable) && (
                <small className="product-pricing-note">{t('pricing.extrasAvailable')}</small>
              )}
            </PriceStack>
            {onSelect && (
              <ProductDetailsButton
                href={`/product/${encodeURIComponent(String(product.id))}`}
                aria-label={t('productCard.view', { name: product.name })}
                onClick={(event) => {
                  event.stopPropagation();
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  handleSelect();
                }}
              >
                {t('productCard.viewDetails')}
                <ArrowRight size={16} aria-hidden="true" />
              </ProductDetailsButton>
            )}
          </ProductPriceRow>

        </ProductFooter>
      </ProductBody>
    </ProductCardShell>
    {previewOpen && <ProductImageLightbox src={resolveImageSrc(primaryProductMediaUrl(product.media, 'detail'))} alt={product.name} onClose={() => setPreviewOpen(false)} />}
  </>)
}
