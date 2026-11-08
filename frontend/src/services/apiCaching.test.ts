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
});
