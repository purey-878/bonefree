import { CalendarDays, CalendarX2, Clock3, Copy, Download, MapPin, Sprout, Tag, Users } from 'lucide-react';
import { reservationPercent } from '../utils/reservationFormatting';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/errors';
import { brandLogo } from '../constants/brandLogo';
import { resolvedLocale } from '../i18n';
import { reservationService } from '../services/reservationService';
import type { PassResponse } from '../services/reservationService';
import '../i18n/reservations';

export default function ReservationPass({ pass, token, onUpdate }: { pass: PassResponse; token: string; onUpdate: (pass: PassResponse) => void }) {
  const { t } = useTranslation('reservations');
  const locale = resolvedLocale();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmingCancellation, setConfirmingCancellation] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const cancellationInProgress = useRef(false);
  const keepButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    title.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => { if (confirmingCancellation) keepButton.current?.focus(); }, [confirmingCancellation]);
  const date = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Lisbon' }).format(new Date(`${pass.day}T12:00:00Z`));
  const active = pass.status === 'confirmed';
  const download = async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const blob = await reservationService.pdf({ token, locale });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `bonefree-${pass.reference}.pdf`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { setMessage(t('error')); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/reservations/confirmation#token=${token}`); setMessage(t('copied')); }
    catch { setMessage(t('copyFailed')); }
  };
  const cancel = async () => {
    if (cancellationInProgress.current || !pass.can_cancel) return;
    cancellationInProgress.current = true;
    setCancelBusy(true); setCancelError(''); setMessage('');
    try {
      const next = await reservationService.cancel({ token, locale });
      onUpdate(next); setConfirmingCancellation(false); setMessage(t('cancelled'));
      requestAnimationFrame(() => { window.scrollTo({ top: 0, behavior: 'instant' }); title.current?.focus({ preventScroll: true }); });
    } catch (cause) {
      const unavailable = cause instanceof ApiError && cause.code === 'reservation_cancellation_unavailable';
      setCancelError(t(unavailable ? 'cancellationUnavailable' : 'cancelFailed'));
      if (unavailable) {
        try { onUpdate(await reservationService.confirmation({ token, locale })); } catch { /* Keep the saved pass and error visible for retry. */ }
      }
    } finally { cancellationInProgress.current = false; setCancelBusy(false); }
  };
  return <div className="reservation-confirmation">
    <header className="reservation-confirmation-heading">
      <h1 ref={title} tabIndex={-1}>{active ? t('confirmedHeading') : t(pass.status)}</h1>
      <p>{active ? t('savePassInstruction') : t('inactive')}</p>
    </header>
    <div className="reservation-ticket-wrap">
      <article className={`reservation-pass${active ? '' : ' reservation-pass-inactive'}`} aria-labelledby="reservation-pass-status">
        <div className="reservation-ticket-main">
        <header className="reservation-ticket-header">
          <img {...brandLogo} sizes="96px" className="reservation-logo" alt="BoneFree" />
          <h2 id="reservation-pass-status" className="reservation-ticket-status">{t(pass.status)}</h2>
          {active && <span className="reservation-ticket-rays" aria-hidden="true" />}
        </header>
        <div className="reservation-ticket-body">
          <dl className="reservation-pass-grid">
            <div className="reservation-ticket-date"><dt><CalendarDays size={22} aria-hidden="true" /><span className="visually-hidden">{t('date')}</span></dt><dd>{date}</dd></div>
            <div><dt><Clock3 size={22} aria-hidden="true" /><span className="visually-hidden">{t('time')}</span></dt><dd>{pass.time}</dd></div>
            <div><dt><Users size={22} aria-hidden="true" /><span className="visually-hidden">{t('guests')}</span></dt><dd>{t('guestCount', { count: pass.guests })}</dd></div>
          </dl>
          {active && pass.promotion && <section className="reservation-offer" aria-label={t('awarded')}>
            <Tag size={21} strokeWidth={1.8} aria-hidden="true" />
            <div><h3>{t('ticketPromotion', { percentage: reservationPercent(pass.promotion.percentage, locale), scope: pass.promotion.scope })}</h3>
              <strong>{pass.promotion.title}</strong>
              {pass.promotion.description && <p>{pass.promotion.description}</p>}
              {pass.promotion.conditions && <p>{pass.promotion.conditions}</p>}
              <small>{t('passPromotionNote')}</small>
            </div>
          </section>}
        </div>
        </div>
        <footer className="reservation-ticket-stub">
          <Sprout size={28} strokeWidth={1.8} aria-hidden="true" />
          <h3 className="reservation-ticket-name">{pass.name}</h3>
          <dl className="reservation-reference"><dt>{t('reference')}</dt><dd><strong>{pass.reference}</strong></dd></dl>
        </footer>
      </article>
    </div>
    {(active || cancelError) && <section className={`reservation-pass-cancellation${confirmingCancellation || !pass.can_cancel ? ' is-expanded' : ''}`} aria-label={t('cancelReservation')}>
      {pass.can_cancel ? confirmingCancellation ? <div id="reservation-cancel-confirmation" role="group" aria-labelledby="reservation-cancel-title" aria-busy={cancelBusy}>
        <h2 id="reservation-cancel-title">{t('cancelTitle')}</h2>
        <p>{t('cancelQuestion', { date, time: pass.time })}</p>
        <div className="reservation-actions">
          <button ref={keepButton} type="button" disabled={cancelBusy} onClick={() => { setConfirmingCancellation(false); setCancelError(''); requestAnimationFrame(() => cancelButton.current?.focus()); }}>{t('keepReservation')}</button>
          <button type="button" className="reservation-cancel-confirm" disabled={cancelBusy} onClick={() => { void cancel(); }}>{cancelBusy ? t('cancelling') : t('confirmCancellation')}</button>
        </div>
      </div> : <button ref={cancelButton} type="button" className="reservation-cancel-open" aria-expanded={confirmingCancellation} aria-controls="reservation-cancel-confirmation" onClick={() => { setConfirmingCancellation(true); setCancelError(''); }}><CalendarX2 size={15} strokeWidth={1.6} aria-hidden="true" />{t('cancelReservation')}</button> : active && <p>{t('cancellationUnavailable')} <Link to="/contact">{t('contact')}</Link></p>}
      {cancelError && <p className="reservation-cancel-error" role="alert">{cancelError}</p>}
    </section>}
    <section className="reservation-pass-actions" aria-label={t('savePass')}>
      <button type="button" className="reservation-primary" onClick={() => { void download(); }} disabled={busy || cancelBusy}><Download size={19} aria-hidden="true" />{busy ? t('loading') : t('download')}</button>
      <div className="reservation-private-link">
        <button type="button" onClick={() => { void copy(); }} aria-describedby="reservation-private-link-note"><Copy size={16} aria-hidden="true" />{t('copyPrivateLink')}</button>
        <p id="reservation-private-link-note">{t('privateLinkNote')}</p>
      </div>
      <p className="reservation-save-feedback" role="status" aria-live="polite">{message}</p>
    </section>
    {pass.restaurant_address && <details className="reservation-directions">
      <summary><MapPin size={16} aria-hidden="true" />{t('directions')}</summary>
      <address><strong>{pass.restaurant_name}</strong><br />{pass.restaurant_address}</address>
      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pass.restaurant_name} ${pass.restaurant_address}`)}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('openMap')}</a>
      <p>{t('dateZone')}</p>
    </details>}
    <footer className="reservation-management">
      <Link to="/reservations">{t('back')}</Link>

    </footer>
  </div>;
}
