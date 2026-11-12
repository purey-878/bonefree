import WeekendEvents from '../components/WeekendEvents';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUpRight, CalendarDays, Clock3, MapPin, Music2, Shell, Sun, Waves } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import Navbar from '../components/Navbar';
import ProductLabel from '../components/ui/ProductLabel';
import { getPublicEventsSettings } from '../services/siteSettingsService';
import type { EventItemSettings } from '../types/siteSettings';
import { resolvedLocale } from '../i18n';
import { publicEventDate, upcomingPublicEvents } from '../utils/publicEvents';
import { applyApiImageFallback, resolveProductImageUrl } from '../utils/imageFallback';

export default function Events() {
  const { t } = useTranslation('storefront');
  const locale = resolvedLocale();
  const [savedEvents, setSavedEvents] = useState<EventItemSettings[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let active = true;
    getPublicEventsSettings().then(settings => {
      if (active) { setSavedEvents(settings.events); setStatus('ready'); }
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const events = upcomingPublicEvents(savedEvents, now);

  return <Page>
    <Navbar />
    <Hero className="events-hero">
      <Doodles aria-hidden="true"><Shell /><Waves /><Sun /></Doodles>
      <HeroInner>
        <HeroCopy><Kicker><Music2 size={18} aria-hidden="true" />BONEFREE</Kicker><h1>{t('events.heroTitle')}</h1><p>{t('events.heroDescription')}</p><HeroAction href="#event-list">{t('events.viewEvents')}<ArrowDown size={18} aria-hidden="true" /></HeroAction></HeroCopy>
        <HeroPhoto><img src="/assets/images/about-us-3.jpg" alt={t('events.galleryAlt1')} fetchPriority="high" /><figcaption><MapPin size={16} aria-hidden="true" />{t('events.location')}</figcaption><MusicSeal aria-hidden="true"><Music2 size={37} /></MusicSeal></HeroPhoto>
      </HeroInner>
    </Hero>

    <Content>
      <WeekendEvents />
      <Schedule id="event-list" aria-labelledby="event-list-title">
        <SectionHeading><div><Kicker><CalendarDays size={18} aria-hidden="true" />{t('events.follow')}</Kicker><h2 id="event-list-title">{t('events.upcoming')}</h2></div><p>{t('events.localTime')}</p></SectionHeading>
        {status === 'loading' ? <State className="event-state" role="status"><CalendarDays size={32} aria-hidden="true" /><p>{t('events.loading')}</p></State> : status === 'error' ? <State className="event-state" role="alert"><Music2 size={32} aria-hidden="true" /><p>{t('events.loadError')}</p><Retry type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>{t('actions.retry', {ns: 'common'})}</Retry></State> : events.length ? <EventList>{events.map((event, index) => {
          const date = publicEventDate(event.date, locale);
          return <EventCard className="event-card" $featured={index === 0} key={event.id} aria-labelledby={`event-title-${event.id}`}>
            <EventImage><img src={resolveProductImageUrl(event.imageUrl, '/assets/images/about-us-3.jpg')} alt={event.title} loading="lazy" onError={e => applyApiImageFallback(e.currentTarget, '/assets/images/about-us-3.jpg')} /><DateBadge dateTime={event.date}><strong>{date.day}</strong><span>{date.month}</span></DateBadge></EventImage>
            <EventCopy>
              {index === 0 && <ProductLabel>{t('events.next')}</ProductLabel>}
              {event.kicker && <Kicker className="event-kicker">{event.kicker}</Kicker>}
              <h3 id={`event-title-${event.id}`}>{event.title}</h3>
              {event.description && <p className="event-description">{event.description}</p>}
              <EventFacts>
                <div><dt><CalendarDays size={19} aria-hidden="true" />{t('events.dateLabel')}</dt><dd><time dateTime={event.date}>{date.full}</time></dd></div>
                <div><dt><Clock3 size={19} aria-hidden="true" />{t('events.timeLabel')}</dt><dd>{event.startTime}–{event.endTime}{event.endTime <= event.startTime && <small> · {t('events.nextDay')}</small>}</dd></div>
                <div><dt><MapPin size={19} aria-hidden="true" />{t('events.locationLabel')}</dt><dd>BONEFREE · {t('events.location')}<span>R. Eng. Henrique Mendia 28A</span></dd></div>
              </EventFacts>
              <CardActions><Action to="/reservations">{t('home.reserveTable')}<ArrowUpRight size={18} aria-hidden="true" /></Action><Directions to="/contact">{t('events.findRestaurant')}<ArrowUpRight size={17} aria-hidden="true" /></Directions></CardActions>
            </EventCopy>
          </EventCard>;
        })}</EventList> : <State className="event-empty"><IconTile><Music2 size={32} aria-hidden="true" /></IconTile><h3>{t('events.emptyTitle')}</h3><p>{t('events.emptyText')}</p><Action to="/menu">{t('home.openMenu')}<ArrowUpRight size={18} aria-hidden="true" /></Action></State>}
      </Schedule>

      <Atmosphere aria-label={t('events.ctaTitle')}>
        {[
          {src: '/assets/images/about-us-photo-1.webp', alt: 'events.galleryAlt1'},
          {src: '/assets/images/about-image-2.jpg', alt: 'events.galleryAlt2'},
          {src: '/assets/images/about-img-2.webp', alt: 'events.galleryAlt3'},
        ].map(photo => <figure key={photo.src}><img src={photo.src} alt={t(photo.alt)} loading="lazy" /></figure>)}
      </Atmosphere>
      <Visit><div><Kicker><MapPin size={17} aria-hidden="true" />{t('events.location')}</Kicker><h2>{t('events.ctaTitle')}</h2></div><Action to="/contact">{t('events.findRestaurant')}<ArrowUpRight size={20} aria-hidden="true" /></Action><Waves className="visit-waves" aria-hidden="true" /></Visit>
    </Content>
  </Page>;
}

const Page = styled.main`
  --brand-main: #59bfc4;
  --brand-secondary: #12677d;
  --brand-accent: #f7d689;
  --brand-ink: #153e50;
  --brand-muted: #55717a;
  --glass-border: #ccdee1;
  --glass-bg-strong: #fffefa;
  overflow: clip;
  background: radial-gradient(ellipse at 100% 35%, #e5f3f3 0, transparent 55%), linear-gradient(180deg, #f1f8f7, #faf4e8);
  color: var(--brand-ink);
  h1, h2, h3 { font-weight: var(--font-weight-heading, 900); letter-spacing: -.035em; }
  h2 { font-size: clamp(2rem, 3.6vw, 3.4rem); line-height: 1.12; }
  a:focus-visible, button:focus-visible { outline: 3px solid var(--brand-accent); outline-offset: 5px; }
`;
const Hero = styled.section`
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-radius: 0 0 48px 48px;
  background: radial-gradient(ellipse at 85% 15%, rgba(108, 221, 219, .28), transparent 60%), linear-gradient(135deg, #0b3d56, #116b7b);
  color: #fff;
  &::after { content: ''; position: absolute; z-index: -1; bottom: -95px; left: -10%; width: 120%; height: 150px; border-radius: 50%; background: rgba(164, 231, 228, .13); transform: rotate(-3deg); pointer-events: none; }
  @media (max-width: 640px) { border-radius: 0 0 30px 30px; }
`;
const HeroInner = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: clamp(35px, 7vw, 90px);
  width: min(1240px, calc(100% - 64px));
  margin: 0 auto;
  padding: 135px 0 85px;
  @media (max-width: 850px) { grid-template-columns: 1fr; gap: 45px; padding: 110px 0 65px; }
  @media (max-width: 640px) { width: calc(100% - 40px); }
`;
const HeroCopy = styled.div`
  h1 { margin: 22px 0; font-size: clamp(3rem, 5.5vw, 5.3rem); line-height: 1.04; color: #fff; overflow-wrap: anywhere; }
  p { max-width: 510px; margin: 0 0 30px; color: #deeff2; font-size: 1rem; line-height: 1.8; }
  @media (max-width: 640px) { h1 { font-size: clamp(2.6rem, 10.8vw, 4rem); } p { font-size: .94rem; } }
`;
const Kicker = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: .78rem;
  line-height: 1.5;
  font-weight: 700;
  svg { flex-shrink: 0; }
`;
const HeroAction = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 20px;
  padding: 15px 23px;
  border-radius: 18px;
  background: var(--brand-accent);
  color: var(--brand-ink);
  font-size: .88rem;
  font-weight: 800;
  text-decoration: none;
  &:hover { color: var(--brand-ink); transform: translateY(-2px); }
`;
const HeroPhoto = styled.figure`
  position: relative;
  margin: 0 10px;
  height: 365px;
  transform: rotate(2deg);
  > img { width: 100%; height: 100%; object-fit: cover; border-radius: 36px 36px 85px 36px; border: 5px solid rgba(255,255,255,.15); }
  figcaption { position: absolute; bottom: 24px; left: 25px; display: flex; align-items: center; gap: 9px; padding: 10px 15px; border-radius: 14px; color: #fff; background: rgba(9, 49, 69, .85); font-size: .75rem; }
  @media (max-width: 640px) { height: 280px; margin-inline: 0; transform: rotate(1deg); }
`;
const MusicSeal = styled.div`
  position: absolute;
  right: -16px;
  top: -25px;
  display: grid;
  place-items: center;
  width: 95px;
  height: 95px;
  border-radius: 50%;
  background: var(--brand-accent);
  color: var(--brand-ink);
  transform: rotate(-12deg);
  @media (max-width: 640px) { width: 78px; height: 78px; right: 0; }
`;
const Doodles = styled.div`
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  svg { position: absolute; width: 130px; height: 130px; color: #a4e7e4; opacity: .23; stroke-width: 1; }
  svg:nth-child(1) { bottom: -10px; left: -30px; transform: rotate(-20deg); }
  svg:nth-child(2) { top: 85px; left: 45%; transform: rotate(12deg); }
  svg:nth-child(3) { bottom: 25px; right: 0; color: var(--brand-accent); }
`;
const Content = styled.div`
  width: min(1200px, calc(100% - 64px));
  margin: 0 auto;
  padding: 75px 0;
  @media (max-width: 640px) { width: calc(100% - 40px); padding: 50px 0; }
`;
const Schedule = styled.section`scroll-margin-top: 95px;`;
const SectionHeading = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 25px;
  margin-bottom: 32px;
  h2 { margin: 16px 0 0; }
  span { color: var(--brand-secondary); }
  > p { max-width: 220px; margin: 0; color: var(--brand-muted); font-size: .75rem; line-height: 1.7; }
  @media (max-width: 640px) { flex-direction: column; align-items: flex-start; gap: 16px; > p { max-width: none; } }
`;
const EventList = styled.div`display: grid; gap: 30px;`;
const EventCard = styled.article<{ $featured: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
  border: 1px solid var(--glass-border);
  border-radius: 32px;
  overflow: hidden;
  background: ${({$featured}) => $featured ? 'color-mix(in srgb, var(--brand-main) 8%, var(--glass-bg-strong))' : 'var(--glass-bg-strong)'};
  @media (max-width: 750px) { grid-template-columns: 1fr; border-radius: 26px; }
`;
const EventImage = styled.div`
  position: relative;
  min-height: 420px;
  padding: 20px;
  background: color-mix(in srgb, var(--brand-main) 10%, var(--glass-bg-strong));
  > img { display: block; width: 100%; height: 100%; max-height: 620px; object-fit: contain; border-radius: 22px; }
  @media (max-width: 750px) { min-height: 0; > img { height: 340px; } }
  @media (max-width: 380px) { padding: 14px; > img { height: 290px; } }
`;
const DateBadge = styled.time`
  position: absolute;
  top: 25px;
  left: 25px;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 78px;
  min-height: 86px;
  padding: 10px;
  border-radius: 19px;
  background: var(--brand-accent);
  color: var(--brand-ink);
  transform: rotate(-5deg);
  box-shadow: 0 6px 15px rgba(23,33,29,.12);
  strong { font-size: 2rem; line-height: 1; font-weight: 900; }
  span { font-size: .7rem; font-weight: 800; text-transform: uppercase; }
`;
const EventCopy = styled.div`
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: clamp(26px, 4vw, 48px);
  > .event-kicker { margin-top: 18px; color: var(--brand-secondary); }
  h3 { margin: 14px 0 18px; color: var(--brand-ink); font-size: clamp(2rem, 3.2vw, 3rem); line-height: 1.12; overflow-wrap: anywhere; }
  .event-description { color: var(--brand-muted); font-size: .93rem; line-height: 1.8; margin: 0 0 25px; white-space: pre-line; }
`;
const EventFacts = styled.dl`
  width: 100%;
  margin: 0 0 28px;
  display: grid;
  gap: 18px;
  > div { display: grid; grid-template-columns: 95px minmax(0, 1fr); gap: 15px; }
  dt { display: flex; align-items: flex-start; gap: 9px; font-size: .76rem; font-weight: 600; color: var(--brand-muted); }
  dt svg { color: var(--brand-secondary); flex-shrink: 0; }
  dd { margin: 0; color: var(--brand-ink); font-size: .84rem; font-weight: 600; line-height: 1.6; }
  dd span { display: block; color: var(--brand-muted); font-size: .76rem; font-weight: 400; margin-top: 4px; }
  small { color: var(--brand-muted); font-weight: 400; }
  @media (max-width: 380px) { > div { grid-template-columns: 1fr; gap: 5px; } }
`;
const CardActions = styled.div`display: flex; align-items: center; flex-wrap: wrap; gap: 16px;`;
const Action = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 100%;
  padding: 15px 23px;
  border-radius: 18px;
  background: var(--brand-accent);
  color: var(--brand-ink);
  font-size: .88rem;
  font-weight: 800;
  text-decoration: none;
  svg { flex-shrink: 0; }
  &:hover { color: var(--brand-ink); transform: translateY(-2px); }
`;
const Directions = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding-block: 10px;
  color: var(--brand-secondary);
  font-size: .8rem;
  font-weight: 700;
  text-decoration: none;
  &:hover { text-decoration: underline; color: var(--brand-secondary); }
`;
const State = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  min-height: 260px;
  padding: 45px 25px;
  border: 1px solid var(--glass-border);
  border-radius: 30px;
  background: var(--glass-bg-strong);
  text-align: center;
  > svg { color: var(--brand-secondary); }
  h3 { margin: 25px 0 14px; color: var(--brand-ink); font-size: 1.7rem; }
  p { color: var(--brand-muted); max-width: 500px; font-size: .95rem; line-height: 1.8; margin: 18px 0 24px; }
`;
const IconTile = styled.div`display: grid; place-items: center; width: 70px; height: 70px; border-radius: 23px; background: color-mix(in srgb, var(--brand-accent) 40%, var(--glass-bg-strong)); color: var(--brand-secondary);`;
const Retry = styled.button`border: 0; padding: 13px 22px; border-radius: 16px; background: var(--brand-accent); color: var(--brand-ink); font-weight: 700; cursor: pointer;`;
const Atmosphere = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  margin: 70px 0 45px;
  figure { margin: 0; height: 260px; overflow: hidden; border-radius: 28px; }
  img { display: block; width: 100%; height: 100%; object-fit: cover; }
  figure:nth-child(2) { transform: rotate(-3deg); }
  @media (max-width: 640px) { gap: 12px; margin: 45px 0 30px; figure { height: 160px; border-radius: 18px; } }
`;
const Visit = styled.section`
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 30px;
  padding: clamp(28px, 4.5vw, 55px);
  border-radius: 32px;
  background: radial-gradient(ellipse at 95% 0, rgba(108, 221, 219, .2), transparent 65%), linear-gradient(135deg, #0b3d56, #116b7b);
  color: #fff;
  h2 { color: #fff; max-width: 650px; margin: 18px 0 0; font-size: clamp(2rem, 3.2vw, 3rem); }
  > a { flex-shrink: 0; }
  .visit-waves { position: absolute; z-index: -1; right: 20px; bottom: -50px; width: 250px; height: 250px; color: var(--brand-main); opacity: .15; stroke-width: 1; transform: rotate(-10deg); }
  @media (max-width: 750px) { flex-direction: column; align-items: flex-start; }
`;
