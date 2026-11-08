import { formatEuro } from './money';
import type { CatalogExtra, CatalogPortion } from '../types/pricing';

export function pricingOptionsInvalid(portions: CatalogPortion[] = [], extras: CatalogExtra[] = []) {
  return [portions, extras].some(group => {
    const labels = group.map(option => option.label.trim().toLocaleLowerCase());
    return new Set(labels).size !== labels.length || group.some(option => {
      const amount = 'price' in option ? option.price : option.priceDelta;
      return !option.label.trim() || option.label.length > 150 || !Number.isFinite(amount) || amount < 0
        || amount > 99999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001;
    });
  });
}


/** Admin records retain their base price; public records supply the effective price. */
export function displayedProductPrice(product: { price?: number | null; effectiveStartingPrice?: number | null; portions?: unknown[] }) {
  return product.portions?.length ? product.effectiveStartingPrice ?? null : product.price;
}

/** A missing starting price is not a free portion. Zero itself remains valid. */
export function formatCatalogPrice(price: number | null | undefined) {
  return price == null ? '—' : formatEuro(price);
}

/** Explicit size rates, using saved labels and prices without changing catalog data. */
export function formatSizePrice(portion: CatalogPortion) {
  const label = portion.label.trim();
  const pieces = label.match(/^(\d+)\s*(?:peças?|pieces?|stück(?:e)?|unidades?)?$/iu)?.[1];
  return `${pieces ?? label}\u00a0${pieces ? '×' : '·'}\u00a0${formatCatalogPrice(portion.price)}`;
}

export function formatProductPrices(product: { price?: number | null; effectiveStartingPrice?: number | null; portions?: CatalogPortion[] }) {
  if (!product.portions?.length) return formatCatalogPrice(product.price);
  const available = product.portions.filter(option => option.isAvailable);
  if (!available.length) return '—';
  const summary = available.slice(0, 2).map(formatSizePrice).join(' · ');
  return available.length > 2 ? `${summary} +${available.length - 2}` : summary;
}
