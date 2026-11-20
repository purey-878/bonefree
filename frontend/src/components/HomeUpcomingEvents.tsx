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
        <Copy>{event.kicker && <span className="event-kicker">{event.kicker}</span>}<h3>{event.title}</h3><p>{event.description}</p><time dateTime={event.date} className="event-date"><CalendarDays size={16} aria-hidden="true" />{date.full}</time><span className="event-time"><Clock3 size={16} aria-hidden="true" />{event.startTime}–{event.endTime}{event.endTime <= event.startTime && ` · ${t('events.nextDay')}`}</span><EventLinks event={event} /><div className="event-actions"><Link to="/events">{t('events.viewEvents')}<ArrowUpRight size={18} aria-hidden="true" /></Link><Link className="reservation-reserve-button" to={promotion ? `/reservations?date=${promotion.next_date}` : "/reservations"}>{t('home.reserveTable')}<ReservationPromotionBadge promotion={promotion} compact /></Link></div></Copy>
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
  margin-bottom: 30px;
  > div > span { ${homeKicker} }
  h2 { ${homeHeading} margin: 14px 0 0; }
  > a { ${homeAction} flex-shrink: 0; background: var(--home-paper); }

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
  ${homeCard}
`;
const Photo = styled.div`
  position: relative;
  .event-photo-playful { background: #edf2e4; }
  .event-photo-print { border-radius: 18px 18px 18px 6px; box-shadow: 0 4px 0 #7baf4b33; }
  .event-photo-print > img { border-radius: 12px; }
  .next-label { position: absolute; z-index: 3; bottom: 12px; left: 0; }
`;
const Copy = styled.div`
  padding: 28px;
  .event-kicker { ${homeKicker} }
  h3 { margin: 12px 0 15px; color: var(--brand-ink); font-size: clamp(1.7rem, 2.5vw, 2.3rem); font-weight: 900; line-height: 1.15; letter-spacing: -.03em; overflow-wrap: anywhere; }
  > p { margin: 0 0 22px; color: var(--brand-muted); font-size: .88rem; line-height: 1.8; }
  .event-date, .event-time { display: flex; align-items: center; gap: 9px; color: var(--brand-muted); font-size: .78rem; line-height: 1.6; margin-top: 10px; }
  svg { flex-shrink: 0; }
  .event-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; padding-top: 20px; margin-top: 20px; border-top: 1px dashed var(--home-line); }
  .event-actions a { ${homeAction} font-size: .75rem; }
  .event-actions a:last-child { background: var(--home-paper); border-radius: 15px 15px 5px 15px; }
  .event-useful-links > a { border-radius: 13px 13px 13px 4px; background: #edf2e4; border-color: var(--home-line); }
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
