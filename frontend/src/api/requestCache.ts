import { clearMenuVisits } from '../utils/menuFeed';

/** Bounded, session-memory cache. Never persists responses or failed requests. */
export class RequestCache {
  private entries = new Map<string, { promise: Promise<unknown>; expires: number; pending: boolean; tags: string[] }>();

  read<T>(key: string, load: () => Promise<T>, ttl: number, tags: string[] = []): Promise<T> {
    const existing = this.entries.get(key);
    if (existing && (existing.pending || existing.expires > Date.now())) return existing.promise as Promise<T>;
    this.entries.delete(key);
    const entry = { promise: Promise.resolve() as Promise<unknown>, expires: 0, pending: true, tags };
    entry.promise = Promise.resolve().then(load).then(value => {
      entry.pending = false;
      entry.expires = Date.now() + ttl;
      if (ttl === 0 && this.entries.get(key) === entry) this.entries.delete(key);
      return value;
    }, error => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, entry);
    // Bound search/filter combinations, including obsolete in-flight entries.
    while (this.entries.size > 100) this.entries.delete(this.entries.keys().next().value!);
    return entry.promise as Promise<T>;
  }

  invalidate(tag?: string) {
    for (const [key, entry] of this.entries) {
      if (!tag || entry.tags.includes(tag)) this.entries.delete(key);
    }
  }
}

export const publicRequestCache = new RequestCache();
const adminRequests = new RequestCache();
let adminIdentity: string | null = null;

function publicPolicy(url: URL): { ttl: number; tag: string } | undefined {
  if (url.pathname.includes('/admin/')) return;
  const settings = url.pathname.match(/\/site-settings\/(theme|chef-special|company-details|social-media|events)$/)?.[1];
  if (settings) return { ttl: settings === 'events' ? 15_000 : settings === 'theme' ? 60_000 : 300_000, tag: settings };
  if (/\/products(?:\/\d+)?\/?$/.test(url.pathname)) return { ttl: 30_000, tag: 'catalog' };
}

export function publicRequestKey(url: URL): string {
  const normalized = new URL(url);
  normalized.pathname = normalized.pathname.replace(/\/$/, '');
  if (/\/products\/?$/.test(normalized.pathname)) {
    for (const [name, value] of Object.entries({ page: '1', per_page: '20', sort: 'default', special: 'all' })) {
      if (!normalized.searchParams.has(name)) normalized.searchParams.set(name, value);
    }
  }
  normalized.searchParams.sort();
  return normalized.href;
}

export function invalidatePublicData(tag: string) {
  publicRequestCache.invalidate(tag);
  if (tag === 'catalog') clearMenuVisits();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('publicDataInvalidated', { detail: tag }));
  if (tag === 'theme' && typeof window !== 'undefined') window.dispatchEvent(new Event('siteThemeUpdated'));
}

function invalidateMutation(request: Request) {
  const path = new URL(request.url).pathname;
  if (!request.method.match(/^(POST|PUT|PATCH|DELETE)$/)) return;
  if (/\/admin\/(products|categories|ingredients)(\/|$)/.test(path)) {
    invalidatePublicData('catalog');
    invalidatePublicData('chef-special');
  }
  const setting = path.match(/\/admin\/site-settings\/([^/]+)$/)?.[1];
  if (setting) invalidatePublicData(setting);
}

// A cancelled caller must not cancel a network request shared with another view.
function followSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Request aborted', 'AbortError'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Injected into the generated clients; generated code stays untouched. */
export const publicCachedFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const policy = publicPolicy(url);
  if (request.method !== 'GET' || !policy || request.headers.has('Authorization')) return fetch(request);
  if (request.signal.aborted) throw request.signal.reason;
  const pending = publicRequestCache.read(publicRequestKey(url), async () => {
    const result = await fetch(new Request(request, { signal: new AbortController().signal }));
    // HTTP errors should remain retryable, never become a fresh cache entry.
    if (!result.ok) throw result;
    return result;
  }, policy.ttl, [policy.tag]).catch(error => {
    if (error instanceof Response) return error;
    throw error;
  });
  return (await followSignal(pending, request.signal)).clone();
};

export const adminDeduplicatedFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const identity = request.headers.get('Authorization');
  if (identity !== adminIdentity) { adminRequests.invalidate(); adminIdentity = identity; }
  if (request.method !== 'GET') {
    const response = await fetch(request);
    if (response.ok) {
      adminRequests.invalidate();
      invalidateMutation(request);
    }
    return response;
  }
  // Authorization is part of the private key. No completed admin response is cached.
  if (request.signal.aborted) throw request.signal.reason;
  const pending = adminRequests.read(`${identity}\n${publicRequestKey(new URL(request.url))}`,
    () => fetch(new Request(request, { signal: new AbortController().signal })), 0);
  return (await followSignal(pending, request.signal)).clone();
};
