import { ReservationPromotionBadge } from './ReservationPromotionNotice';
import { useReservationPromotion } from '../hooks/useReservationPromotion';
import { useState } from 'react';
import { usePublicEvents } from '../hooks/usePublicEvents';
import { ArrowUpRight, CalendarDays, Clock3, Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import ProductLabel from './ui/ProductLabel';
import { homeAction, homeCard, homeHeading, homeKicker } from './homeStyles';
import { publicEventDate } from '../utils/publicEvents';
import { resolvedLocale } from '../i18n';
import EventPhoto from './EventPhoto';
import EventLinks from './EventLinks';

export default function HomeUpcomingEvents() {
  const { t } = useTranslation('storefront');
  const promotion = useReservationPromotion();
  const { events: upcomingEvents, status, retry } = usePublicEvents();
  const [visibleCount, setVisibleCount] = useState(2);
  const events = upcomingEvents.slice(0, visibleCount);
  if (status === 'ready' && upcomingEvents.length === 0) return null;
  return <Section id="home-events" className="home-upcoming" aria-labelledby="home-events-title">
    <Heading><div><span><Music2 size={18} aria-hidden="true" />{t('events.location')}</span><h2 id="home-events-title">{t('events.upcoming')}</h2></div><Link to="/events">{t('events.viewEvents')}<ArrowUpRight size={19} aria-hidden="true" /></Link></Heading>
    {status === 'loading' ? <State className="home-event-state" role="status"><CalendarDays size={28} aria-hidden="true" /><p>{t('events.loading')}</p></State> : status === 'error' ? <State className="home-event-state" role="alert"><p>{t('events.loadError')}</p><button type="button" onClick={retry}>{t('actions.retry', {ns: 'common'})}</button></State> : events.length ? <Grid $single={events.length === 1}>{events.map((event, index) => {
      const date = publicEventDate(event.date, resolvedLocale());
      return <Card className="home-event-card" key={event.id}>
        <Photo><EventPhoto event={event} />{index === 0 && <div className="next-label"><ProductLabel>{t('events.next')}</ProductLabel></div>}</Photo>
        <Copy>
          <Music2 className="event-copy-doodle" size={72} aria-hidden="true" />
          {event.kicker && <span className="event-kicker">{event.kicker}</span>}
          <h3>{event.title}</h3>
          <div className="event-meta">
            <time dateTime={event.date} className="event-date"><CalendarDays size={16} aria-hidden="true" />{date.full}</time>
            <span className="event-time"><Clock3 size={16} aria-hidden="true" />{event.startTime}–{event.endTime}{event.endTime <= event.startTime && ` · ${t('events.nextDay')}`}</span>
          </div>
          {event.description && <p>{event.description}</p>}
          <div className="event-actions">
            <Link className="reservation-reserve-button" to={promotion ? `/reservations?date=${promotion.next_date}` : "/reservations"}>{t('home.reserveTable')}<ReservationPromotionBadge promotion={promotion} compact /><ArrowUpRight size={17} aria-hidden="true" /></Link>
            <EventLinks event={event} />
          </div>
        </Copy>
      </Card>;
    })}</Grid> : null}
    {status === 'ready' && upcomingEvents.length > visibleCount && <MoreButton type="button" onClick={() => setVisibleCount(count => count + 2)}>{t('events.showMore', { count: upcomingEvents.length - visibleCount })}<ArrowUpRight size={18} aria-hidden="true" /></MoreButton>}
  </Section>;
}

const Section = styled.section`
  width: min(1240px, calc(100% - 48px));
  margin: 0 auto;
  padding: clamp(48px, 6vw, 80px) 0 0;
  scroll-margin-top: 90px;
  a:focus-visible, button:focus-visible { outline: 3px solid var(--brand-secondary); outline-offset: 5px; }
  @media (max-width: 640px) { width: calc(100% - 40px); padding-top: 48px; }
`;
const Heading = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 25px;
  margin-bottom: 24px;
  > div > span { ${homeKicker} }
  h2 { ${homeHeading} margin: 12px 0 0; font-weight: 750; }
  > a { ${homeAction} flex-shrink: 0; background: var(--home-paper); }

  @media (max-width: 640px) { flex-direction: column; align-items: flex-start; gap: 12px; }
`;
const Grid = styled.div<{ $single: boolean }>`
  display: grid;
  grid-template-columns: ${({$single}) => $single ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))'};
  gap: 24px;
  width: 100%;
  max-width: ${({$single}) => $single ? '1040px' : 'none'};
  margin-inline: auto;
  --event-photo-height: ${({$single}) => $single ? '340px' : '260px'};
  > article {
    display: ${({$single}) => $single ? 'grid' : 'flex'};
    flex-direction: column;
    grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr);
  }
  @media (max-width: 750px) {
    grid-template-columns: 1fr;
    --event-photo-height: 280px;
    > article { display: flex; }
  }
