import { describe, expect, it } from 'vitest';
import { publicEventDate, upcomingPublicEvents } from './publicEvents';
import type { EventItemSettings } from '../types/siteSettings';

const event = (id: string, date: string, patch: Partial<EventItemSettings> = {}): EventItemSettings => ({id, date, title: id, kicker: 'DJ night', description: 'Music at Bonefree', startTime: '19:00', endTime: '23:00', enabled: true, imageUrl: '/assets/images/dj_adriano.jpg', ...patch});

describe('public event programme', () => {
  it('orders upcoming events without changing saved settings, excluding expired, hidden and invalid entries', () => {
    const events = [event('later', '2026-12-01'), event('expired', '2026-06-12'), event('hidden', '2026-11-13', {enabled: false}), event('next', '2026-11-14'), event('invalid date', '2026-02-30'), event('invalid time', '2026-11-14', {startTime: '29:00'})];
    expect(upcomingPublicEvents(events, new Date('2026-11-12T18:00:00Z')).map(e => e.id)).toEqual(['next', 'later']);
    expect(events[0].id).toBe('later');
    expect(upcomingPublicEvents([], new Date('2026-11-12T18:00:00Z'))).toEqual([]);
  });
  it('keeps overnight events until they end, including midnight and year rollover', () => {
    const events = [event('overnight', '2026-12-31', {endTime: '02:00'})];
    expect(upcomingPublicEvents(events, new Date('2027-01-01T01:59:00Z'))).toHaveLength(1);
    expect(upcomingPublicEvents(events, new Date('2027-01-01T02:00:00Z'))).toHaveLength(0);
    expect(upcomingPublicEvents([event('midnight', '2026-12-31', {endTime: '00:00'})], new Date('2026-12-31T23:59:00Z'))).toHaveLength(1);
  });
  it('uses Lisbon summer time for event expiry and includes the year in displayed dates', () => {
    const events = [event('summer', '2027-07-01')];
    expect(upcomingPublicEvents(events, new Date('2027-07-01T21:59:00Z'))).toHaveLength(1);
    expect(upcomingPublicEvents(events, new Date('2027-07-01T22:00:00Z'))).toHaveLength(0);
    expect(publicEventDate('2027-07-01', 'en-GB').full).toContain('2027');
  });
});
