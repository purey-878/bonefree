import type { CatalogPortion, CatalogExtra } from "../../types/pricing";
import { ArrowUpRight, Flame, ZoomIn } from 'lucide-react'
import type {
  ComponentPropsWithoutRef,
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
  --product-card-radius: 30px 30px 24px 24px;
  --product-card-media-radius: 23px 23px 48px 23px;
  position: relative;
  isolation: isolate;
  display: flex;
  min-width: 0;
  max-width: 100%;
  min-height: 100%;
  flex-direction: column;
  gap: 0.9rem;
  overflow: hidden;
  padding: 0.85rem;
  border: 1px solid var(--glass-border);
  border-radius: var(--product-card-radius);
  background: var(--glass-bg-strong);
  box-shadow: var(--shadow-glass), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  color: var(--brand-ink);

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
    box-shadow: 0 12px 30px rgba(23, 33, 29, .14);
    transform: translateY(-4px);
  }

  &:hover img {
    transform: translateZ(0) scale(1.025);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover { transform: none; }
    img { transition: none; }
    &:hover img { transform: none; }
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
      --product-card-title: #173f31;
      --product-card-description: #667367;
      --product-card-media-bg: radial-gradient(ellipse at 45% 45%, #f8f5df, #eaf0df);

      background: rgba(255, 254, 248, .78);
      border-color: #dce4d4;
      box-shadow: 0 5px 0 #e4e9dc, 0 10px 24px rgba(23, 33, 29, .05);
      color: #173f31;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);

      &::before {
        background: linear-gradient(180deg, rgba(253, 205, 67, 0.06), transparent 35%);
        opacity: 1;
      }

      &:hover {
        box-shadow: 0 7px 0 #dbe3d0, 0 16px 28px rgba(23, 33, 29, .09);
      }

      .product-card-category {
        background: #edf2e4;
        border: 0;
        border-radius: 8px 8px 8px 2px;
        color: #365b39;
        padding: .35rem .55rem;
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
  isolation: isolate;
  z-index: 2;

  @media (max-width: 767px) {
    height: clamp(170px, 56vw, 216px);
    min-width: 0;
  }

  &::before {
    content: '';
    position: absolute;
    width: 78%;
    aspect-ratio: 1;
    left: 11%;
    top: 12%;
    border: 1px dashed rgba(93, 126, 64, .22);
    border-radius: 46% 54% 63% 37% / 55% 44% 56% 45%;
    transform: rotate(-15deg);
    pointer-events: none;
  }

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
  &:focus-visible { outline: 3px solid var(--brand-secondary); outline-offset: -3px; }
`

const ImageHint = styled.span`
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 2;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid #dce4d4;
  border-radius: 12px;
  background: #fffef8;
  color: #17211d;
  transform: rotate(-6deg);
  pointer-events: none;
`;

const ProductImage = styled.img`
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: .5rem;
  transform: translateZ(0) scale(1);
  will-change: transform;
  transition: transform 680ms cubic-bezier(0.22, 1, 0.36, 1);
`

const ProductBody = styled.div`
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.95rem;
  padding: .2rem .35rem .35rem;
`

const ProductTop = styled.div`
  display: grid;
  min-width: 0;
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
  font-size: 1.22rem;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -.025em;
  overflow-wrap: anywhere;
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
  padding-top: .9rem;
  border-top: 1px dashed var(--glass-border, #dce4d4);
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
  max-width: 100%;
  overflow-wrap: anywhere;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.55rem 0.8rem;
  border: 0;
  border-radius: 14px 14px 14px 5px;
  background: transparent;
  color: var(--product-card-title, var(--brand-ink));
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: var(--product-card-radius);
  }
  &:active { text-decoration: underline; text-underline-offset: 3px; }
  &:hover {
    background: transparent;
    text-decoration: underline;
    text-underline-offset: 3px;
    color: #5c6b58;
  }

  &:focus-visible {
    outline: none;
    text-decoration: underline;
    text-underline-offset: 3px;
    &::after { outline: 3px solid var(--brand-main); outline-offset: -3px; }
  }
`

const ProductPrice = styled.span`
  max-width: 100%;
  overflow-wrap: anywhere;
  &.product-size-prices {
    display: grid;
    gap: 0.15rem;
    font-size: 1rem;
    line-height: 1.5;
  }
  display: inline-block;
  padding: .6rem .7rem;
  border-radius: 12px 12px 4px 12px;
  background: #f8edbc;
  color: #334b26;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.2;
  transform: rotate(-2deg);
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
          <ImageHint aria-hidden="true"><ZoomIn size={17} /></ImageHint>
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

          <ProductTitle>{product.name}</ProductTitle>

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
                <ArrowUpRight size={17} aria-hidden="true" />
              </ProductDetailsButton>
            )}
          </ProductPriceRow>

        </ProductFooter>
      </ProductBody>
    </ProductCardShell>
    {previewOpen && <ProductImageLightbox src={resolveImageSrc(primaryProductMediaUrl(product.media, 'detail'))} alt={product.name} onClose={() => setPreviewOpen(false)} />}
  </>)
}
