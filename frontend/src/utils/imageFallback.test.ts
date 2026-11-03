import { describe, expect, it } from 'vitest';
import { API_BASE } from '../api/clients';
import { resolveProductImageUrl } from './imageFallback';

describe('browse-only menu media', () => {
  it('resolves uploaded media through the configured API and preserves frontend and external assets', () => {
    expect(resolveProductImageUrl('/uploads/products/dish.webp')).toBe(`${API_BASE}/uploads/products/dish.webp`);
    expect(resolveProductImageUrl('uploads/products/dish.webp')).toBe(`${API_BASE}/uploads/products/dish.webp`);
    expect(resolveProductImageUrl('/assets/images/dish.webp')).toBe('/assets/images/dish.webp');
    expect(resolveProductImageUrl('https://images.example.test/dish.webp')).toBe('https://images.example.test/dish.webp');
  });
});
