import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicPromotion } from '../services/reservationService';
import { clearPromotionSnapshots, promotionCacheGeneration, readPromotionSnapshot, savePromotionSnapshot } from './reservationPromotionCache';
import { invalidatePublicData } from '../api/requestCache';

const promotion: PublicPromotion = { id: 1, title: 'Lunch', scope: 'Menu', percentage: '10.00', start_date: '2026-11-01', end_date: '2026-11-30', next_date: '2026-11-23', next_time: '19:00', weekdays: [], windows: [] };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
  const values = new Map<string, string>();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  clearPromotionSnapshots();
});
afterEach(() => { clearPromotionSnapshots(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('recent public promotion snapshots', () => {
  it('returns verified offers synchronously, isolates languages and remembers no offer', () => {
    savePromotionSnapshot('pt-PT', promotion, promotionCacheGeneration());
    expect(readPromotionSnapshot('pt-PT')?.promotion).toEqual(promotion);
    expect(readPromotionSnapshot('en-GB')).toBeUndefined();
    savePromotionSnapshot('en-GB', undefined, promotionCacheGeneration());
    expect(readPromotionSnapshot('en-GB')).toMatchObject({ promotion: undefined });
  });
  it('restores a validated recent snapshot after a page reload', async () => {
    savePromotionSnapshot('pt-PT', promotion, promotionCacheGeneration());
    vi.resetModules();
    const reloaded = await import('./reservationPromotionCache');
    expect(reloaded.readPromotionSnapshot('pt-PT')?.promotion).toEqual(promotion);
    reloaded.clearPromotionSnapshots();
  });
  it('expires snapshots after one minute and rejects past eligible slots', () => {
    savePromotionSnapshot('pt-PT', promotion, promotionCacheGeneration());
    vi.advanceTimersByTime(60_000);
    expect(readPromotionSnapshot('pt-PT')).toBeUndefined();
    savePromotionSnapshot('pt-PT', { ...promotion, next_time: '11:00' }, promotionCacheGeneration());
    expect(readPromotionSnapshot('pt-PT')).toBeUndefined();
  });
  it('clears saved offers on administrator changes and rejects an older in-flight response', () => {
    const generation = promotionCacheGeneration();
    savePromotionSnapshot('pt-PT', promotion, generation);
    invalidatePublicData('reservation-promotions');
    expect(readPromotionSnapshot('pt-PT')).toBeUndefined();
    savePromotionSnapshot('pt-PT', promotion, generation);
    expect(readPromotionSnapshot('pt-PT')).toBeUndefined();
  });
  it('works when browser storage is blocked and ignores malformed stored offers', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify({ savedAt: Date.now(), promotion: { id: 1 } }), setItem: () => { throw new Error('blocked'); }, removeItem: () => {} });
    expect(readPromotionSnapshot('pt-PT')).toBeUndefined();
    savePromotionSnapshot('pt-PT', promotion, promotionCacheGeneration());
    expect(readPromotionSnapshot('pt-PT')?.promotion).toEqual(promotion);
  });
});
