import { ArrowUpRight, Check, ChevronDown, PartyPopper, Sparkles } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { resolvedLocale } from '../i18n';
import type { Award, PublicPromotion } from '../services/reservationService';
import { reservationPercent } from '../utils/reservationFormatting';
import '../i18n/reservations';
import './ReservationPromotionNotice.css';

type Props = { promotion?: PublicPromotion };
export type PromotionSelection = { day: string; time?: string; promotion?: Award };

export function ReservationPromotionBadge({ promotion, compact = false }: Props & { compact?: boolean }) {
  const { t } = useTranslation('reservations');
  if (!promotion) return null;
  return <span className="reservation-promo-badge">{compact ? `−${reservationPercent(promotion.percentage, resolvedLocale())}%` : t('promoBadge', { percentage: reservationPercent(promotion.percentage, resolvedLocale()) })}</span>;
}

export function ReservationPromotionSelection({ selection }: { selection?: PromotionSelection }) {
  const { t } = useTranslation('reservations');
  const feedback = useRef<HTMLDivElement>(null);
  const [reservedHeight, setReservedHeight] = useState(0);
  useLayoutEffect(() => {
    const element = feedback.current;
    if (!element) return;
    // Keep the space already used by feedback when availability refreshes or
    // an applied offer becomes an eligibility hint. Never show stale offers.
    const measure = () => setReservedHeight(height => Math.max(height, element.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selection]);
  if (!selection && reservedHeight === 0) return null;
  const { promotion, time } = selection ?? {};
  const applied = !!promotion && !!time;
  return <div ref={feedback} className="reservation-promo-feedback" style={{ minHeight: reservedHeight }}>
    {selection && <div className={`reservation-promo-selection${applied ? ' is-applied' : ''}`} role="status">
    {applied ? <span className="reservation-promo-celebration" aria-hidden="true"><PartyPopper size={22} /></span> : promotion && <Check size={15} aria-hidden="true" />}
    <span>{applied && <strong className="reservation-promo-happy">{t('promoHappy')}</strong>}{promotion ? t(time ? 'promoApplied' : 'promoDateEligible', { percentage: reservationPercent(promotion.percentage, resolvedLocale()), scope: promotion.scope, time }) : t(time ? 'promoTimeIneligible' : 'promoDateIneligible')}</span>
    </div>}
  </div>;
}

export default function ReservationPromotionNotice({ promotion, variant = 'home', onChoose, selection, loading = false }: Props & { variant?: 'home' | 'booking'; onChoose?: (day: string) => void; selection?: PromotionSelection; loading?: boolean }) {
  const { t } = useTranslation('reservations');
  if (!promotion && loading) return <aside className={`reservation-promo-notice promo-notice--${variant} reservation-promo-loading`} role="status" aria-busy="true" aria-label={t('loading')}>
    <span>{t('loading')}</span><div className="reservation-promo-placeholder" aria-hidden="true"><i /><i /><i /></div>
  </aside>;
  if (!promotion) return null;
  const terms = <details><summary>{t('promoTerms')}<ChevronDown size={13} aria-hidden="true" /></summary>{promotion.windows.length > 0 && <p>{promotion.windows.map(window => `${window.start}–${window.end}`).join(' · ')}</p>}{variant === 'home' && promotion.description && <p>{promotion.description}</p>}{promotion.conditions && <p>{promotion.conditions}</p>}<p>{t('promotionNote')}</p></details>;
  if (variant === 'home') return <aside className="reservation-promo-notice promo-notice--home" aria-label={t('promoKicker')}>
    <span className="hero-promo-kicker"><Sparkles size={16} aria-hidden="true" />{t('promoKicker')}</span>
    <div className="hero-promo-offer">
      <strong className="hero-promo-percentage"><span className="visually-hidden">{t('percentage')} </span>−{reservationPercent(promotion.percentage, resolvedLocale())}%</strong>
      <h2 className="hero-promo-scope">{t('promoScope', { scope: promotion.scope })}</h2>
    </div>
    <p className="hero-promo-hint">{t('promoHint')}</p>
    <Link className="reservation-promo-action" to={`/reservations?date=${promotion.next_date}`}>{t('navigation.reserveTable', { ns: 'common' })}<ArrowUpRight size={18} aria-hidden="true" /></Link>
    {terms}
  </aside>;
  return <aside className={`reservation-promo-notice promo-notice--${variant}`} aria-label={t('promoKicker')}>
    <div className="reservation-promo-top"><strong className="reservation-promo-sticker"><span className="visually-hidden">{t('percentage')} </span>−{reservationPercent(promotion.percentage, resolvedLocale())}%</strong><div><span className="reservation-promo-kicker">{t('promoKicker')}</span><strong className="reservation-promo-scope">{t('promoScope', { scope: promotion.scope })}</strong></div>
      {onChoose ? <button className="reservation-promo-action" type="button" aria-label={t('promoBook')} onClick={() => onChoose(promotion.next_date)}><ArrowUpRight size={18} aria-hidden="true" /></button> : <Link className="reservation-promo-action" aria-label={t('promoBook')} to={`/reservations?date=${promotion.next_date}`}><ArrowUpRight size={18} aria-hidden="true" /></Link>}
    </div>
    {variant === 'booking' && <div className="reservation-promo-context">
      {promotion.description && <p>{promotion.description}</p>}
      <p>{t('promoHint')}</p>
    </div>}
    {terms}
    <ReservationPromotionSelection selection={selection} />
  </aside>;
}
