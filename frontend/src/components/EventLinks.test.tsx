import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EventLinks from './EventLinks';
import type { EventItemSettings } from '../types/siteSettings';
const event: EventItemSettings = { id: 'night', title: 'Music night', kicker: '', description: '', date: '2030-06-20', startTime: '18:00', endTime: '23:00', imageUrl: '', enabled: true };
const render = (links: Partial<EventItemSettings>) => renderToStaticMarkup(<EventLinks event={{ ...event, ...links }} />);
describe('optional event links', () => {
  it('renders no empty links or container for legacy events or empty fields', () => {
    expect(render({})).toBe('');
    expect(render({ instagramUrl: '  ', websiteUrl: '' })).toBe('');
  });
  it('shows only the populated links with safe external navigation', () => {
    const html = render({ instagramUrl: 'https://www.instagram.com/b0nefree/' });
    expect(html).toContain('Instagram');
    expect(html).not.toContain('Website');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(render({ websiteUrl: 'https://example.com/event' })).toContain('Website');
  });
  it('never turns unsafe or malformed persisted values into clickable links', () => {
    for (const value of ['javascript:alert(1)', '//example.com', 'https://user:password@example.com', 'https://', 'https://example.com/a b']) {
      expect(render({ websiteUrl: value })).toBe('');
    }
  });
});
