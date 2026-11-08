import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearMenuVisits, MenuFeed, readMenuVisit, saveMenuVisit } from './menuFeed';
import type { ProductPage } from '../services/productService';
const page = (n: number, ids: number[], totalPages = 3): ProductPage => ({
  items: ids.map(id => ({ id, idDisplay: `PRD-${id}`, description: null, media: [], available: true, name: `Dish ${id}`, category: 'Food', price: 10, portions: [{ label: '3', price: 10, isAvailable: true }], extras: [] })),
  page: n, perPage: 16, total: totalPages * 16, totalPages,
  facets: { totalProducts: 48, maxPrice: 20, categories: [] },
});
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
afterEach(() => { clearMenuVisits(); vi.useRealTimers(); });
describe('progressive menu feed', () => {
  it('loads only the initial page, appends in server order and stops on metadata', async () => {
    const load = vi.fn(async n => page(n, [n * 2 - 1, n * 2], 2));
    const feed = new MenuFeed(load);
    await feed.next(); expect(load.mock.calls).toEqual([[1]]);
    await feed.next(); await feed.next();
    expect(load.mock.calls).toEqual([[1], [2]]);
    expect(feed.state.items.map(item => item.id)).toEqual([1, 2, 3, 4]);
    expect(feed.hasMore).toBe(false);
    expect(feed.state.items[0].portions?.[0].price).toBe(10);
  });
  it('deduplicates rapid observer callbacks and overlapping product IDs', async () => {
    const pending = deferred<ProductPage>();
    const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(page(2, [2, 3, 3]));
    const feed = new MenuFeed(load);
    const first = feed.next(); await feed.next(); await feed.next();
    expect(load).toHaveBeenCalledTimes(1);
    pending.resolve(page(1, [1, 2])); await first; await feed.next();
    expect(feed.state.items.map(item => item.id)).toEqual([1, 2, 3]);
  });
  it('does not infer the last page from a short or empty batch', async () => {
    const feed = new MenuFeed(async n => page(n, [], 2));
    await feed.next(); expect(feed.hasMore).toBe(true);
    await feed.next(); expect(feed.hasMore).toBe(false);
  });
  it('handles an empty catalog without repeatedly loading', async () => {
    const load = vi.fn(async () => page(1, [], 0)); const feed = new MenuFeed(load);
    await feed.next(); await feed.next(); expect(load).toHaveBeenCalledTimes(1);
    expect(feed.state.items).toEqual([]); expect(feed.hasMore).toBe(false);
  });
  it('preserves loaded cards on failure and retries the same page', async () => {
    const load = vi.fn().mockResolvedValueOnce(page(1, [1])).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page(2, [2]));
    const feed = new MenuFeed(load); await feed.next(); await feed.next();
    expect(feed.state.error).toBe('offline'); expect(feed.state.items.map(item => item.id)).toEqual([1]);
    await feed.next(); expect(load.mock.calls).toEqual([[1], [2], [2]]);
    expect(feed.state.error).toBeNull(); expect(feed.state.items).toHaveLength(2);
  });
  it('rejects stale responses on reset, filter replacement and unmount', async () => {
    const old = deferred<ProductPage>(); const fresh = deferred<ProductPage>();
    const feed = new MenuFeed(vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise));
    const first = feed.next(); feed.reset(); const second = feed.next();
    old.resolve(page(1, [99])); await first; expect(feed.state.items).toEqual([]);
    fresh.resolve(page(1, [1])); await second; expect(feed.state.items[0].id).toBe(1);
    const late = deferred<ProductPage>(); const removed = new MenuFeed(() => late.promise);
    const request = removed.next(); removed.dispose(); late.resolve(page(1, [99])); await request;
    expect(removed.state.items).toEqual([]);
  });
  it('can resume an interrupted StrictMode mount', async () => {
    const pending = deferred<ProductPage>(); const feed = new MenuFeed(() => pending.promise);
    const old = feed.next(); feed.dispose(); feed.resume(); const current = feed.next();
    pending.resolve(page(1, [1])); await old; await current; expect(feed.state.items).toHaveLength(1);
  });
  it('bounds navigation snapshots, expires them and clears after catalog mutation', async () => {
    vi.useFakeTimers();
    const feed = new MenuFeed(async () => page(1, [1])); await feed.next(); feed.scrollY = 780;
    saveMenuVisit('pt/category1', feed);
    expect(readMenuVisit('pt/category1')?.scrollY).toBe(780);
    expect(readMenuVisit('en/category1')).toBeUndefined();
    const restored = new MenuFeed(vi.fn(), 1, readMenuVisit('pt/category1')!.state);
    expect(restored.state.items).toHaveLength(1);
    for (let i = 0; i < 9; i++) saveMenuVisit(String(i), feed);
    expect(readMenuVisit('pt/category1')).toBeUndefined();
    vi.advanceTimersByTime(30_001); expect(readMenuVisit('8')).toBeUndefined();
    saveMenuVisit('fresh', feed); clearMenuVisits(); expect(readMenuVisit('fresh')).toBeUndefined();
  });
});
