import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolvedLocale } from '../i18n';
import { publicRequestCache } from '../api/requestCache';
import { reservationService } from '../services/reservationService';
import type { PublicPromotion } from '../services/reservationService';
import '../i18n/reservations';

export function useReservationPromotion(enabled = true) {
  useTranslation('reservations');
  const locale = resolvedLocale();
  const [result, setResult] = useState<{ locale: string; promotion?: PublicPromotion } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const refresh = () => {
      void publicRequestCache.read(`reservation-promotions:${locale}`, () => reservationService.publicPromotions(locale), 15_000, ['reservation-promotions'])
        .then(offers => { if (active) setResult({ locale, promotion: offers[0] }); })
        .catch(() => { if (active) setResult(null); });
    };
    const visibleRefresh = () => { if (document.visibilityState === 'visible') refresh(); };
    const invalidated = (event: Event) => { if ((event as CustomEvent<string>).detail === 'reservation-promotions') refresh(); };
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
  return enabled && result?.locale === locale ? result.promotion : undefined;
}
