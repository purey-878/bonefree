import { Flame } from 'lucide-react'
import type {
  ComponentPropsWithoutRef,
  MouseEvent,
  SyntheticEvent,
} from 'react'
import styled, { css } from 'styled-components'

import { useTranslation } from 'react-i18next'
import { resolvedLocale } from '../../i18n'
import type { ProductMedia as ProductMediaItem } from '../../types/product'
import { applyApiImageFallback, productImageFallback, resolveProductImageUrl } from '../../utils/imageFallback'
import { formatEuro } from '../../utils/money'
import { primaryProductMediaUrl } from '../../utils/productMedia'
import { AvailabilityBadge, Badge } from './Badge'

export type ProductCardProduct = {
  category: string
  description?: string | null
  id: string | number
  media?: ProductMediaItem[]
  name: string
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

function formatPrice(price: number | null | undefined, currencySymbol: string) {
  void currencySymbol
  return formatEuro(price)
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
  height: 210px;
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
    top: 0.75rem;
    left: 0.75rem;
    z-index: 2;
    display: flex;
    max-width: calc(100% - 1.5rem);
    flex-wrap: wrap;
    gap: 0.35rem;
    pointer-events: none;
  }
`

const ProductMedia = styled.div`
  ${mediaStyles}
`

const ProductMediaButton = styled.button`
  ${mediaStyles}
  cursor: pointer;

  &:hover img {
    transform: translateZ(0) scale(1.025);
  }
`

const ProductImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 1rem;
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

const ProductPurchaseRow = styled.div`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
`

const ProductPrice = styled.span`
  color: #b42318;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
`

const ProductTag = styled.span`
  display: inline-flex;
  min-height: 1.45rem;
  align-items: center;
  border: 1px solid rgba(123, 175, 75, 0.34);
  border-radius: 999px;
  background: #eef7e9;
  color: #276c37;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1;
  padding: 0 0.48rem;
  text-transform: uppercase;
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
  gap: 0.25rem;
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

  return (
    <ProductCardShell
      $tone={tone}
      $dimUnavailable={dimUnavailable}
      $clickable={Boolean(onSelect)}
      className={className}
      {...props}
      onClick={onSelect ? handleSelect : props.onClick}
    >
      {onSelect ? (
        <ProductMediaButton
          aria-label={t('productCard.view', { name: product.name })}
          onClick={handleSelectClick}
          type="button"
        >
          {hasImageTags && (
            <div className="product-card-image-tags">
              {displayTags.map((tag) => (
                <ProductTag key={tag}>{tag}</ProductTag>
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
      ) : (
        <ProductMedia>
          {hasImageTags && (
            <div className="product-card-image-tags">
              {displayTags.map((tag) => (
                <ProductTag key={tag}>{tag}</ProductTag>
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
        </ProductMedia>
      )}

      <ProductBody>
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
          <ProductPurchaseRow>
            <PriceStack>

              <ProductPrice>
                {formatPrice(product.price, currencySymbol)}
              </ProductPrice>
            </PriceStack>
          </ProductPurchaseRow>

        </ProductFooter>
      </ProductBody>
    </ProductCardShell>
  )
}
