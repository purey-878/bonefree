import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { CalendarDays, Clock, MapPin, Music2 } from "lucide-react"
import styled from "styled-components"

import FloatingMusicIcons from "../components/FloatingMusicIcons"
import Navbar from "../components/Navbar"
import { getPublicEventsSettings } from "../services/siteSettingsService"
import type { EventItemSettings } from "../types/siteSettings"
import { defaultEventsSettings } from "../utils/eventSettings"

const galleryImages = [
  { src: "/assets/images/about-us-3.jpg", alt: "Ambiente de eventos na sala da PREY" },
  { src: "/assets/images/about-img-1.webp", alt: "Mesa vegan para partilhar na PREY" },
  { src: "/assets/images/about-img-2.webp", alt: "Detalhe noturno do restaurante PREY" },
]

function formatEventDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    weekday: "short",
  }).format(date)
}

function nextEnabledEvent(events: EventItemSettings[]) {
  const enabled = events.filter((event) => event.enabled)
  return enabled.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? defaultEventsSettings.events[0]
}

function EventMeta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <EventMetaPill>
      {icon}
      {children}
    </EventMetaPill>
  )
}

export default function Events() {
  const [eventsSettings, setEventsSettings] = useState(defaultEventsSettings)

  useEffect(() => {
    let cancelled = false
    getPublicEventsSettings()
      .then((settings) => {
        if (!cancelled) setEventsSettings(settings)
      })
      .catch(() => {
        if (!cancelled) setEventsSettings(defaultEventsSettings)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const visibleEvents = useMemo(
    () => eventsSettings.events.filter((event) => event.enabled),
    [eventsSettings.events],
  )
  const featuredEvent = nextEnabledEvent(eventsSettings.events)
  const secondaryEvents = visibleEvents.filter((event) => event.id !== featuredEvent.id)

  return (
    <EventsPage>
      <Navbar />
      <FloatingMusicIcons />
      <EventsShell>
        <EventsBento>
          <HeroTile>
            <HeroImage src={featuredEvent.image_url} alt={featuredEvent.title} />
            <HeroScrim />
            <HeroContent>
              <EventKicker>{featuredEvent.kicker}</EventKicker>
              <h1>Eventos na PREY</h1>
              <p>Noites de DJ, pratos vegetais, cocktails e energia costeira até tarde na Costa da Caparica.</p>
              <HeroMeta>
                <EventMeta icon={<CalendarDays size={16} />}>{formatEventDate(featuredEvent.date)}</EventMeta>
                <EventMeta icon={<Clock size={16} />}>{featuredEvent.start_time} - {featuredEvent.end_time}</EventMeta>
              </HeroMeta>
            </HeroContent>
          </HeroTile>

          <EventCard>
            <TileIcon><Music2 size={19} /></TileIcon>
            <span>A seguir</span>
            <h2>{featuredEvent.title}</h2>
            <p>{featuredEvent.description}</p>
          </EventCard>

          <ImageTile className="image-tall">
            <img src="/assets/images/dj_khalil.jpg" alt="DJ Khalil a atuar na PREY" />
          </ImageTile>

          <DateTile>
            <span>{formatEventDate(featuredEvent.date)}</span>
            <strong>{featuredEvent.start_time}</strong>
            <small>portas e cozinha no mesmo ritmo</small>
          </DateTile>

          <LocationTile>
            <MapPin size={22} />
            <span>Costa da Caparica</span>
            <strong>R. Eng. Henrique Mendia 28A</strong>
          </LocationTile>

          {secondaryEvents.map((event) => (
            <SmallEventTile key={event.id}>
              <img src={event.image_url} alt={event.title} />
              <div>
                <span>{event.kicker}</span>
                <h3>{event.title}</h3>
                <p>{formatEventDate(event.date)} · {event.start_time} - {event.end_time}</p>
              </div>
            </SmallEventTile>
          ))}

          {galleryImages.map((image, index) => (
            <ImageTile key={image.src} className={index === 0 ? "image-wide" : ""}>
              <img src={image.src} alt={image.alt} />
            </ImageTile>
          ))}

          <BottomCtaTile>
            <div>
              <span>Acompanhe a próxima noite</span>
              <h2>Música, comida, cocktails, repetir.</h2>
            </div>
            <Link to="/contact">Encontrar o restaurante</Link>
          </BottomCtaTile>
        </EventsBento>
      </EventsShell>
    </EventsPage>
  )
}

const EventsPage = styled.main`
  position: relative;
  overflow-x: clip;
  min-height: 100vh;
  background: #edeade;
  color: #1a1a14;
`

const EventsShell = styled.section`
  position: relative;
  z-index: 1;
  width: min(100%, 1280px);
  margin: 0 auto;
  padding: clamp(5rem, 8vw, 7rem) 1.5rem clamp(3rem, 6vw, 5rem);

  @media (max-width: 720px) {
    padding-inline: 1rem;
  }
`

const EventsBento = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(170px, auto);
  gap: 10px;

  @media (max-width: 1000px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const BentoTile = styled.article`
  min-width: 0;
  overflow: hidden;
  border-radius: 14px;
`

const HeroTile = styled(BentoTile)`
  position: relative;
  grid-column: span 3;
  grid-row: span 2;
  min-height: 470px;
  background: #1a1a14;
  color: #edeade;

  @media (max-width: 1000px) {
    grid-column: span 2;
  }

  @media (max-width: 640px) {
    grid-column: auto;
  }
`

const HeroImage = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
`

const HeroScrim = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(26, 26, 20, 0.46);
`

const HeroContent = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: flex-end;
  padding: clamp(1.25rem, 4vw, 2.5rem);

  h1 {
    max-width: 760px;
    margin: 0.55rem 0 0;
    color: #edeade;
    font-size: clamp(3rem, 8vw, 7.2rem);
    line-height: 0.9;
  }

  p {
    max-width: 600px;
    margin: 1rem 0 0;
    color: rgba(237, 234, 222, 0.8);
    font-size: clamp(1rem, 2vw, 1.22rem);
    line-height: 1.55;
  }
`

const EventKicker = styled.span`
  width: fit-content;
  border: 1px solid rgba(237, 234, 222, 0.28);
  border-radius: 999px;
  background: rgba(237, 234, 222, 0.1);
  color: #edeade;
  padding: 0.48rem 0.8rem;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`

const HeroMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1.3rem;
`

const EventMetaPill = styled.span`
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 0.45rem;
  border-radius: 999px;
  background: #7baf4b;
  color: #1a1a14;
  padding: 0 0.82rem;
  font-size: 0.86rem;
  font-weight: 900;
`

const EventCard = styled(BentoTile)`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #f5f2e8;
  padding: 1.1rem;

  span {
    color: #7baf4b;
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0.7rem 0 0;
    color: #1a1a14;
    font-size: clamp(1.65rem, 3vw, 2.5rem);
    line-height: 0.95;
  }

  p {
    margin: 0.9rem 0 0;
    color: rgba(26, 26, 20, 0.68);
    line-height: 1.55;
  }
`

const TileIcon = styled.div`
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 999px;
  background: #7baf4b;
  color: #1a1a14;
`

const ImageTile = styled(BentoTile)`
  min-height: 220px;
  background: #1a1a14;

  &.image-tall {
    grid-row: span 2;
  }

  &.image-wide {
    grid-column: span 2;
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    min-height: inherit;
    object-fit: cover;
  }

  @media (max-width: 640px) {
    &.image-wide {
      grid-column: auto;
    }
  }
`

const DateTile = styled(BentoTile)`
  display: grid;
  align-content: space-between;
  background: #7baf4b;
  color: #1a1a14;
  padding: 1rem;

  span,
  small {
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  strong {
    font-size: clamp(3rem, 6vw, 5rem);
    line-height: 0.9;
  }
`

const LocationTile = styled(BentoTile)`
  display: grid;
  align-content: end;
  gap: 0.45rem;
  background: #1a1a14;
  color: #edeade;
  padding: 1rem;

  svg {
    color: #7baf4b;
  }

  span {
    font-size: clamp(1.45rem, 3vw, 2.4rem);
    font-weight: 900;
    line-height: 1;
  }

  strong {
    color: rgba(237, 234, 222, 0.72);
    font-size: 0.9rem;
  }
`

const SmallEventTile = styled(BentoTile)`
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  background: #f5f2e8;
  color: #1a1a14;

  img {
    width: 100%;
    height: 100%;
    min-height: 170px;
    object-fit: cover;
  }

  div {
    display: grid;
    align-content: center;
    gap: 0.45rem;
    padding: 1rem;
  }

  span {
    color: #7baf4b;
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: 1.25rem;
  }

  p {
    color: rgba(26, 26, 20, 0.65);
    font-size: 0.9rem;
  }
`

const BottomCtaTile = styled(BentoTile)`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: #1a1a14;
  color: #edeade;
  padding: clamp(1.2rem, 3vw, 2rem);

  span {
    color: #7baf4b;
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0.35rem 0 0;
    color: #edeade;
    font-size: clamp(1.8rem, 4vw, 3.6rem);
    line-height: 0.98;
  }

  a {
    display: inline-flex;
    min-height: 46px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: #7baf4b;
    color: #1a1a14;
    padding: 0 1rem;
    font-weight: 900;
    text-decoration: none;
  }

  @media (max-width: 700px) {
    align-items: stretch;
    flex-direction: column;
  }
`
