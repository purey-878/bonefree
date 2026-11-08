import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { productService } from '../services/productService';
import type { ProductListOptions } from '../services/productService';
import { clearMenuVisits, MenuFeed, readMenuVisit, saveMenuVisit } from '../utils/menuFeed';

export function useMenuFeed(options: ProductListOptions, restore: boolean) {
  const key = JSON.stringify(options);
  const initialized = useRef(false);
  const feed = useMemo(() => {
    const params = JSON.parse(key) as ProductListOptions;
    return new MenuFeed(page => productService.getPage({ ...params, page }), params.page ?? 1);
  }, [key]);
  const state = useSyncExternalStore(feed.subscribe, feed.snapshot, feed.snapshot);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const saved = restore ? readMenuVisit(key) : undefined;
      if (saved) feed.restore(saved.state, saved.scrollY);
    }
    return () => { saveMenuVisit(key, feed); };
  }, [feed, key, restore]);
  useEffect(() => {
    feed.resume();
    if (!feed.state.result) void feed.next();
    // App's route scroll effect has finished before this animation frame.
    const restoredY = feed.scrollY;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: restoredY, behavior: 'instant' });
    });
    const track = () => { feed.scrollY = window.scrollY; };
    const invalidate = (event: Event) => {
      if ((event as CustomEvent).detail !== 'catalog') return;
      clearMenuVisits(); feed.reset(); void feed.next();
    };
    window.addEventListener('scroll', track, { passive: true });
    window.addEventListener('publicDataInvalidated', invalidate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', track);
      window.removeEventListener('publicDataInvalidated', invalidate);
      feed.dispose();
    };
  }, [feed]);
  useEffect(() => {
    // Three automatic batches leave the footer reachable. Manual loading stays available.
    if (state.loading || state.error || !feed.hasMore || state.page >= (options.page ?? 1) + 2 || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void feed.next();
    }, { rootMargin: '0px 0px 450px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [feed, options.page, sentinel, state]);
  return { ...state, hasMore: feed.hasMore, next: () => { void feed.next(); }, sentinel: setSentinel };
}