`;
const Card = styled.article`
  min-width: 0;
  overflow: hidden;
  ${homeCard}
  background: #fffaf0;
  border-color: #cbd8b9;
  &:nth-child(even) { --event-photo-tint: #fff0c4; }
`;
const Photo = styled.div`
  position: relative;
  min-width: 0;
  .event-photo-playful {
    height: var(--event-photo-height);
    min-height: 0;
    padding: 24px 32px;
    background: var(--event-photo-tint, #e6efd7);
    border-bottom: 1px dashed #b5c69c;
  }
  .event-photo-print {
    width: fit-content;
    max-width: 100%;
    height: 100%;
    padding: 8px 8px 14px;
    border-radius: 18px 18px 18px 6px;
    box-shadow: 0 4px 0 #294b3e26;
  }
  .event-photo-print > img {
    width: 100%;
    height: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 12px;
  }
  .event-photo-date { right: 16px; top: 16px; min-width: 56px; padding: 10px 8px; }
  .event-photo-date strong { font-size: 1.5rem; }
  .next-label { position: absolute; z-index: 3; bottom: 12px; left: 0; }
`;
const Copy = styled.div`
  position: relative;
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(22px, 3vw, 36px);
  .event-copy-doodle { position: absolute; right: 20px; top: 20px; color: #7baf4b; opacity: .12; transform: rotate(15deg); pointer-events: none; }
  .event-kicker { ${homeKicker} max-width: 100%; overflow-wrap: anywhere; background: #ffe39a; transform: rotate(-2deg); }
  h3 { position: relative; margin: 12px 0 16px; color: #294b3e; font-size: clamp(1.65rem, 2.6vw, 2.3rem); font-weight: 750; line-height: 1.15; letter-spacing: -.015em; overflow-wrap: anywhere; }
  > p { width: 100%; margin: 18px 0 0; color: #64705b; font-size: .87rem; line-height: 1.7; white-space: pre-line; overflow-wrap: anywhere; }
  .event-meta { display: flex; flex-wrap: wrap; gap: 8px; }
  .event-date, .event-time { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; padding: 8px 10px; border-radius: 11px 11px 4px 11px; background: #e6efd7; color: #375744; font-size: .72rem; font-weight: 650; line-height: 1.5; }
  .event-time { background: #fff0c4; }
  svg { flex-shrink: 0; }
  .event-actions { display: flex; align-items: center; flex-wrap: wrap; width: 100%; gap: 12px; padding-top: 18px; margin-top: 20px; border-top: 1px dashed #d0d9c2; }
  .event-actions > a { ${homeAction} font-size: .75rem; }
  .event-useful-links { margin: 0; gap: 10px; }
  .event-useful-links > a { min-height: 46px; padding: 11px 15px; border-radius: 13px 13px 13px 4px; background: #edf2e4; border-color: #d0d9c2; color: #375744; font-size: .75rem; }
  .event-useful-links > a:hover { background: #e0ebd2; }
  @media (max-width: 480px) { padding: 22px; }
`;
const State = styled.div`
  ${homeCard}
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-height: 220px;
  padding: 28px;
  text-align: center;
  color: var(--brand-muted);
  p { margin: 20px 0; }
  button { ${homeAction} }
`;

const MoreButton = styled.button`
  ${homeAction}
  display: flex;
  margin: 28px auto 0;
`;
