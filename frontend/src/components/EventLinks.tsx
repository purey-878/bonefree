import { ArrowUpRight, Globe } from 'lucide-react';
import type { EventItemSettings } from '../types/siteSettings';
import { validEventLink } from '../utils/publicEvents';
import './EventPresentation.css';

export default function EventLinks({ event }: { event: EventItemSettings }) {
  const instagram = validEventLink(event.instagramUrl);
  const website = validEventLink(event.websiteUrl);
  if (!instagram && !website) return null;
  return <div className="event-useful-links">
    {instagram && <a href={instagram} target="_blank" rel="noopener noreferrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="18" cy="6" r="1" fill="currentColor" stroke="none" /></svg>Instagram<ArrowUpRight size={14} aria-hidden="true" /></a>}
    {website && <a href={website} target="_blank" rel="noopener noreferrer"><Globe size={16} aria-hidden="true" />Website<ArrowUpRight size={14} aria-hidden="true" /></a>}
  </div>;
}
