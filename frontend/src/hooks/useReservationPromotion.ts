import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolvedLocale } from '../i18n';
import { publicRequestCache } from '../api/requestCache';
import { reservationService } from '../services/reservationService';
import type { PublicPromotion } from '../services/reservationService';
import { promotionCacheGeneration, readPromotionSnapshot, savePromotionSnapshot } from '../utils/reservationPromotionCache';
import '../i18n/reservations';

export function prefetchReservationPromotion(locale = resolvedLocale()) {
  const generation = promotionCacheGeneration();
  return publicRequestCache.read(`reservation-promotions:${locale}`, async () => {
    const offers = await reservationService.publicPromotions(locale);
    savePromotionSnapshot(locale, offers[0], generation);
    return offers;
  }, 15_000, ['reservation-promotions']);
}

type Result = { locale: string; promotion?: PublicPromotion; loading: boolean };
export function useReservationPromotionState(enabled = true) {
  useTranslation('reservations');
  const locale = resolvedLocale();
  const cached = enabled ? readPromotionSnapshot(locale) : undefined;
  const [result, setResult] = useState<Result>(() => ({ locale, promotion: cached?.promotion, loading: enabled && !cached }));
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let request = 0;
    const refresh = () => {
      const current = ++request;
      void prefetchReservationPromotion(locale)
        .then(offers => { if (active && current === request) setResult({ locale, promotion: offers[0], loading: false }); })
        .catch(() => { if (active && current === request) setResult({ locale, promotion: readPromotionSnapshot(locale)?.promotion, loading: false }); });
    };
    const visibleRefresh = () => { if (document.visibilityState === 'visible') refresh(); };
    const invalidated = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== 'reservation-promotions') return;
      setResult({ locale, loading: true });
      refresh();
    };
    refresh();
    const timer = window.setInterval(visibleRefresh, 30_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('publicDataInvalidated', invalidated);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('publicDataInvalidated', invalidated);
      document.removeEventListener('visibilitychange', visibleRefresh);
    };
  }, [enabled, locale]);
  if (!enabled) return { promotion: undefined, loading: false };
  return result.locale === locale ? result : { promotion: cached?.promotion, loading: !cached };
}

export function useReservationPromotion(enabled = true) {
  return useReservationPromotionState(enabled).promotion;
}
