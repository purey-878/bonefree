import type { EventItemSettings } from '../types/siteSettings';

const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

export function upcomingPublicEvents(events: EventItemSettings[], now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? '';
  const current = `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
  return events.filter(event => {
    if (!event.enabled || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || !validTime(event.startTime) || !validTime(event.endTime)) return false;
    const endDate = new Date(`${event.date}T12:00:00Z`);
    if (!Number.isFinite(endDate.getTime()) || endDate.toISOString().slice(0, 10) !== event.date) return false;
    if (event.endTime <= event.startTime) endDate.setUTCDate(endDate.getUTCDate() + 1);
    return `${endDate.toISOString().slice(0, 10)}T${event.endTime}` > current;
  }).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
}

export function publicEventDate(date: string, locale: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'Europe/Lisbon' }).format(value);
  return { day: format({day: '2-digit'}), month: format({month: 'short'}), full: format({weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}) };
}
