import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { resolvedLocale } from '../i18n';

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseDate(value: string) { return new Date(`${value}T12:00:00`); }
function monthValue(value: string) { return `${value.slice(0, 7)}-01`; }

export default function ReservationDatePicker({ value, min, max, onChange }: {
  value: string; min: string; max: string; onChange: (value: string) => void;
}) {
  const { t } = useTranslation('reservations');
  const locale = resolvedLocale();
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthValue(value || min));
  const [focusDay, setFocusDay] = useState(value || min);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(parseDate(month));
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const first = parseDate(month);
  first.setDate(1 - (first.getDay() + 6) % 7);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first); day.setDate(first.getDate() + index); return dateValue(day);
  });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = field.current?.getBoundingClientRect();
      const panel = popup.current;
      if (!anchor || !panel) return;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
      const top = anchor.bottom + 8 + height <= window.innerHeight - 12
        ? anchor.bottom + 8 : Math.max(12, anchor.top - height - 8);
      setPosition({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useLayoutEffect(() => {
    if (open) popup.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDay}"]`)?.focus({ preventScroll: true });
  }, [open, focusDay, month]);

  const prepareCalendar = () => {
    const initial = value && value >= min && value <= max ? value : min;
    setFocusDay(initial); setMonth(monthValue(initial));
  };
  const selectDay = (day: string) => {
    onChange(day); popup.current?.hidePopover(); input.current?.focus({ preventScroll: true });
  };
  const changeMonth = (step: number) => {
    const next = parseDate(month); next.setMonth(next.getMonth() + step);
    const nextMonth = dateValue(next);
    const nextFocus = nextMonth < min ? min : nextMonth > max ? max : nextMonth;
    setMonth(monthValue(nextFocus)); setFocusDay(nextFocus);
  };
  const navigateDay = (event: KeyboardEvent<HTMLButtonElement>, day: string) => {
    const next = parseDate(day);
    const shifts: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -(next.getDay() + 6) % 7, End: 6 - (next.getDay() + 6) % 7 };
    if (event.key in shifts) next.setDate(next.getDate() + shifts[event.key]);
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const date = next.getDate(); next.setDate(1); next.setMonth(next.getMonth() + (event.key === 'PageUp' ? -1 : 1));
      const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(); next.setDate(Math.min(date, last));
    } else return;
    event.preventDefault();
    const target = dateValue(next); const bounded = target < min ? min : target > max ? max : target;
    setFocusDay(bounded); setMonth(monthValue(bounded));
  };

  return <div className="reservation-date-picker" ref={field}>
    <input ref={input} id="reservation-day" type="date" name="day" required min={min} max={max} value={value}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      onChange={event => onChange(event.target.value)}
      onClick={event => { event.preventDefault(); prepareCalendar(); popup.current?.showPopover(); }}
      onKeyDown={event => { if (event.key === 'ArrowDown' && event.altKey) { event.preventDefault(); prepareCalendar(); popup.current?.showPopover(); } }} />
    <button type="button" className="reservation-date-toggle" popoverTarget={id} aria-label={t('chooseDate')} aria-expanded={open} onClick={prepareCalendar}>
      <CalendarDays size={20} aria-hidden="true" />
    </button>
    <div id={id} ref={popup} popover="auto" role="dialog" aria-label={t('chooseDate')} className="reservation-calendar"
      style={{ left: position.left, top: position.top }}
      onToggle={event => setOpen(event.newState === 'open')}>
      <div className="reservation-calendar-heading">
        <button type="button" disabled={month <= monthValue(min)} aria-label={t('previous')} onClick={() => changeMonth(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <strong id={`${id}-month`} aria-live="polite">{monthLabel}</strong>
        <button type="button" disabled={month >= monthValue(max)} aria-label={t('next')} onClick={() => changeMonth(1)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      <div className="reservation-calendar-weekdays" aria-hidden="true">{days.slice(0, 7).map(day => <span key={day}>{weekday.format(parseDate(day))}</span>)}</div>
      <div role="grid" aria-labelledby={`${id}-month`} className="reservation-calendar-grid">
        {Array.from({ length: 6 }, (_, week) => <div role="row" key={week}>{days.slice(week * 7, week * 7 + 7).map(day => <button
          key={day} type="button" role="gridcell" data-date={day} aria-label={fullDate.format(parseDate(day))}
          aria-selected={day === value} aria-current={day === min ? 'date' : undefined}
          disabled={day < min || day > max} tabIndex={day === focusDay ? 0 : -1}
          className={monthValue(day) !== month ? 'is-outside-month' : undefined}
          onKeyDown={event => navigateDay(event, day)} onClick={() => selectDay(day)}>{parseDate(day).getDate()}</button>)}</div>)}
      </div>
    </div>
  </div>;
}
