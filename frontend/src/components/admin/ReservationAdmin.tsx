import { CalendarDays, CalendarClock, ChevronLeft, ChevronRight, RefreshCw, Search, Settings2, Ticket, Users } from 'lucide-react';
import { reservationPercent } from '../../utils/reservationFormatting';
import { resolvedLocale } from '../../i18n';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/errors';
import { reservationService, toPromotionInput } from '../../services/reservationService';
import type { BookingPage, BookingSettings, DateException, PromotionAdmin, PromotionInput, SettingsResult, StatusUpdate } from '../../services/reservationService';
import '../../i18n/reservations';
import './ReservationAdmin.css';

type Window = { start: string; end: string };
const statuses: StatusUpdate['status'][] = ['confirmed', 'cancelled', 'completed', 'no_show'];
const emptyPromotion = (): PromotionInput => ({ title: '', description: '', scope: '', conditions: '', percentage: 0, start_date: '', end_date: '', enabled: false, automatic: true, weekdays: [0,1,2,3,4,5,6], windows: [], translations: {} });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());

function WindowsEditor({ value, onChange, label }: { value: Window[]; onChange: (windows: Window[]) => void; label: string }) {
  const { t } = useTranslation('reservations');
  return <div className="ra-windows" aria-label={label}>{value.map((window, index) => <div className="ra-window" key={index}>
    <label>{t('start')}<input type="time" required value={window.start} onChange={e => onChange(value.map((w,i) => i === index ? { ...w, start: e.target.value } : w))} /></label>
    <label>{t('end')}<input type="time" required value={window.end} onChange={e => onChange(value.map((w,i) => i === index ? { ...w, end: e.target.value } : w))} /></label>
    <button type="button" onClick={() => onChange(value.filter((_,i) => i !== index))}>{t('remove')}</button>
  </div>)}<button type="button" disabled={value.length >= 8} onClick={() => onChange([...value, { start: '', end: '' }])}>{t('addWindow')}</button></div>;
}

