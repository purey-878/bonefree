import { describe, expect, it } from 'vitest';
import { metadataHtml, pageMetadata, PUBLIC_PATHS, restaurantSchema, staticContent, structuredData } from './metadata';

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
    for (const path of ['/cart', '/checkout', '/orders/42', '/profile', '/login', '/register', '/admin/login', '/admin/dashboard', '/reservations/confirmation', '/unknown', '/product/not-an-id']) {
      const meta = pageMetadata(path);
      expect(meta.noindex).toBe(true);
      expect(meta.path).toBeUndefined();
      expect(metadataHtml(meta)).not.toContain('rel="canonical"');
    }
    expect(pageMetadata('/product/42').path).toBe('/product/42');
  });
  it('indexes booking information but never private passes', () => {
    expect(pageMetadata('/reservations').path).toBe('/reservations');
    expect(PUBLIC_PATHS).not.toContain('/reservations/confirmation');
    expect(metadataHtml(pageMetadata('/reservations/confirmation'))).toContain('no-referrer');
  });
  it('escapes catalog text in HTML attributes and static copy', () => {
    const meta = { title: '<script>"&', description: '<img src=x onerror=evil()>', path: '/menu' };
    expect(metadataHtml(meta)).toContain('&lt;script&gt;&quot;&amp;');
    expect(staticContent(meta)).not.toContain('<img');
    expect(metadataHtml(meta).match(/rel="canonical"/g)).toHaveLength(1);
  });
  it('serializes page text safely inside JSON-LD without changing its meaning', () => {
    const meta = { title: '</script><img src=x>', description: 'A < B', path: '/' };
    const html = metadataHtml(meta);
    expect(html).not.toContain('</script><img');
    const data = JSON.parse(html.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
    expect(data['@graph'][2].name).toBe(meta.title);
  });
  it('uses verified identity and profile links without inventing commerce or hours', () => {
    const schema = JSON.stringify(restaurantSchema);
    expect(schema).toContain('Restaurant');
    expect(schema).not.toMatch(/OrderAction|ReserveAction|aggregateRating|openingHours|priceRange/);
    expect(restaurantSchema.hasMenu).toBe('https://bonefree.pt/menu');
    expect(restaurantSchema.telephone).toBe('+351968107702');
    expect(restaurantSchema.sameAs).toEqual(['https://www.facebook.com/b0nefree/', 'https://www.instagram.com/b0nefree/']);
    const graph = structuredData(pageMetadata('/about'))['@graph'];
    expect(JSON.stringify(graph)).toContain('WebSite');
    expect(JSON.stringify(graph)).toContain('WebPage');
    expect(JSON.stringify(graph)).toContain('LocalBusiness');
    expect(JSON.stringify(graph)).toContain('https://bonefree.pt/about#webpage');
    expect(metadataHtml(pageMetadata('/menu'))).toContain('type="text/markdown"');
    expect(metadataHtml(pageMetadata('/product/42'))).not.toContain('type="text/markdown"');
  });
});
