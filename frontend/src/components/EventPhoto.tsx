import { Music2, Sparkles } from 'lucide-react';
import type { EventItemSettings } from '../types/siteSettings';
import { resolvedLocale } from '../i18n';
import { publicEventDate } from '../utils/publicEvents';
import { applyApiImageFallback, resolveProductImageUrl } from '../utils/imageFallback';
import './EventPresentation.css';

export default function EventPhoto({ event }: { event: EventItemSettings }) {
  const date = publicEventDate(event.date, resolvedLocale());
  return <div className="event-photo-playful">
    <Music2 className="event-photo-doodle" aria-hidden="true" /><Sparkles className="event-photo-sparkle" aria-hidden="true" />
    <div className="event-photo-print"><img src={resolveProductImageUrl(event.imageUrl, '/assets/images/about-us-3.jpg')} alt={event.title} loading="lazy" onError={e => applyApiImageFallback(e.currentTarget, '/assets/images/about-us-3.jpg')} /></div>
    <time className="event-photo-date" dateTime={event.date}><strong>{date.day}</strong><span>{date.month}</span></time>
  </div>;
}