export default function ReservationAdmin({ owner }: { owner: boolean }) {
  const { t } = useTranslation('reservations');
  const weekdays = t('weekdaysList', { returnObjects: true }) as string[];
  const [tab, setTab] = useState<'reservations' | 'settings'>('reservations');
  const [bookings, setBookings] = useState<BookingPage | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState({ search: '', day: today(), status: '', upcoming: false, promotion: 0 });
  const [search, setSearch] = useState('');
  const [version, setVersion] = useState(0);
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [exceptions, setExceptions] = useState<DateException[]>([]);
  const [promotions, setPromotions] = useState<PromotionAdmin[]>([]);
  const [exception, setException] = useState<DateException>({ day: '', closed: true, windows: [] });
  const [promotion, setPromotion] = useState<PromotionInput>(emptyPromotion);
  const [promotionId, setPromotionId] = useState<number>();
  const [textLocale, setTextLocale] = useState<'pt-PT'|'en-GB'|'de-DE'>('pt-PT');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setSearch(filter.search), 350); return () => window.clearTimeout(timer); }, [filter.search]);
  useEffect(() => {
    if (tab !== 'reservations' || busy) return;
    let active = true;
    let pending = false;
    const controller = new AbortController();
    const load = async (background = false) => {
      if (!active || pending || document.visibilityState === 'hidden' || !navigator.onLine) return;
      pending = true;
      try {
        const result = await reservationService.list({ page, per_page: 20, search, day: filter.day || undefined, status: (filter.status || undefined) as StatusUpdate['status'] | undefined, upcoming: filter.upcoming, promotion_id: filter.promotion || undefined }, controller.signal);
        if (active) { setBookings(result); setListError(''); }
      } catch {
        if (active && !background) setListError(t('error'));
      } finally { pending = false; }
    };
    const refresh = () => { void load(true); };
    void load();
    const timer = window.setInterval(refresh, 10_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [busy, filter.day, filter.promotion, filter.status, filter.upcoming, page, search, t, tab, version]);
  useEffect(() => {
    if (tab !== 'settings' || !owner) return;
    let active = true;
    Promise.all([reservationService.adminSettings(), reservationService.exceptions(), reservationService.promotions()]).then(([config, dates, offers]) => { if (active) { setSettings(config); setExceptions(dates); setPromotions(offers); } }).catch(() => { if (active) setError(t('error')); });
    return () => { active = false; };
  }, [owner, t, tab, version]);
  const act = async (action: () => Promise<unknown>, refresh = true) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(t('saved')); if (refresh) setVersion(value => value + 1); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : t('error')); }
    finally { setBusy(false); }
  };
  const changeConfig = (changes: Partial<BookingSettings>) => { if (settings) setSettings({ ...settings, settings: { ...settings.settings, ...changes } }); };
  const savePromotion = (event: FormEvent) => {
    event.preventDefault();
    const translations = Object.fromEntries(Object.entries(promotion.translations ?? {}).filter(([, value]) => value && Object.values(value).some(text => text?.trim())));
    void act(async () => { const result = await reservationService.savePromotion({ ...promotion, translations }, promotionId); setPromotion(toPromotionInput(result)); setPromotionId(result.id); });
  };
  const text = textLocale === 'pt-PT' ? promotion : promotion.translations?.[textLocale] ?? { title: '', description: '', scope: '', conditions: '' };
  const textChange = (key: 'title'|'description'|'scope'|'conditions', value: string) => setPromotion(current => textLocale === 'pt-PT' ? { ...current, [key]: value } : { ...current, translations: { ...current.translations, [textLocale]: { title: '', scope: '', ...current.translations?.[textLocale], [key]: value } } });
  const config = settings?.settings;
  const numericFields = [['minimum_notice_minutes','notice',0,10080],['horizon_days','horizon',1,365],['min_guests','minGuests',1,100],['max_guests','maxGuests',1,100],['max_reservations_per_slot','maxBookings',1,1000],['max_guests_per_slot','maxSlotGuests',1,1000],['retention_days','retention',30,730]] as const;
  return <section className="reservation-admin">
    <header className="ra-header"><span className="ra-header-icon" aria-hidden="true"><CalendarDays size={25} strokeWidth={1.6} /></span><div><h2>{t('adminTitle')}</h2><p>{t('adminIntro')}</p></div></header>
    <div className="ra-tabs" role="tablist" aria-label={t('adminTitle')}><button role="tab" aria-selected={tab === 'reservations'} onClick={() => setTab('reservations')}><CalendarDays size={17} aria-hidden="true" />{t('adminTitle')}</button>{owner && <button role="tab" aria-selected={tab === 'settings'} onClick={() => setTab('settings')}><Settings2 size={17} aria-hidden="true" />{t('settings')}</button>}</div>
    {(error || (tab === 'reservations' && listError)) && <p role="alert" className="ra-warning">{error || listError}</p>}<p role="status" aria-live="polite">{message}</p>
    {tab === 'reservations' ? <>
      <div className="ra-toolbar"><div className="ra-filters"><label className="ra-search-label">{t('search')}<span className="ra-search"><Search size={18} aria-hidden="true" /><input placeholder={t('search')} type="search" maxLength={120} value={filter.search} onChange={e => { setFilter({ ...filter, search: e.target.value }); setPage(1); }} /></span></label>
        <label>{t('date')}<input type="date" value={filter.day} onChange={e => { setFilter({ ...filter, day: e.target.value }); setPage(1); }} /></label>
        <label>{t('status')}<select value={filter.status} onChange={e => { setFilter({ ...filter, status: e.target.value }); setPage(1); }}><option value="">{t('all')}</option>{statuses.map(status => <option key={status} value={status}>{t(status)}</option>)}</select></label>
      </div><div className="ra-actions"><button onClick={() => { setFilter({ ...filter, day: today(), upcoming: false }); setPage(1); }}>{t('today')}</button><button onClick={() => { setFilter({ ...filter, day: '', upcoming: true }); setPage(1); }}>{t('upcoming')}</button><button onClick={() => { setFilter({ search: '', day: '', status: '', upcoming: false, promotion: 0 }); setPage(1); }}>{t('all')}</button><button onClick={() => { setError(''); setVersion(value => value + 1); }}><RefreshCw size={16} aria-hidden="true" />{t('refresh')}</button></div></div>
      {bookings ? <><p className="ra-result-count"><strong>{bookings.total}</strong> {t('adminTitle')}</p>{bookings.total === 0 && <div className="ra-empty"><CalendarClock size={32} strokeWidth={1.4} aria-hidden="true" /><h3>{t('emptyTitle')}</h3><p>{t('emptyHint')}</p></div>}<div className="ra-bookings">{bookings.items.map(booking => <article key={booking.id} className="ra-booking" data-status={booking.status}>
        <header><div className="ra-booking-top"><strong>{booking.reference}</strong><span className="ra-status">{t(booking.status)}</span></div><h3>{booking.name}</h3></header><p className="ra-visit"><span><CalendarDays size={15} aria-hidden="true" />{booking.day}</span><span>{booking.time}</span><span><Users size={15} aria-hidden="true" />{booking.guests}</span></p>
        <label>{t('status')}<select disabled={busy} value={booking.status} onChange={e => { void act(async () => { await reservationService.status(booking.id, e.target.value as StatusUpdate['status']); }); }}>{statuses.map(status => <option key={status} value={status}>{t(status)}</option>)}</select></label>
        <p className="ra-offer"><Ticket size={16} aria-hidden="true" />{booking.promotion ? `${reservationPercent(booking.promotion.percentage, resolvedLocale())}% · ${booking.promotion.title}` : t('noPromotion')}</p>
        <details><summary>{t('details')}</summary><dl>{[[t('email'), booking.email], [t('phone'), booking.phone], [t('requests'), booking.special_requests], [t('created'), new Date(booking.created_at.endsWith('Z') ? booking.created_at : `${booking.created_at}Z`).toLocaleString(undefined, { timeZone: 'Europe/Lisbon' })]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>{booking.promotion && <><p>{booking.promotion.scope}</p><p>{booking.promotion.conditions}</p></>}</details>
      </article>)}</div><div className="ra-actions"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} aria-hidden="true" />{t('previous')}</button><span>{page} / {Math.max(1, bookings.total_pages)}</span><button disabled={page >= bookings.total_pages} onClick={() => setPage(value => value + 1)}>{t('next')}<ChevronRight size={16} aria-hidden="true" /></button></div></> : <p role="status">{t('loading')}</p>}
    </> : owner && <fieldset disabled={busy} className="ra-settings">
      {config ? <form id="reservation-availability-form" aria-label={t("bookingSettings")} onSubmit={e => { e.preventDefault(); void act(async () => setSettings(await reservationService.saveSettings(config)), false); }}>
        <h3><CalendarDays size={20} aria-hidden="true" />{t('bookingSettings')}</h3><label className="ra-check"><input name="enabled" type="checkbox" checked={!!config.enabled} onChange={e => changeConfig({ enabled: e.target.checked })} />{t('enabled')}</label>
        <div className="ra-fields">{numericFields.map(([key,label,min,max]) => <label key={key}>{t(label)}<input name={key} type="number" required min={min} max={max} value={config[key] ?? ''} onChange={e => changeConfig({ [key]: Number(e.target.value) })} /></label>)}<label>{t('interval')}<select value={config.interval_minutes} onChange={e => changeConfig({ interval_minutes: Number(e.target.value) as 15|30|60 })}>{[15,30,60].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <h4>{t('weekly')}</h4><p>{t('windowsHelp')}</p>{weekdays.map((label, index) => <div key={index} className="ra-weekday"><label className="ra-check"><input type="checkbox" checked={!!config.weekly?.[index]?.length} onChange={e => changeConfig({ weekly: { ...config.weekly, [index]: e.target.checked ? [{ start: '', end: '' }] : [] } })} />{label}</label>{!!config.weekly?.[index]?.length && <WindowsEditor label={label} value={config.weekly[index]} onChange={windows => changeConfig({ weekly: { ...config.weekly, [index]: windows } })} />}</div>)}
        <button type="submit">{t('save')}</button>{!!settings?.conflicting_bookings && <p className="ra-warning" role="status">{t('conflicts', { count: settings?.conflicting_bookings })}</p>}
      </form> : <p role="status">{t('loading')}</p>}
      <section><h3>{t('exceptions')}</h3><form id="reservation-exception-form" aria-label={t("exceptions")} onSubmit={e => { e.preventDefault(); void act(async () => setSettings(await reservationService.saveException(exception))); }}><label>{t('date')}<input type="date" required value={exception.day} onChange={e => setException({ ...exception, day: e.target.value })} /></label><label className="ra-check"><input type="checkbox" checked={exception.closed} onChange={e => setException({ ...exception, closed: e.target.checked, windows: e.target.checked ? [] : [{ start: '', end: '' }] })} />{t('closed')}</label>{!exception.closed && <WindowsEditor label={t('specialOpening')} value={exception.windows ?? []} onChange={windows => setException({ ...exception, windows })} />}<button type="submit">{t('save')}</button></form><ul>{exceptions.map(item => <li key={item.day}>{item.day} · {t(item.closed ? 'closed' : 'specialOpening')} <button onClick={() => setException(item)}>{t('edit')}</button><button onClick={() => { void act(async () => setSettings(await reservationService.deleteException(item.day))); }}>{t('delete')}</button></li>)}</ul></section>
      <section><h3><Ticket size={20} aria-hidden="true" />{t('promotions')}</h3><p>{t('promoRule')}</p><button onClick={() => { setPromotion(emptyPromotion()); setPromotionId(undefined); setTextLocale('pt-PT'); }}>{t('newPromotion')}</button><ul>{promotions.map(item => <li key={item.id}><strong>{item.title}</strong> · {item.percentage}% · {t(item.enabled ? 'active' : 'closed')} <button onClick={() => { setPromotion(toPromotionInput(item)); setPromotionId(item.id); setTextLocale('pt-PT'); }}>{t('edit')}</button><button onClick={() => { setFilter({ search: '', day: '', status: '', upcoming: false, promotion: item.id }); setPage(1); setTab('reservations'); }}>{t('awarded')}</button></li>)}</ul>
        <form id="reservation-promotion-form" aria-label={t("promotions")} onSubmit={savePromotion}><div className="ra-fields"><label>{t('percentage')}<input name="percentage" type="number" required min="0.01" max="100" step="0.01" value={promotion.percentage} onChange={e => setPromotion({ ...promotion, percentage: e.target.value })} /></label><label>{t('startDate')}<input name="start_date" type="date" required value={promotion.start_date} onChange={e => setPromotion({ ...promotion, start_date: e.target.value })} /></label><label>{t('endDate')}<input name="end_date" type="date" required min={promotion.start_date} value={promotion.end_date} onChange={e => setPromotion({ ...promotion, end_date: e.target.value })} /></label></div>
          <label className="ra-check"><input name="enabled" type="checkbox" checked={promotion.enabled} onChange={e => setPromotion({ ...promotion, enabled: e.target.checked })} />{t('active')}</label><label className="ra-check"><input type="checkbox" checked={promotion.automatic} onChange={e => setPromotion({ ...promotion, automatic: e.target.checked })} />{t('automatic')}</label>
          <label>{t('sourceLanguage')}<select name="promotion_locale" value={textLocale} onChange={e => setTextLocale(e.target.value as typeof textLocale)}><option value="pt-PT">Português</option><option value="en-GB">English</option><option value="de-DE">Deutsch</option></select></label><p>{t('sourceRequired')}</p>
          {(['title','description','scope','conditions'] as const).map(key => <label key={key}>{t(key === 'title' ? 'promotionTitle' : key)}{key === 'conditions' || key === 'description' ? <textarea name={key} rows={3} maxLength={key === 'conditions' ? 1000 : 500} value={text[key] ?? ''} onChange={e => textChange(key,e.target.value)} /> : <input name={key} required={textLocale === 'pt-PT'} maxLength={key === 'title' ? 120 : 180} value={text[key]} onChange={e => textChange(key,e.target.value)} />}</label>)}
          <fieldset><legend>{t('weekdays')}</legend>{weekdays.map((label,index) => <label key={index} className="ra-check"><input type="checkbox" checked={promotion.weekdays?.includes(index)} onChange={e => setPromotion({ ...promotion, weekdays: e.target.checked ? [...(promotion.weekdays ?? []),index] : promotion.weekdays?.filter(day => day !== index) })} />{label}</label>)}</fieldset><WindowsEditor label={t('time')} value={promotion.windows ?? []} onChange={windows => setPromotion({ ...promotion, windows })} /><button type="submit">{t('save')}</button>
        </form>
      </section>
      <section><h3>{t('privacyTitle')}</h3><p>{t('privacy')}</p><button onClick={() => { if (window.confirm(t('purgeConfirm'))) void act(async () => { const result = await reservationService.purge(); window.alert(t('purged', { count: result.deleted })); }); }}>{t('purge')}</button></section>
    </fieldset>}
  </section>;
}
