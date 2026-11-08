/** Preserve a chosen cap, but remember when the slider represented the whole catalog. */
export function restoreMenuPriceRange(range: unknown, catalogMaxPrice?: unknown): [number, number] {
  const values = Array.isArray(range) ? range : [0, 1000];
  const min = Number(values[0]);
  const max = Number(values[1]);
  const previousCatalogMax = Number(catalogMaxPrice);
  const unbounded = catalogMaxPrice != null && Number.isFinite(previousCatalogMax)
    && previousCatalogMax > 0 && Number.isFinite(max) && max >= previousCatalogMax;
  return [Number.isFinite(min) ? Math.max(0, min) : 0,
    unbounded ? 1000 : Number.isFinite(max) ? Math.max(0, max) : 1000];
}
