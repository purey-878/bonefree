import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import i18n, { i18nReady } from '../i18n';
import ReservationPromotionNotice, { ReservationPromotionBadge, ReservationPromotionSelection } from './ReservationPromotionNotice';
import type { PublicPromotion } from '../services/reservationService';
const promotion: PublicPromotion = { id: 1, title: 'Online offer', scope: 'À la carte', percentage: '10.00', description: '', conditions: 'Reservation date only.', start_date: '2026-11-16', end_date: '2026-11-30', weekdays: [0, 2], windows: [{ start: '18:00', end: '20:00' }], next_date: '2026-11-18', next_time: '18:00' };
beforeAll(async () => { await i18nReady; await i18n.changeLanguage('en-GB'); });
describe('reservation promotion announcements', () => {
  it('reserves a loading card without advertising a discount before the first live response', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ReservationPromotionNotice loading variant="booking" /></MemoryRouter>);
    expect(html).toContain('promo-notice--booking');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('reservation-promo-sticker');
    expect(html).not.toContain('href=');
  });
  it('renders neither a badge nor a message without an eligible offer', () => {
    expect(renderToStaticMarkup(<ReservationPromotionBadge />)).toBe('');
    expect(renderToStaticMarkup(<MemoryRouter><ReservationPromotionNotice /></MemoryRouter>)).toBe('');
  });
  it('shows a compact exact discount and keeps eligibility conditions available', () => {
    expect(renderToStaticMarkup(<ReservationPromotionBadge promotion={promotion} />)).toContain('Discount −10%');
    const html = renderToStaticMarkup(<MemoryRouter><ReservationPromotionNotice promotion={promotion} /></MemoryRouter>);
    expect(html).toContain('−10%');
    expect(html).not.toContain('2026–');
    expect(html).not.toContain('Good plans. Extra perks.');
    expect(html).toContain('18:00–20:00');
    expect(html).not.toContain('Monday');
    expect(html).not.toContain('Wednesday');
    expect(html).toContain('Reservation date only.');
    expect(html).toContain('href="/reservations?date=2026-11-18"');
    expect(html).toContain('Reserve a Table');
    expect(html).toContain('On À la carte');
  });
  it('shows an exact compact discount tag for reservation buttons', () => {
    expect(renderToStaticMarkup(<ReservationPromotionBadge promotion={promotion} compact />)).toContain('>−10%</span>');
  });
  it('distinguishes date eligibility from an applied discount and clears ineligible selections', () => {
    const eligible = renderToStaticMarkup(<ReservationPromotionSelection selection={{ day: '2026-11-18', promotion }} />);
    expect(eligible).toContain('Choose an eligible time');
    expect(eligible).toContain('−10% on À la carte');
    expect(eligible).not.toContain('applies to your reservation');
    const applied = renderToStaticMarkup(<ReservationPromotionSelection selection={{ day: '2026-11-18', time: '18:00', promotion }} />);
    expect(applied).toContain('−10% on À la carte applies to your reservation at 18:00');
    expect(applied).toContain('role="status"');
    expect(applied).toContain('A little extra joy for your table!');
    expect(applied).toContain('reservation-promo-celebration');
    const ineligible = renderToStaticMarkup(<ReservationPromotionSelection selection={{ day: '2026-11-18', time: '12:00' }} />);
    expect(ineligible).toContain('No discount for the selected time');
    expect(ineligible).not.toContain('is-applied');
    expect(renderToStaticMarkup(<ReservationPromotionSelection />)).toBe('');
  });
  it('provides a separate booking-page notice with an explicit date-selection button', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ReservationPromotionNotice promotion={{ ...promotion, description: "A treat for your next meal." }} variant="booking" onChoose={() => {}} /></MemoryRouter>);
    expect(html).toContain('promo-notice--booking');
    expect(html).toContain('On À la carte');
    expect(html.indexOf('A treat for your next meal.')).toBeLessThan(html.indexOf('<details>'));
    expect(html.indexOf('Choose your date and party size')).toBeLessThan(html.indexOf('<details>'));
    expect(html).toContain('−10%');
    expect(html).toContain('type="button"');
    expect(html).not.toContain('<form');
  });
});
