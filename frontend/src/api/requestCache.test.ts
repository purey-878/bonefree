import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDeduplicatedFetch, publicCachedFetch, publicRequestCache, RequestCache } from './requestCache';

const json = (value: unknown = {}) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const api = 'https://api.example.test';
const get = (path: string) => publicCachedFetch(api + path);
const admin = (path: string, method = 'GET', token = 'owner') => adminDeduplicatedFetch(api + path, { method, headers: { Authorization: `Bearer ${token}` } });

beforeEach(() => { publicRequestCache.invalidate(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('request cache lifecycle', () => {
  it('shares concurrent loads and expires from completion time', async () => {
    vi.useFakeTimers();
    const cache = new RequestCache();
    let resolve!: (value: number) => void;
    const load = vi.fn(() => new Promise<number>(done => { resolve = done; }));
    const first = cache.read('key', load, 1000);
    const second = cache.read('key', load, 1000);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    resolve(7);
    expect(await first).toBe(7);
    expect(await second).toBe(7);
    expect(await cache.read('key', () => Promise.resolve(8), 1000)).toBe(7);
    vi.advanceTimersByTime(1000);
    expect(await cache.read('key', () => Promise.resolve(8), 1000)).toBe(8);
  });

  it('never retains rejected requests', async () => {
    const cache = new RequestCache();
    await expect(cache.read('key', () => Promise.reject(new Error('offline')), 1000)).rejects.toThrow('offline');
    expect(await cache.read('key', () => Promise.resolve('retry'), 1000)).toBe('retry');
  });

  it('does not restore invalidated in-flight data after a mutation', async () => {
    const cache = new RequestCache();
    let resolve!: (value: string) => void;
    const old = cache.read('key', () => new Promise<string>(done => { resolve = done; }), 1000, ['catalog']);
    await Promise.resolve();
    cache.invalidate('catalog');
    expect(await cache.read('key', () => Promise.resolve('new'), 1000, ['catalog'])).toBe('new');
    resolve('old');
    await old;
    expect(await cache.read('key', () => Promise.resolve('wrong'), 1000)).toBe('new');
  });

  it('bounds retained search/filter combinations', async () => {
    const cache = new RequestCache();
    for (let i = 0; i < 101; i++) await cache.read(String(i), () => Promise.resolve(i), 1000);
    const reload = vi.fn(() => Promise.resolve(0));
    await cache.read('0', reload, 1000);
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe('public API sharing and freshness', () => {
  it('shares simultaneous theme requests with independently readable response bodies', async () => {
    const network = vi.fn(async () => json({ theme_id: 'normal' }));
    vi.stubGlobal('fetch', network);
    const responses = await Promise.all([get('/site-settings/theme'), get('/site-settings/theme'), get('/site-settings/theme')]);
    expect(network).toHaveBeenCalledOnce();
    expect(await Promise.all(responses.map(r => r.json()))).toEqual(Array(3).fill({ theme_id: 'normal' }));
    await get('/site-settings/theme');
    expect(network).toHaveBeenCalledOnce();
  });

  it('lets one caller abort without cancelling another shared reader', async () => {
    let finish!: (value: Response) => void;
    const network = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', network);
    const controller = new AbortController();
    const first = publicCachedFetch(api + '/site-settings/theme', { signal: controller.signal });
    const second = get('/site-settings/theme');
    await vi.waitFor(() => expect(network).toHaveBeenCalledOnce());
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    finish(json({ theme_id: 'normal' }));
    expect(await (await second).json()).toEqual({ theme_id: 'normal' });
    expect((network.mock.calls[0] as unknown as [Request])[0].signal.aborted).toBe(false);
  });

  it('normalizes equivalent list defaults while isolating languages, filters, pages and IDs', async () => {
    const network = vi.fn(async () => json());
    vi.stubGlobal('fetch', network);
    await get('/products/?locale=pt-PT');
    await get('/products?special=all&page=1&per_page=20&sort=default&locale=pt-PT');
    expect(network).toHaveBeenCalledOnce();
    for (const path of ['/products?locale=en-GB', '/products?locale=pt-PT&page=2', '/products?locale=pt-PT&category_id=2', '/products?locale=pt-PT&product_ids=1&product_ids=2', '/products/1?locale=pt-PT', '/products/1?locale=de-DE']) await get(path);
    expect(network).toHaveBeenCalledTimes(7);
  });

  it('refreshes events frequently while retaining catalog, theme and other settings freshness', async () => {
    vi.useFakeTimers();
    const network = vi.fn(async () => json());
    vi.stubGlobal('fetch', network);
    const all = () => Promise.all([get('/products/1'), get('/site-settings/theme'), get('/site-settings/events'), get('/site-settings/company-details')]);
    await all();
    vi.advanceTimersByTime(30_000); await all(); expect(network).toHaveBeenCalledTimes(6);
    vi.advanceTimersByTime(30_000); await all(); expect(network).toHaveBeenCalledTimes(9);
    vi.advanceTimersByTime(240_000); await all(); expect(network).toHaveBeenCalledTimes(13);
  });

  it('retries HTTP errors and never caches unknown or authenticated public routes', async () => {
    const network = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', network);
    await get('/site-settings/theme'); await get('/site-settings/theme');
    expect(network).toHaveBeenCalledTimes(2);
    network.mockImplementation(async () => json());
    for (let i = 0; i < 2; i++) {
      await get('/unknown');
      await publicCachedFetch(api + '/products/1', { headers: { Authorization: 'Bearer secret' } });
    }
    expect(network).toHaveBeenCalledTimes(6);
  });
});

describe('private admin requests and invalidation', () => {
  it('shares concurrent GETs only within one identity and never retains completed responses', async () => {
    const network = vi.fn(async () => json());
    vi.stubGlobal('fetch', network);
    await Promise.all([admin('/admin/products'), admin('/admin/products')]);
    expect(network).toHaveBeenCalledOnce();
    await admin('/admin/products'); expect(network).toHaveBeenCalledTimes(2);
    await Promise.all([admin('/admin/staff', 'GET', 'owner'), admin('/admin/staff', 'GET', 'manager')]);
    expect(network).toHaveBeenCalledTimes(4);
    await get('/products'); expect(network).toHaveBeenCalledTimes(5);
  });

  it.each([
    ['/admin/products', 'POST'], ['/admin/products/1', 'PUT'], ['/admin/products/1', 'DELETE'],
    ['/admin/products/1/availability', 'PUT'], ['/admin/products/1/media', 'POST'],
    ['/admin/products/1/media/2', 'DELETE'], ['/admin/categories/2', 'PUT'],
    ['/admin/ingredients/1/availability', 'PUT'],
  ])('invalidates public catalog lists and details after %s %s', async (path, method) => {
    const network = vi.fn(async () => json());
    vi.stubGlobal('fetch', network);
    await get('/products?locale=pt-PT'); await get('/products/1?locale=de-DE');
    await admin(path, method);
    await get('/products?locale=pt-PT'); await get('/products/1?locale=de-DE');
    expect(network).toHaveBeenCalledTimes(5);
  });

  it.each(['theme', 'chef-special', 'company-details', 'social-media', 'events'])('invalidates %s without caching an admin response publicly', async setting => {
    let version = 'public-old';
    const network = vi.fn(async () => json({ version }));
    vi.stubGlobal('fetch', network);
    await get('/site-settings/' + setting);
    version = 'private-admin'; await admin('/admin/site-settings/' + setting, 'PUT');
    version = 'public-new';
    expect(await (await get('/site-settings/' + setting)).json()).toEqual({ version: 'public-new' });
    expect(network).toHaveBeenCalledTimes(3);
  });

  it('keeps fresh cache entries after failed mutations', async () => {
    const network = vi.fn(async () => json());
    vi.stubGlobal('fetch', network);
    await get('/products/1');
    network.mockImplementation(async () => new Response('{}', { status: 403 }));
    await admin('/admin/products/1', 'PUT');
    expect((await get('/products/1')).status).toBe(200);
    expect(network).toHaveBeenCalledTimes(2);
  });
});
