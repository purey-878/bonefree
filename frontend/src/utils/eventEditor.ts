import type { EventItemSettings, EventsSettings } from '../types/siteSettings';
import { upcomingPublicEvents } from './publicEvents';

export const eventImageFallback = '/assets/images/about-us-3.jpg';
export type EventIssue = 'title' | 'date' | 'time' | 'image' | 'length' | 'duplicate';

export function eventIssues(event: EventItemSettings): EventIssue[] {
  if (!event.enabled) return [];
  const issues: EventIssue[] = [];
  if (!event.title.trim()) issues.push('title');
  const date = new Date(`${event.date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== event.date) issues.push('date');
  if (![event.startTime, event.endTime].every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) issues.push('time');
  const image = event.imageUrl.trim();
  if (image && !(/^\/(?!\/)/.test(image) || /^https?:\/\/[^\s]+$/i.test(image))) issues.push('image');
  if (event.title.length > 100 || event.kicker.length > 80 || event.description.length > 400 || event.imageUrl.length > 300) issues.push('length');
  return issues;
}

export function eventsHaveIssues(settings: EventsSettings) {
  return new Set(settings.events.map(event => event.id)).size !== settings.events.length || settings.events.some(event => eventIssues(event).length > 0);
}

export function eventEditorStatus(event: EventItemSettings, now = new Date()): 'visible' | 'expired' | 'hidden' | 'incomplete' {
  if (!event.enabled) return 'hidden';
  if (eventIssues(event).length) return 'incomplete';
  return upcomingPublicEvents([event], now).length ? 'visible' : 'expired';
}

export function createEventDraft(now = new Date()): EventItemSettings {
  const localDate = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
  const tomorrow = new Date(`${localDate}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return { id: crypto.randomUUID(), title: '', kicker: '', description: '', date: tomorrow.toISOString().slice(0, 10), startTime: '19:00', endTime: '23:00', imageUrl: eventImageFallback, enabled: true };
}
