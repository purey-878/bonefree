import type {
  ComponentPropsWithoutRef,
  MouseEvent,
  SyntheticEvent,
} from 'react'
import { Flame } from 'lucide-react'
import styled, { css } from 'styled-components'

import { AddToCartButton } from './Button'
import { Badge, StockBadge } from './Badge'
import { productImageFallback, useApiImageFallback } from '../../utils/imageFallback'
import { formatEuro } from '../../utils/money'

export type ProductCardProduct = {
  category: string
  description?: string | null
  id: string | number
  image?: string | null
  name: string
  price?: number | null
  original_price?: number | null
  discount_percent?: number
  stock?: number | null
  total_calorias?: number | null
  customizavel?: boolean
  tags?: string[]
  highlighted?: boolean
  available?: boolean
  unavailable_reason?: string | null
  unavailable_due_to_inactive_base?: boolean
}

export type ProductCardProps = Omit<
  ComponentPropsWithoutRef<'article'>,
  'children'
> & {
  addingToCart?: boolean
  addToCartLabel?: string
  currencySymbol?: string
  imageFallback?: string
  onAddToCart?: (product: ProductCardProduct) => void | Promise<void>
  onSelect?: (product: ProductCardProduct) => void
  product: ProductCardProduct
  resolveImageSrc?: (image: string | null | undefined) => string
  tone?: 'dark' | 'light'
}

const defaultImageFallback = productImageFallback

function defaultResolveImageSrc(image: string | null | undefined) {
  if (!image) return defaultImageFallback
  if (/^(https?:|data:|blob:)/.test(image)) return image
  if (image.startsWith('/assets/')) return image
  if (image.startsWith('/menu-images/')) return `/assets/images${image}`
  if (image.startsWith('menu-images/')) return `/assets/images/${image}`
  if (image.startsWith('/')) return `/assets/images${image}`
  return `/assets/images/menu-images/${image}`
}

function formatPrice(price: number | null | undefined, currencySymbol: string) {
  void currencySymbol
  return formatEuro(price)
}

function formatCalories(calories: number | null | undefined) {
  if (calories == null || !Number.isFinite(Number(calories))) return null
  return Number(calories).toLocaleString('pt-PT', { maximumFractionDigits: 0 })
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

      .product-card-stock.in {
        background: #eef8ed;
        border-color: #bfe0ba;
        color: #276c37;
      }

      .product-card-stock.out {
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

const ActionRow = styled.div<{ $split: boolean }>`
  display: grid;
  grid-template-columns: ${({ $split }) => ($split ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr')};
  gap: 0.65rem;
`

const DetailsButton = styled.button`
  min-height: 46px;
  border: 1px solid #c8d6c3;
  border-radius: var(--radius-sm);
  background: #f6f6f5;
  color: #111c18;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow: inset 0 -1px 0 rgba(23, 33, 29, 0.04);
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;

  &:hover {
    border-color: rgba(123, 175, 75, 0.38);
    background: #eef7e9;
    transform: translateY(-1px);
  }
`

const PriceStack = styled.div`
  display: grid;
  gap: 0.25rem;
`

const OriginalPrice = styled.span`
  color: #8b9890;
  font-size: 0.86rem;
  font-weight: 800;
  line-height: 1;
  text-decoration: line-through;
`

export function ProductCard({
  addingToCart = false,
  addToCartLabel,
  className,
  currencySymbol = '€',
  imageFallback = defaultImageFallback,
  onAddToCart,
  onSelect,
  product,
  resolveImageSrc = defaultResolveImageSrc,
  tone = 'light',
  ...props
}: ProductCardProps) {
  const stock = Number(product.stock ?? 0)
  const unavailable = product.available === false
  const baseUnavailable = Boolean(product.unavailable_due_to_inactive_base)
  const dimUnavailable = unavailable && !baseUnavailable
  const outOfStock = stock <= 0 || unavailable
  const imageSrc = resolveImageSrc(product.image)
  const discountPercent = Number(product.discount_percent ?? 0)
  const showDiscount =
    discountPercent > 0 &&
    product.original_price != null &&
    Number(product.original_price) > Number(product.price ?? 0)
  const displayTags = (product.tags ?? [])
    .filter((tag) => tag && tag.toLowerCase() !== 'highlight')
    .slice(0, 3)
  const hasImageTags = displayTags.length > 0
  const showDetailsAction = Boolean(product.customizavel && onSelect)
  const calories = formatCalories(product.total_calorias)

  const handleSelect = () => {
    onSelect?.(product)
  }

  const handleSelectClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    handleSelect()
  }

  const handleAddToCart = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    void onAddToCart?.(product)
  }



  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    useApiImageFallback(event.currentTarget, imageFallback)
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
          aria-label={`Ver ${product.name}`}
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
            <StockBadge
              className={`product-card-stock ${stock <= 0 ? 'out' : 'in'}`}
              inStock={stock > 0}
              stock={stock}
            />
            {calories && (
              <ProductCalories title={`${calories} quilocalorias`}>
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
              'Um prato cuidadosamente criado com ingredientes de qualidade.'}
          </ProductDescription>
        </ProductTop>

        <ProductFooter>
          <ProductPurchaseRow>
            <PriceStack>
              {showDiscount && (
                <OriginalPrice>
                  {formatPrice(product.original_price, currencySymbol)}
                </OriginalPrice>
              )}
              <ProductPrice>
                {formatPrice(product.price, currencySymbol)}
              </ProductPrice>
            </PriceStack>
          </ProductPurchaseRow>

          {onAddToCart && (
            <ActionRow $split={showDetailsAction}>
              {showDetailsAction && (
                <DetailsButton onClick={handleSelectClick} type="button" className="rounded-pill fw-normal">
                 Personalizar
                </DetailsButton>
              )}
              <AddToCartButton
               className="rounded-pill fw-semibold letter-spacing-1"
                aria-label={`Adicionar ${product.name} ao carrinho`}
                disabled={outOfStock || addingToCart}
                fullWidth
                isLoading={addingToCart}
                onClick={handleAddToCart}
                outOfStock={outOfStock}
              >
                {addToCartLabel ??
                  (addingToCart
                    ? 'A adicionar...'
                    : stock <= 0
                      ? 'Esgotado'
                      : 'Adicionar')}
              </AddToCartButton>
            </ActionRow>
          )}
        </ProductFooter>
      </ProductBody>
    </ProductCardShell>
  )
}
