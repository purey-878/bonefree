import { ArrowUpRight, CalendarDays, Heart, Leaf, Music2, Users, UtensilsCrossed, Waves } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { homeAction, homeCard, homeHeading, homeKicker } from './homeStyles';

const experiences = [{ name: 'events', Icon: CalendarDays }, { name: 'music', Icon: Music2 }, { name: 'flavours', Icon: UtensilsCrossed }, { name: 'community', Icon: Users }] as const;

export default function HomeStory() {
  const { t } = useTranslation('storefront');
  return <Section>
    <Story aria-labelledby="home-story-title">
      <div className="home-story-photo"><img src="/assets/images/about-us-photo-1.webp" alt={t('about.heroAlt')} loading="lazy" /></div>
      <div><span><Leaf size={14} aria-hidden="true" />{t('home.storyTitle')}</span><h2 id="home-story-title">{t('home.storySubtitle')}</h2><p>{t('home.storyText')}</p><Link to="/about">{t('home.storyLink')}<ArrowUpRight size={18} aria-hidden="true" /></Link></div>
    </Story>
    <Experiences>{experiences.map(({ name, Icon }) => <article key={name}><Icon size={24} aria-hidden="true" /><h3>{t(`home.experiences.${name}Title`)}</h3><p>{t(`home.experiences.${name}Text`)}</p></article>)}</Experiences>
    <Guests aria-labelledby="home-guests-title"><Waves className="guests-doodle" aria-hidden="true" /><Heart size={28} aria-hidden="true" /><h2 id="home-guests-title">{t('home.reviewsTitle')}</h2><p>{t('home.reviewsText')}</p></Guests>
  </Section>;
}

const Section = styled.div`
  width: min(1240px, calc(100% - 48px));
  margin: 0 auto;
  padding: 0 0 clamp(48px, 6vw, 80px);
  color: #294b3e;
  h2, h3 { font-weight: 850; letter-spacing: -.035em; }
  p { line-height: 1.7; color: #67715f; }
  @media (max-width: 640px) { width: calc(100% - 40px); }
`;
const Story = styled.section`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: clamp(28px, 5vw, 64px);
  .home-story-photo { ${homeCard} position: relative; padding: 12px 12px 20px; }
  .home-story-photo::before { content: ''; position: absolute; z-index: 1; width: 64px; height: 20px; top: -9px; left: calc(50% - 32px); background: #fdcd43bf; border-radius: 3px; transform: rotate(-5deg); }
  img { display: block; width: 100%; height: 360px; object-fit: cover; border-radius: 16px; }
  span { ${homeKicker} }
  h2 { ${homeHeading} margin: 16px 0; }
  p { font-size: .94rem; }
  a { ${homeAction} margin-top: 12px; background: var(--home-paper); }
  @media (max-width: 750px) { grid-template-columns: 1fr; img { height: 260px; } }
`;
const Experiences = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin: clamp(36px, 5vw, 64px) 0;
  article { ${homeCard} min-width: 0; padding: 24px; }
  article:nth-child(even) { background: #f1f4e8; border-radius: 24px 24px 8px 24px; }
  svg { width: 44px; height: 44px; padding: 11px; border-radius: 14px 14px 5px 14px; background: #e6efd7; color: #285442; transform: rotate(-5deg); }
  article:nth-child(even) svg { background: #ffe8a2; transform: rotate(5deg); }
  h3 { margin: 18px 0 10px; font-size: 1.08rem; line-height: 1.3; }
  p { margin: 0; font-size: .85rem; }
  @media (max-width: 1000px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 480px) { grid-template-columns: 1fr; }
`;
const Guests = styled.section`
  ${homeCard}
  position: relative;
  overflow: hidden;
  padding: clamp(26px, 5vw, 48px);
  background: #fff1c6;
  > svg:not(.guests-doodle) { width: 44px; height: 44px; padding: 11px; border-radius: 14px 14px 5px 14px; background: #fffaf0; color: #b16e4b; transform: rotate(-5deg); }
  .guests-doodle { position: absolute; top: 14px; right: 14px; width: 120px; height: 120px; opacity: .13; color: #7baf4b; stroke-width: 1; pointer-events: none; }
  h2 { ${homeHeading} position: relative; margin: 18px 0; font-size: clamp(1.8rem, 3vw, 2.6rem); }
  p { position: relative; max-width: 900px; margin: 0; font-size: .94rem; }
`;
