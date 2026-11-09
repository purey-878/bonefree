import type { SupportedLocale } from '../i18n';
export function reservationPercent(value: string, locale: SupportedLocale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value));
}
