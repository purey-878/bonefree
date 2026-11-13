import { useState } from 'react';
import { usePublicEvents } from '../hooks/usePublicEvents';
import { ArrowUpRight, CalendarDays, Clock3, Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import ProductLabel from './ui/ProductLabel';
import { publicEventDate } from '../utils/publicEvents';
import { resolvedLocale } from '../i18n';
import { applyApiImageFallback, resolveProductImageUrl } from '../utils/imageFallback';

export default function HomeUpcomingEvents() {
  const { t } = useTranslation('storefront');
  const { events: upcomingEvents, status, retry } = usePublicEvents();
  const [visibleCount, setVisibleCount] = useState(2);
  const events = upcomingEvents.slice(0, visibleCount);
  if (status === 'ready' && upcomingEvents.length === 0) return null;
  return <Section id="home-events" className="home-upcoming" aria-labelledby="home-events-title">
    <Heading><div><span><Music2 size={18} aria-hidden="true" />{t('events.location')}</span><h2 id="home-events-title">{t('events.upcoming')}</h2></div><Link to="/events">{t('events.viewEvents')}<ArrowUpRight size={19} aria-hidden="true" /></Link></Heading>
    {status === 'loading' ? <State className="home-event-state" role="status"><CalendarDays size={28} aria-hidden="true" /><p>{t('events.loading')}</p></State> : status === 'error' ? <State className="home-event-state" role="alert"><p>{t('events.loadError')}</p><button type="button" onClick={retry}>{t('actions.retry', {ns: 'common'})}</button></State> : events.length ? <Grid $single={events.length === 1}>{events.map((event, index) => {
      const date = publicEventDate(event.date, resolvedLocale());
      return <Card className="home-event-card" key={event.id}>
        <Photo><img src={resolveProductImageUrl(event.imageUrl, '/assets/images/about-us-3.jpg')} alt={event.title} loading="lazy" onError={e => applyApiImageFallback(e.currentTarget, '/assets/images/about-us-3.jpg')} /><time dateTime={event.date}><strong>{date.day}</strong><span>{date.month}</span></time>{index === 0 && <div className="next-label"><ProductLabel>{t('events.next')}</ProductLabel></div>}</Photo>
        <Copy><span className="event-kicker">{event.kicker}</span><h3>{event.title}</h3><p>{event.description}</p><time dateTime={event.date} className="event-date"><CalendarDays size={16} aria-hidden="true" />{date.full}</time><span className="event-time"><Clock3 size={16} aria-hidden="true" />{event.startTime}–{event.endTime}{event.endTime <= event.startTime && ` · ${t('events.nextDay')}`}</span><div className="event-actions"><Link to="/events">{t('events.viewEvents')}<ArrowUpRight size={18} aria-hidden="true" /></Link><Link to="/reservations">{t('home.reserveTable')}</Link></div></Copy>
      </Card>;
    })}</Grid> : null}
    {status === 'ready' && upcomingEvents.length > visibleCount && <MoreButton type="button" onClick={() => setVisibleCount(count => count + 2)}>{t('events.showMore', { count: upcomingEvents.length - visibleCount })}<ArrowUpRight size={18} aria-hidden="true" /></MoreButton>}
  </Section>;
}

const Section = styled.section`
  width: min(1240px, calc(100% - 64px));
  margin: 0 auto;
  padding: 75px 0 20px;
  scroll-margin-top: 90px;
  a:focus-visible, button:focus-visible { outline: 3px solid var(--brand-secondary); outline-offset: 5px; }
  @media (max-width: 640px) { width: calc(100% - 40px); padding-top: 48px; }
`;
const Heading = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 25px;
  margin-bottom: 30px;
  > div > span { display: flex; align-items: center; gap: 9px; color: var(--brand-secondary); font-size: .76rem; font-weight: 700; }
  h2 { margin: 16px 0 0; color: var(--brand-ink); font-size: clamp(2rem, 3.8vw, 3.5rem); line-height: 1.1; letter-spacing: -.035em; font-weight: 900; }
  > a { display: inline-flex; align-items: center; gap: 12px; flex-shrink: 0; padding: 12px 0; color: var(--brand-secondary); font-size: .83rem; font-weight: 700; text-decoration: none; }
  @media (max-width: 640px) { flex-direction: column; align-items: flex-start; gap: 12px; }
`;
const Grid = styled.div<{ $single: boolean }>`
  display: grid;
  grid-template-columns: ${({$single}) => $single ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))'};
  gap: 26px;
  > article { display: ${({$single}) => $single ? 'grid' : 'block'}; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); }
  @media (max-width: 750px) { grid-template-columns: 1fr; > article { display: block; } }
`;
const Card = styled.article`
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  border-radius: 30px;
  background: var(--glass-bg-strong);
`;
const Photo = styled.div`
  position: relative;
  padding: 18px;
  background: color-mix(in srgb, var(--brand-main) 9%, var(--glass-bg-strong));
  > img { display: block; width: 100%; height: 290px; object-fit: contain; border-radius: 20px; }
  > time { position: absolute; top: 22px; left: 22px; display: flex; align-items: center; flex-direction: column; gap: 5px; width: 70px; padding: 13px 10px; border-radius: 18px; background: var(--brand-accent); color: #21351d; transform: rotate(-5deg); }
  > time strong { font-size: 1.85rem; font-weight: 900; line-height: 1; }
  > time span { font-size: .65rem; font-weight: 800; text-transform: uppercase; }
  .next-label { position: absolute; bottom: 22px; left: 0; }
  @media (max-width: 640px) { > img { height: 260px; } }
`;
const Copy = styled.div`
  padding: 28px;
  .event-kicker { color: var(--brand-secondary); font-size: .72rem; font-weight: 700; }
  h3 { margin: 12px 0 15px; color: var(--brand-ink); font-size: clamp(1.7rem, 2.5vw, 2.3rem); font-weight: 900; line-height: 1.15; letter-spacing: -.03em; overflow-wrap: anywhere; }
  > p { margin: 0 0 22px; color: var(--brand-muted); font-size: .88rem; line-height: 1.8; }
  .event-date, .event-time { display: flex; align-items: center; gap: 9px; color: var(--brand-muted); font-size: .78rem; line-height: 1.6; margin-top: 10px; }
  svg { flex-shrink: 0; }
  .event-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; padding-top: 23px; margin-top: 22px; border-top: 1px solid var(--glass-border); }
  .event-actions a { display: inline-flex; align-items: center; gap: 12px; color: var(--brand-secondary); text-decoration: none; font-size: .78rem; font-weight: 700; }
`;
const State = styled.div`
  display: flex; align-items: center; justify-content: center; flex-direction: column; min-height: 230px; padding: 30px; border: 1px solid var(--glass-border); border-radius: 28px; background: var(--glass-bg-strong); text-align: center; color: var(--brand-muted);
  p { margin: 20px 0; }
  button { padding: 12px 20px; border: 0; border-radius: 15px; background: var(--brand-accent); color: #21351d; font-weight: 700; cursor: pointer; }
`;

const MoreButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 48px;
  margin: 28px auto 0;
  padding: 12px 22px;
  border: 1px solid var(--glass-border);
  border-radius: 16px 16px 16px 5px;
  background: var(--brand-accent);
  color: var(--brand-ink);
  font: inherit;
  font-size: .88rem;
  font-weight: 600;
  &:focus-visible { outline: 3px solid var(--brand-secondary); outline-offset: 4px; }
`;
