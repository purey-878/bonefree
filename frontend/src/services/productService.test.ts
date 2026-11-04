import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { publicApiClient } from '../api/clients';
import i18n, { i18nReady } from '../i18n';
import { productService } from './productService';

beforeAll(async () => { await i18nReady; });
afterEach(async () => { await i18n.changeLanguage('pt-PT'); vi.restoreAllMocks(); });

describe('localized catalog requests', () => {
  it('uses the selected language without changing stable IDs, search or filters', async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn(async (request: Request) => {
      requests.push(request);
      return new Response(JSON.stringify({ items: [], page: 1, total_pages: 1 }), { headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    publicApiClient.setConfig({ baseUrl: 'https://api.example.test', fetch: fetchMock });
    await i18n.changeLanguage('en-GB');
    await productService.getPage({ search: 'mushroom', categoryId: 7, minPrice: 2, sort: 'name_asc', perPage: 20 });
    const url = new URL(requests[0].url);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ locale: 'en-GB', search: 'mushroom', category_id: '7', min_price: '2', sort: 'name_asc', per_page: '20' });
    await i18n.changeLanguage('de-DE');
    await productService.getById(42);
    expect(new URL(requests[1].url).pathname).toBe('/products/42');
    expect(new URL(requests[1].url).searchParams.get('locale')).toBe('de-DE');
  });
  it('captures a request locale so later language changes cannot change its in-flight URL', async () => {
    let resolveResponse!: (response: Response) => void;
    let requestUrl = '';
    publicApiClient.setConfig({ baseUrl: 'https://api.example.test', fetch: (async (request: Request) => {
      requestUrl = request.url;
      return new Promise<Response>(resolve => { resolveResponse = resolve; });
    }) as typeof fetch });
    await i18n.changeLanguage('en-GB');
    const pending = productService.getById(42);
    await vi.waitFor(() => expect(requestUrl).toContain('locale=en-GB'));
    await i18n.changeLanguage('de-DE');
    resolveResponse(new Response(JSON.stringify({ id: 42, name: 'Mushrooms' }), { headers: { 'Content-Type': 'application/json' } }));
    expect((await pending).name).toBe('Mushrooms');
    expect(new URL(requestUrl).searchParams.get('locale')).toBe('en-GB');
  });
});
