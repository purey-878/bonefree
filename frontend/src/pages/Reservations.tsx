import { ArrowRight, ChevronDown, Clock3, Leaf, Minus, Plus, Shell } from 'lucide-react';
import { reservationPercent } from '../utils/reservationFormatting';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import ReservationPass from '../components/ReservationPass';
import ReservationDatePicker from '../components/ReservationDatePicker';
import { ApiError } from '../api/errors';
import { resolvedLocale } from '../i18n';
import { newBookingKey, reservationService } from '../services/reservationService';
import type { BookingInput, PassResponse, PublicSettings, Slot } from '../services/reservationService';
import '../i18n/reservations';
import './Reservations.css';
import { applyReservationAction } from '../seo/documentMetadata';

export default function Reservations() {
  const { t } = useTranslation('reservations');
  const locale = resolvedLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const privatePage = location.pathname.endsWith('/confirmation');
  const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loadedPass, setLoadedPass] = useState<{ token: string; locale: string; pass: PassResponse } | null>(null);
  const pass = loadedPass?.token === token && loadedPass.locale === locale ? loadedPass.pass : null;
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [guests, setGuests] = useState(2);
  const [availability, setAvailability] = useState<{ day: string; guests: number; locale: string; slots: Slot[] } | null>(null);
  const slots = availability?.slots ?? [];
  const availabilityCurrent = availability?.day === day && availability.guests === guests && availability.locale === locale;
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [attempt, setAttempt] = useState<BookingInput | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (privatePage || !settings) return;
    applyReservationAction(settings.enabled);
    return () => applyReservationAction(false);
  }, [privatePage, settings]);
  useEffect(() => {
    const controller = new AbortController();
    if (privatePage) {
      if (!/^[a-f0-9]{64}$/.test(token)) return;
      reservationService.confirmation({ token, locale }, controller.signal).then(pass => { if (!controller.signal.aborted) setLoadedPass({ token, locale, pass }); }).catch(() => { if (!controller.signal.aborted) setError(t('reservation_not_found')); });
    } else {
      reservationService.settings(controller.signal).then(next => {
        setSettings(next); setGuests(current => Math.max(next.min_guests, Math.min(current, next.max_guests)));
      }).catch(() => { if (!controller.signal.aborted) setError(t('error')); });
    }
    return () => controller.abort();
  }, [locale, privatePage, refresh, t, token]);
  useEffect(() => {
    if (attempt || privatePage || !settings?.enabled || !day || guests < settings.min_guests || guests > settings.max_guests) return;
    const controller = new AbortController();
    // Keep the last time grid in place while refreshing, but never allow stale times to be booked.
    setLoading(true); setTime('');
    reservationService.availability(day, guests, locale, controller.signal).then(result => { if (!controller.signal.aborted) { setAvailability({ day, guests, locale, slots: result.slots }); setError(''); } }).catch(() => { if (!controller.signal.aborted) { setAvailability(current => current ? { ...current, day: '' } : null); setError(t('error')); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, day, guests, locale, privatePage, refresh, settings, t]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || !time || !day || !selected) return;
    submitting.current = true; setBusy(true); setError('');
    const fields = new FormData(event.currentTarget);
    const payload: BookingInput = attempt ?? { name: String(fields.get('name') ?? ''), day, time, guests, email: String(fields.get('email') ?? '') || null, phone: String(fields.get('phone') ?? '') || null, special_requests: String(fields.get('special_requests') ?? '') || null, idempotency_key: newBookingKey() };
    setAttempt(payload);
    try {
      const saved = await reservationService.create(payload, locale);
      navigate(`/reservations/confirmation#token=${saved.confirmation_token}`, { replace: true });
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : undefined;
      setError(t(code && ['reservation_unavailable', 'reservation_guests', 'reservations_paused', 'reservation_retry_conflict', 'rate_limit_exceeded', 'validation_error'].includes(code) ? code : 'error'));
      // These errors are definitive rejections; network/5xx retries keep the same key and data.
      if (cause instanceof ApiError && cause.status && [400, 409, 422].includes(cause.status)) setAttempt(null);
    } finally { submitting.current = false; setBusy(false); }
  };
  const selected = availabilityCurrent && !loading ? slots.find(slot => slot.time === time && slot.available) : undefined;
  return <><Navbar /><main className={`reservation-page${privatePage ? ' reservation-confirmation-page' : ''}`}>
    {privatePage ? pass ? <ReservationPass key={`${token}:${locale}`} pass={pass} token={token} onUpdate={next => setLoadedPass(current => current?.token === token && current.locale === locale ? { ...current, pass: next } : current)} /> : <section className="reservation-card"><h1>{t('title')}</h1><p role={error ? 'alert' : 'status'}>{error || (/^[a-f0-9]{64}$/.test(token) ? t('loading') : t('lost'))}</p>{error && <button onClick={() => { setError(''); setRefresh(value => value + 1); }}>{t('retry')}</button>}<Link to="/contact">{t('contact')}</Link></section> : <section className="reservation-card reservation-booking-card reservation-beach-layout">
      <div className="reservation-beach-intro"><span className="reservation-beach-kicker"><Shell size={17} aria-hidden="true" />Bonefree · Costa da Caparica</span><h1>{t('title')}</h1><p>{t('intro')}</p></div>
      <div className="reservation-booking-content">
      {error && <p role="alert" className="reservation-warning">{error}</p>}
      {!settings ? <><p role="status">{error ? '' : t('loading')}</p>{error && <button onClick={() => setRefresh(value => value + 1)}>{t('retry')}</button>}</> : !settings.enabled ? <><p>{t('paused')}</p><Link to="/contact">{t('contact')}</Link></> : <form id="reservation-booking-form" onSubmit={event => { void submit(event); }}>
        <fieldset disabled={busy || !!attempt} className="reservation-fields"><legend className="visually-hidden">{t('title')}</legend>
          <div className="reservation-form-grid reservation-visit-fields"><div className="reservation-date-field"><label htmlFor="reservation-day">{t('date')}</label><ReservationDatePicker value={day} min={settings.today} max={settings.last_date} onChange={value => { setDay(value); setTime(''); }} /></div><div className="reservation-guests"><label htmlFor="reservation-guests">{t('guests')}</label><div className="reservation-guest-stepper"><button type="button" aria-label={t('fewerGuests')} disabled={guests <= settings.min_guests} onClick={() => { setGuests(value => value - 1); setTime(''); }}><Minus size={18} aria-hidden="true" /></button><input id="reservation-guests" type="number" name="guests" inputMode="numeric" required min={settings.min_guests} max={settings.max_guests} value={guests} onChange={e => { setGuests(Number(e.target.value)); setTime(''); }} /><button type="button" aria-label={t('moreGuests')} disabled={guests >= settings.max_guests} onClick={() => { setGuests(value => value + 1); setTime(''); }}><Plus size={18} aria-hidden="true" /></button></div></div></div>
          <fieldset className="reservation-time-options" aria-busy={loading} disabled={!day || loading || !availabilityCurrent}><legend>{t('time')}</legend><div className={`reservation-time-list${loading ? ' is-loading' : ''}`}>{slots.map(slot => <label className="reservation-time-choice" key={slot.time}><input type="radio" name="time" required value={slot.time} checked={time === slot.time} disabled={!slot.available} data-unavailable={!slot.available} onChange={() => setTime(slot.time)} /><span>{slot.time}</span>{!slot.available && <span className="visually-hidden">{t('unavailable')}</span>}</label>)}</div></fieldset>
          <p className="reservation-hint reservation-time-hint" role="status"><Clock3 size={15} aria-hidden="true" />{!day ? t('chooseDate') : loading ? t('loading') : slots.length === 0 ? t('noSlots') : t('dateZone')}</p>
          <label>{t('name')}<input name="name" placeholder={t('namePlaceholder')} autoComplete="name" minLength={2} maxLength={120} required /></label>
          <details className="reservation-contact-details"><summary>{t('contactDetails')}<ChevronDown size={18} aria-hidden="true" /></summary><div className="reservation-contact-content">
          <div className="reservation-form-grid"><label>{t('email')}<input type="email" name="email" autoComplete="email" maxLength={254} /></label><label>{t('phone')}<input type="tel" name="phone" autoComplete="tel" maxLength={32} /></label></div>
          <label>{t('requests')}<textarea name="special_requests" maxLength={1000} rows={3} /></label>
          </div></details>
        </fieldset>
        {selected?.promotion && <section className="reservation-offer"><Leaf size={20} aria-hidden="true" /><h2>{t('promotion', { percentage: reservationPercent(selected.promotion.percentage, locale), scope: selected.promotion.scope })}</h2><strong>{selected.promotion.title}</strong><p>{selected.promotion.description}</p><p>{selected.promotion.conditions}</p><small>{t('promotionNote')}</small></section>}
        <p className="reservation-hint reservation-email-note">{t('noEmail')}</p>{attempt && !busy && <p role="status">{t('pending')}</p>}
        <button className="reservation-primary" type="submit" disabled={busy || !selected}>{busy ? t('sending') : attempt ? t('retry') : t('submit')}<ArrowRight size={18} aria-hidden="true" /></button>
      </form>}
      </div>
    </section>}
  </main></>;
}
