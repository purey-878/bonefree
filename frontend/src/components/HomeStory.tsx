import { ArrowUpRight, CalendarDays, Heart, Music2, Users, UtensilsCrossed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

const experiences = [{ name: 'events', Icon: CalendarDays }, { name: 'music', Icon: Music2 }, { name: 'flavours', Icon: UtensilsCrossed }, { name: 'community', Icon: Users }] as const;

export default function HomeStory() {
  const { t } = useTranslation('storefront');
  return <Section>
    <Story aria-labelledby="home-story-title">
      <img src="/assets/images/about-us-photo-1.webp" alt={t('about.heroAlt')} loading="lazy" />
      <div><span>{t('home.storyTitle')}</span><h2 id="home-story-title">{t('home.storySubtitle')}</h2><p>{t('home.storyText')}</p><Link to="/about">{t('home.storyLink')}<ArrowUpRight size={18} aria-hidden="true" /></Link></div>
    </Story>
    <Experiences>{experiences.map(({ name, Icon }) => <article key={name}><Icon size={24} aria-hidden="true" /><h3>{t(`home.experiences.${name}Title`)}</h3><p>{t(`home.experiences.${name}Text`)}</p></article>)}</Experiences>
    <Guests aria-labelledby="home-guests-title"><Heart size={28} aria-hidden="true" /><h2 id="home-guests-title">{t('home.reviewsTitle')}</h2><p>{t('home.reviewsText')}</p></Guests>
  </Section>;
}

const Section = styled.div`
  width: min(1240px, calc(100% - 64px));
  margin: 0 auto;
  padding: 70px 0;
  color: var(--brand-ink);
  h2, h3 { font-weight: 900; letter-spacing: -.035em; }
  p { line-height: 1.8; color: var(--brand-muted); }
  @media (max-width: 640px) { width: calc(100% - 40px); padding: 45px 0; }
`;
const Story = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: clamp(30px, 6vw, 80px);
  > img { width: 100%; height: 400px; object-fit: cover; border-radius: 32px; }
  span { font-size: .8rem; font-weight: 700; color: var(--brand-secondary); }
  h2 { margin: 18px 0; font-size: clamp(2rem, 3.5vw, 3rem); line-height: 1.12; }
  p { font-size: .96rem; }
  a { display: inline-flex; align-items: center; gap: 12px; padding: 12px 0; font-weight: 700; color: var(--brand-secondary); text-decoration: none; }
  a:focus-visible { outline: 3px solid var(--brand-secondary); outline-offset: 4px; }
  @media (max-width: 750px) { grid-template-columns: 1fr; > img { height: 280px; } }
`;
const Experiences = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  margin: 45px 0;
  article { padding: 26px; border: 1px solid var(--glass-border); border-radius: 24px; background: var(--glass-bg-strong); }
  svg { color: var(--brand-secondary); }
  h3 { margin: 20px 0 12px; font-size: 1.12rem; }
  p { margin: 0; font-size: .88rem; }
  @media (max-width: 1000px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 480px) { grid-template-columns: 1fr; }
`;
const Guests = styled.section`
  padding: clamp(28px, 5vw, 55px);
  border-radius: 30px;
  background: color-mix(in srgb, var(--brand-accent) 18%, var(--glass-bg-strong));
  > svg { color: var(--brand-secondary); }
  h2 { margin: 20px 0; font-size: clamp(1.8rem, 3vw, 2.6rem); line-height: 1.2; }
  p { max-width: 900px; margin: 0; font-size: .96rem; }
`;
