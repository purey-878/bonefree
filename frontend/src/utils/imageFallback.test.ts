import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE } from '../api/clients';
import { applyApiImageFallback, productImageFallback, resolveProductImageUrl } from './imageFallback';

describe('browse-only menu media', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves uploaded media through the configured API and preserves frontend and external assets', () => {
    expect(resolveProductImageUrl('/uploads/products/dish.webp')).toBe(`${API_BASE}/uploads/products/dish.webp`);
    expect(resolveProductImageUrl('uploads/products/dish.webp')).toBe(`${API_BASE}/uploads/products/dish.webp`);
    expect(resolveProductImageUrl('/assets/images/dish.webp')).toBe('/assets/images/dish.webp');
    expect(resolveProductImageUrl('https://images.example.test/dish.webp')).toBe('https://images.example.test/dish.webp');
  });

  it('uses a neutral icon for missing media and retains explicit fallbacks', () => {
    expect(resolveProductImageUrl(null)).toBe('/assets/images/dish-placeholder.svg');
    expect(resolveProductImageUrl('')).toBe(productImageFallback);
    expect(resolveProductImageUrl(null, '/custom.svg')).toBe('/custom.svg');
  });

  it('keeps the legacy API retry, then stops at the icon instead of retrying it', () => {
    const origin = 'https://bonefree.pt';
    vi.stubGlobal('window', { location: { origin } });
    const image = { src: `${origin}/assets/images/menu-images/missing.avif`, currentSrc: '', dataset: {} } as HTMLImageElement;
    applyApiImageFallback(image);
    expect(image.src).toBe(`${API_BASE}/assets/images/menu-images/missing.avif`);
    applyApiImageFallback(image);
    expect(image.src).toBe(productImageFallback);
    applyApiImageFallback(image);
    expect(image.src).toBe(productImageFallback);
    const placeholder = { src: `${origin}${productImageFallback}`, currentSrc: '', dataset: {} } as HTMLImageElement;
    applyApiImageFallback(placeholder);
    expect(placeholder.src).toBe(`${origin}${productImageFallback}`);
    expect(placeholder.dataset.apiFallbackTried).toBeUndefined();
  });
});
