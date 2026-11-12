import { useEffect, useState } from 'react';
import { publicRequestCache } from '../api/requestCache';
import { getPublicEventsSettings } from '../services/siteSettingsService';
import type { EventItemSettings } from '../types/siteSettings';
import { upcomingPublicEvents } from '../utils/publicEvents';

/** Refresh published changes and recheck expiry while a visitor keeps the page open. */
export function usePublicEvents() {
  const [savedEvents, setSavedEvents] = useState<EventItemSettings[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let active = true;
    let loaded = false;
    let inFlight = false;
    const refresh = async (fresh = false) => {
      setNow(new Date());
      if (fresh) publicRequestCache.invalidate('events');
      if (inFlight) return;
      inFlight = true;
      try {
        const settings = await getPublicEventsSettings();
        if (active) { loaded = true; setSavedEvents(settings.events); setStatus('ready'); }
      } catch {
        if (active && !loaded) setStatus('error');
      } finally { inFlight = false; }
    };
    const onFocus = () => { void refresh(true); };
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(true); };
    const onInvalidated = (event: Event) => { if ((event as CustomEvent<string>).detail === 'events') void refresh(true); };
    const onStorage = (event: StorageEvent) => { if (event.key === 'bonefree_events_updated') void refresh(true); };
    void refresh();
    const timer = window.setInterval(() => {
      setNow(new Date());
      if (document.visibilityState === 'visible') void refresh();
    }, 30_000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    window.addEventListener('publicDataInvalidated', onInvalidated);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('publicDataInvalidated', onInvalidated);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [attempt]);
  const retry = () => { setStatus('loading'); setAttempt(value => value + 1); };
  return { events: upcomingPublicEvents(savedEvents, now), status, retry };
}
