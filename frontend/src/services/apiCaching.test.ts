import { MenuFeed, readMenuVisit, saveMenuVisit } from '../utils/menuFeed';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApiClient, publicApiClient } from '../api/clients';
import { adminDeduplicatedFetch, publicCachedFetch, publicRequestCache } from '../api/requestCache';
import { getPublicCompanyDetails, getPublicSiteTheme, updateAdminSiteTheme } from './siteSettingsService';
import { productService } from './productService';
import { deleteProductMedia, updateIngredient, updateProduct } from './adminService';

beforeEach(() => {
  publicRequestCache.invalidate();
  publicApiClient.setConfig({ baseUrl: 'https://api.example.test', fetch: publicCachedFetch });
  adminApiClient.setConfig({ baseUrl: 'https://api.example.test', fetch: adminDeduplicatedFetch });
  vi.stubGlobal('localStorage', { getItem: () => 'test-owner' });
});
afterEach(() => vi.unstubAllGlobals());

describe('generated client and service caching integration', () => {
  it('deduplicates independent service consumers with default catalog query variants', async () => {
    const network = vi.fn(async () => new Response(JSON.stringify({ items: [], theme_id: 'normal' }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', network);
    await Promise.all([getPublicSiteTheme(), getPublicSiteTheme(), getPublicCompanyDetails(), getPublicCompanyDetails()]);
    await productService.getPage({ page: 1, perPage: 20, sort: 'default', locale: 'pt-PT' });
    await productService.getPage({ page: 1, perPage: 20, sort: 'default', special: 'all', locale: 'pt-PT' });
    expect(network).toHaveBeenCalledTimes(3);
  });

  it('invalidates actual catalog and settings service requests after successful admin operations', async () => {
    let name = 'Before';
    const network = vi.fn(async () => new Response(JSON.stringify({ id: 1, name, theme_id: name }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', network);
    expect((await productService.getById(1, 'pt-PT')).name).toBe('Before');
    name = 'Edited'; await updateProduct(1, { name });
    expect((await productService.getById(1, 'pt-PT')).name).toBe('Edited');
    name = 'Ingredient changed'; await updateIngredient(1, { available: false });
    expect((await productService.getById(1, 'pt-PT')).name).toBe(name);
    name = 'Image removed'; await deleteProductMedia(1, 2);
    expect((await productService.getById(1, 'pt-PT')).name).toBe(name);
    await getPublicSiteTheme();
    name = 'Theme edited'; await updateAdminSiteTheme({} as Parameters<typeof updateAdminSiteTheme>[0]);
    expect((await getPublicSiteTheme()).themeId).toBe(name);
    expect(network).toHaveBeenCalledTimes(10);
  });
  it('invalidates accumulated menu navigation snapshots after catalog publishing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [], page: 1, per_page: 16, total: 0, total_pages: 0, facets: { max_price: 0, total_products: 0, categories: [] } }), { headers: { 'Content-Type': 'application/json' } })));
    const feed = new MenuFeed(page => productService.getPage({ page, perPage: 16, locale: 'pt-PT' }));
    await feed.next(); saveMenuVisit('menu-before-edit', feed);
    expect(readMenuVisit('menu-before-edit')).toBeDefined();
    await updateProduct(1, { name: 'Updated dish' });
    expect(readMenuVisit('menu-before-edit')).toBeUndefined();
  });

  it('invalidates filtered pages, facets and dish details after an options-only update', async () => {
    const requests: Request[] = [];
    let price = 9.5;
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      requests.push(request);
      if (request.method === 'PUT') {
        const body = await request.json();
        expect(body.portions).toEqual([{ label: '3 pieces', price: 8.5, is_available: true }]);
        expect(body.extras).toEqual([{ label: 'Sweet potato', price_delta: 1, type: 'replacement', is_available: true }]);
        price = 8.5;
      }
      return new Response(JSON.stringify({ id: 1, price, facets: { max_price: price } }), { headers: { 'Content-Type': 'application/json' } });
    }));
    await productService.getPage({ locale: 'pt-PT', minPrice: 8 });
    await productService.getById(1, 'en-GB');
    await updateProduct(1, { portions: [{ label: '3 pieces', price: 8.5, isAvailable: true }], extras: [{ label: 'Sweet potato', priceDelta: 1, type: 'replacement', isAvailable: true }] });
    expect((await productService.getPage({ locale: 'pt-PT', minPrice: 8 })).facets.maxPrice).toBe(8.5);
    expect((await productService.getById(1, 'en-GB')).price).toBe(8.5);
    expect(requests).toHaveLength(5);
  });

});
