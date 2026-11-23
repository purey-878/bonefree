import type { PublicPromotion } from '../services/reservationService';
import { SUPPORTED_LOCALES } from '../i18n';

type Snapshot = { savedAt: number; promotion?: PublicPromotion };
const prefix = 'bonefree_public_promotion_v1:';
const maxAge = 60_000;
const snapshots = new Map<string, Snapshot>();
let generation = 0;
export const promotionCacheGeneration = () => generation;

function validPromotion(value: unknown): value is PublicPromotion {
  if (!value || typeof value !== 'object') return false;
  const offer = value as Record<string, unknown>;
  return typeof offer.id === 'number'
    && ['title', 'scope', 'percentage', 'start_date', 'end_date', 'next_date', 'next_time'].every(key => typeof offer[key] === 'string')
    && Array.isArray(offer.weekdays) && Array.isArray(offer.windows)
    && offer.windows.every(window => window && typeof window.start === 'string' && typeof window.end === 'string')
    && ['description', 'conditions'].every(key => offer[key] === undefined || typeof offer[key] === 'string');
}

export function readPromotionSnapshot(locale: string): Snapshot | undefined {
  if (typeof window === 'undefined' || !SUPPORTED_LOCALES.some(supported => supported === locale)) return;
  let snapshot = snapshots.get(locale);
  if (!snapshot) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(prefix + locale) ?? 'null');
      if (stored && typeof stored.savedAt === 'number' && (stored.promotion === undefined || validPromotion(stored.promotion))) snapshot = stored;
    } catch { /* Storage may be unavailable or contain an obsolete snapshot. */ }
  }
  if (!snapshot || Date.now() < snapshot.savedAt || Date.now() - snapshot.savedAt >= maxAge) return;
  if (snapshot.promotion) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts();
    const part = (type: string) => parts.find(value => value.type === type)?.value;
    const day = `${part('year')}-${part('month')}-${part('day')}`;
    const time = `${part('hour')}:${part('minute')}`;
    if (snapshot.promotion.end_date < day || `${snapshot.promotion.next_date}T${snapshot.promotion.next_time}` < `${day}T${time}`) return;
  }
  snapshots.set(locale, snapshot);
  return snapshot;
}

export function savePromotionSnapshot(locale: string, promotion: PublicPromotion | undefined, expectedGeneration: number) {
  if (expectedGeneration !== generation || typeof window === 'undefined') return;
  const snapshot = { savedAt: Date.now(), promotion };
  snapshots.set(locale, snapshot);
  try { sessionStorage.setItem(prefix + locale, JSON.stringify(snapshot)); } catch { /* Memory caching still works. */ }
}

export function clearPromotionSnapshots() {
  generation++;
  snapshots.clear();
  if (typeof window === 'undefined') return;
  for (const locale of SUPPORTED_LOCALES) {
    try { sessionStorage.removeItem(prefix + locale); } catch { /* Refresh directly when storage is blocked. */ }
  }
}
