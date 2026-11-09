/** Only a recent, explicitly captured public catalog may extend the product sitemap. */
export function catalogSnapshotPaths(value: unknown, now = Date.now()): string[] {
  if (!value || typeof value !== 'object') throw new Error('Invalid catalog snapshot');
  const { capturedAt, productIds } = value as { capturedAt?: unknown; productIds?: unknown };
  const captured = typeof capturedAt === 'string' ? Date.parse(capturedAt) : NaN;
  if (!Number.isFinite(captured) || now - captured > 86_400_000 || captured > now + 60_000) throw new Error('Catalog snapshot must be captured within the last 24 hours');
  if (!Array.isArray(productIds) || productIds.length > 49_993 || productIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(productIds).size !== productIds.length) throw new Error('Invalid catalog product IDs');
  return productIds.map(id => `/product/${id}`);
}
