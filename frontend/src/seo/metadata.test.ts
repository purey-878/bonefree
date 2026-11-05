import { describe, expect, it } from 'vitest';
import { metadataHtml, pageMetadata, PUBLIC_PATHS, restaurantSchema, staticContent } from './metadata';

describe('restaurant metadata', () => {
  it('provides unique public titles and clean canonical paths in every language', () => {
    for (const locale of ['pt-PT', 'en-GB', 'de-DE']) {
      const titles = PUBLIC_PATHS.map(path => pageMetadata(path, locale).title);
      expect(new Set(titles).size).toBe(PUBLIC_PATHS.length);
      for (const path of PUBLIC_PATHS) {
        const meta = pageMetadata(`${path === '/' ? '' : path}/`, locale);
        expect(meta.path).toBe(path);
        expect(meta.noindex).not.toBe(true);
        expect(meta.description.length).toBeGreaterThan(30);
      }
    }
  });
  it('never indexes retired, private or unknown paths as restaurant pages', () => {
    for (const path of ['/cart', '/checkout', '/orders/42', '/profile', '/login', '/register', '/admin/login', '/admin/dashboard', '/unknown', '/product/not-an-id']) {
      const meta = pageMetadata(path);
      expect(meta.noindex).toBe(true);
      expect(meta.path).toBeUndefined();
      expect(metadataHtml(meta)).not.toContain('rel="canonical"');
    }
    expect(pageMetadata('/product/42').path).toBe('/product/42');
  });
  it('escapes catalog text in HTML attributes and static copy', () => {
    const meta = { title: '<script>"&', description: '<img src=x onerror=evil()>', path: '/menu' };
    expect(metadataHtml(meta)).toContain('&lt;script&gt;&quot;&amp;');
    expect(staticContent(meta)).not.toContain('<img');
    expect(metadataHtml(meta).match(/rel="canonical"/g)).toHaveLength(1);
  });
  it('does not invent commerce, reservations, ratings, hours or business details', () => {
    const schema = JSON.stringify(restaurantSchema);
    expect(schema).toContain('Restaurant');
    expect(schema).not.toMatch(/OrderAction|ReserveAction|aggregateRating|openingHours|priceRange|address/);
    expect(restaurantSchema.hasMenu).toBe('https://bonefree.pt/menu');
  });
});
