import type { Product } from '../types/product';
import type { ProductPage } from '../services/productService';

export interface MenuFeedState {
  items: Product[];
  page: number;
  result?: ProductPage;
  loading: boolean;
  error: string | null;
}

/** One ordered feed per filter set. Network response caching stays in the API client. */
export class MenuFeed {
  private listeners = new Set<() => void>();
  private generation = 0;
  private active = true;
  scrollY = 0;
  state: MenuFeedState;
  private load: (page: number) => Promise<ProductPage>;
  private firstPage: number;
  constructor(load: (page: number) => Promise<ProductPage>, firstPage = 1, saved?: MenuFeedState) {
    this.load = load;
    this.firstPage = firstPage;
    this.state = saved ?? { items: [], page: firstPage - 1, loading: false, error: null };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private publish(next: MenuFeedState) { this.state = next; this.listeners.forEach(listener => listener()); }
  get hasMore() { return !this.state.result || this.state.page < this.state.result.totalPages; }
  resume() { this.active = true; }
  restore(state: MenuFeedState, scrollY: number) { this.scrollY = scrollY; this.publish(state); }
  dispose() {
    this.active = false;
    this.generation++;
    // A remounted StrictMode effect must be able to retry an interrupted request.
    this.state = { ...this.state, loading: false };
  }
  reset() {
    this.generation++;
    this.publish({ items: [], page: this.firstPage - 1, loading: false, error: null });
  }
  async next() {
    if (!this.active || this.state.loading || !this.hasMore) return;
    const generation = this.generation;
    const page = this.state.page + 1;
    this.publish({ ...this.state, loading: true, error: null });
    try {
      const result = await this.load(page);
      if (!this.active || generation !== this.generation) return;
      const ids = new Set(this.state.items.map(item => String(item.id)));
      const added = result.items.filter(item => {
        if (ids.has(String(item.id))) return false;
        ids.add(String(item.id)); return true;
      });
      this.publish({ items: [...this.state.items, ...added], page: result.page, result, loading: false, error: null });
    } catch (error) {
      if (!this.active || generation !== this.generation) return;
      this.publish({ ...this.state, loading: false, error: error instanceof Error ? error.message : 'Unable to load menu' });
    }
  }
}

// Navigation snapshots, not an alternative API cache. Short lifetime and bounded memory.
const visits = new Map<string, { state: MenuFeedState; scrollY: number; expires: number }>();
export function saveMenuVisit(key: string, feed: MenuFeed) {
  if (!feed.state.result || feed.state.items.length > 500) return;
  visits.delete(key);
  visits.set(key, { state: { ...feed.state, loading: false }, scrollY: feed.scrollY, expires: Date.now() + 30_000 });
  while (visits.size > 8) visits.delete(visits.keys().next().value!);
}
export function readMenuVisit(key: string) {
  const saved = visits.get(key);
  if (saved && saved.expires > Date.now()) return saved;
  visits.delete(key);
}
export function clearMenuVisits() { visits.clear(); }
