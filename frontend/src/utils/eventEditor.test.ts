import { describe, expect, it } from 'vitest';
import { createEventDraft, eventEditorStatus, eventIssues, eventsHaveIssues } from './eventEditor';

describe('event editor', () => {
  it('starts tomorrow in Lisbon, generates independent ids and leaves publication incomplete until named', () => {
    const event = createEventDraft(new Date('2027-07-01T23:30:00Z'));
    expect(event.date).toBe('2027-07-03');
    expect(event.id.length).toBeLessThanOrEqual(40);
    expect(createEventDraft().id).not.toBe(event.id);
    expect(eventIssues(event)).toContain('title');
  });
  it('validates visible event dates, hours, image schemes and field lengths', () => {
    const event = { ...createEventDraft(), title: 'DJ night', date: '2026-02-30', startTime: '25:00', imageUrl: 'javascript:alert(1)' };
    expect(eventIssues(event)).toEqual(['date', 'time', 'image']);
    expect(eventIssues({ ...event, enabled: false })).toEqual([]);
    expect(eventIssues({ ...createEventDraft(), title: 'x'.repeat(101) })).toContain('length');
    expect(eventIssues({ ...createEventDraft(), title: 'DJ night', imageUrl: 'https://example.com/poster.jpg' })).toEqual([]);
  });
  it('keeps expired events in admin while showing their public status, including overnight finishes', () => {
    const event = { ...createEventDraft(), title: 'DJ night', date: '2026-12-31', startTime: '20:00', endTime: '02:00' };
    expect(eventEditorStatus(event, new Date('2027-01-01T01:59:00Z'))).toBe('visible');
    expect(eventEditorStatus(event, new Date('2027-01-01T02:00:00Z'))).toBe('expired');
    expect(eventEditorStatus({ ...event, enabled: false })).toBe('hidden');
    expect(eventEditorStatus({ ...event, title: '' })).toBe('incomplete');
  });
  it('supports many events and rejects duplicate identifiers before saving', () => {
    const events = Array.from({ length: 15 }, (_, index) => ({ ...createEventDraft(), title: `Event ${index}` }));
    expect(eventsHaveIssues({events})).toBe(false);
    expect(eventsHaveIssues({events: [...events, events[0]]})).toBe(true);
  });
});
