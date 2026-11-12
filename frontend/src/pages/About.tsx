import { ArrowUpRight, Heart, Leaf, MapPin, Sparkles, Users, UtensilsCrossed, Waves } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import Navbar from '../components/Navbar';

const values = [
  { name: 'plant', Icon: Leaf },
  { name: 'share', Icon: Users },
  { name: 'local', Icon: MapPin },
  { name: 'care', Icon: Heart },
] as const;

export default function About() {
  const { t } = useTranslation('storefront');
  return <Page>
    <Navbar />
    <Hero>
      <HeroDoodles aria-hidden="true"><Leaf /><Waves /><Sparkles /></HeroDoodles>
      <HeroInner>
        <HeroCopy>
          <Kicker><Leaf size={17} aria-hidden="true" />{t('about.kicker')}</Kicker>
          <h1>{t('about.heroTitle')}</h1>
          <p>{t('about.heroDescription')}</p>
          <Actions><Action to="/menu"><UtensilsCrossed size={18} aria-hidden="true" />{t('about.openMenu')}<ArrowUpRight size={18} aria-hidden="true" /></Action><TextLink to="/contact">{t('about.findUs')}<ArrowUpRight size={18} aria-hidden="true" /></TextLink></Actions>
        </HeroCopy>
        <HeroPhotos>
          <MainPhoto><img src="/assets/images/about-us-photo-1.webp" alt={t('about.heroAlt')} fetchPriority="high" /><figcaption><MapPin size={15} aria-hidden="true" />{t('about.location')}</figcaption></MainPhoto>
          <SmallPhoto><img src="/assets/images/about-image-2.jpg" alt={t('about.foodAlt')} /></SmallPhoto>
          <VeganSeal><Leaf size={28} aria-hidden="true" /><span>{t('productDetail.vegan')}</span></VeganSeal>
        </HeroPhotos>
      </HeroInner>
    </Hero>

    <Content>
      <Story aria-labelledby="about-story-title">
        <StoryPhoto><img src="/assets/images/about-us-3.jpg" alt={t('about.roomAlt')} loading="lazy" /></StoryPhoto>
        <StoryCopy><Kicker><Sparkles size={17} aria-hidden="true" />{t('about.storyLabel')}</Kicker><h2 id="about-story-title">{t('about.storyTitle')}</h2>{t('about.story').split('\n\n').map(paragraph => <p key={paragraph}>{paragraph}</p>)}</StoryCopy>
      </Story>

      <Mission aria-labelledby="about-mission-title">
        <MissionCopy><Heart size={30} aria-hidden="true" /><Kicker>{t('about.mission')}</Kicker><h2 id="about-mission-title">{t('about.missionText')}</h2><Leaf className="mission-leaf" aria-hidden="true" /></MissionCopy>
        <BarPhoto><img src="/assets/images/index-about-tap.webp" alt={t('about.barAlt')} loading="lazy" /></BarPhoto>
      </Mission>

      <Values aria-label={t('about.sectionLabel')}>
        {values.map(({ name, Icon }) => <Value key={name}><IconCircle><Icon size={25} aria-hidden="true" /></IconCircle><h3>{t(`about.values.${name}Title`)}</h3><p>{t(`about.values.${name}Text`)}</p></Value>)}
      </Values>

      <Facts aria-label={t('about.storyLabel')}>{['history', 'vegan', 'moments'].map(name => <div key={name}><h3>{t(`about.stats.${name}Title`)}</h3><p>{t(`about.stats.${name}Text`)}</p></div>)}</Facts>

      <Visit><div><Kicker><MapPin size={17} aria-hidden="true" />{t('about.location')}</Kicker><h2>{t('about.ctaTitle')}</h2></div><Action to="/contact">{t('about.visit')}<ArrowUpRight size={20} aria-hidden="true" /></Action><VisitDoodle aria-hidden="true"><Waves /></VisitDoodle></Visit>
    </Content>
  </Page>;
}

const Page = styled.main`
  overflow: clip;
  background: var(--background-body);
  color: var(--brand-ink);

  h1, h2, h3 { font-weight: var(--font-weight-heading, 900); letter-spacing: -.035em; }
  h2 { margin: 18px 0; font-size: clamp(2rem, 3.6vw, 3.4rem); line-height: 1.12; }
  p { line-height: 1.8; }
  a:focus-visible { outline: 3px solid var(--brand-accent); outline-offset: 5px; }
`;

const Hero = styled.section`
  position: relative;
  isolation: isolate;
  background: radial-gradient(ellipse at 85% 20%, rgba(123, 175, 75, .2), transparent 55%), #073f34;
  color: #fff;
  border-radius: 0 0 48px 48px;
  @media (max-width: 640px) { border-radius: 0 0 30px 30px; }
`;

const HeroInner = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: clamp(40px, 7vw, 90px);
  width: min(1240px, calc(100% - 64px));
  margin: 0 auto;
  padding: 145px 0 100px;
  @media (max-width: 850px) { grid-template-columns: 1fr; gap: 50px; padding: 120px 0 80px; }
  @media (max-width: 640px) { width: calc(100% - 40px); padding-top: 105px; }
`;

const HeroCopy = styled.div`
  h1 { margin: 25px 0; max-width: 650px; font-size: clamp(3.1rem, 5.4vw, 5.3rem); line-height: 1.04; color: #fff; text-wrap: balance; }
  p { margin: 0; max-width: 530px; color: #e2eee0; font-size: 1rem; }
  @media (max-width: 640px) { h1 { font-size: clamp(2.65rem, 10.8vw, 4rem); } p { font-size: .94rem; } }
`;

const Kicker = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: .78rem;
  font-weight: 700;
  line-height: 1.4;
  svg { flex-shrink: 0; }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 22px;
  margin-top: 32px;
`;

const Action = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 100%;
  min-height: 50px;
  padding: 14px 23px;
  border-radius: 18px;
  background: var(--brand-accent);
  color: #21351d;
  font-weight: 800;
  font-size: .88rem;
  text-decoration: none;
  transition: transform 180ms ease, box-shadow 180ms ease;
  svg { flex-shrink: 0; }
  &:hover { color: #21351d; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0, 0, 0, .12); }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const TextLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 12px 0;
  color: #fff;
  font-size: .88rem;
  font-weight: 700;
  text-decoration: none;
  &:hover { color: var(--brand-accent); }
`;

const HeroPhotos = styled.div`
  position: relative;
  padding: 0 15px 32px 30px;
  @media (max-width: 850px) { width: min(100%, 600px); justify-self: center; }
  @media (max-width: 640px) { padding: 0 5px 30px 15px; }
`;

const MainPhoto = styled.figure`
  position: relative;
  height: clamp(350px, 35vw, 470px);
  margin: 0;
  overflow: hidden;
  border-radius: 38px 38px 100px 38px;
  transform: rotate(2deg);
  background: #335c49;
  border: 5px solid rgba(255, 255, 255, .15);
  img { display: block; width: 100%; height: 100%; object-fit: cover; }
  figcaption { position: absolute; bottom: 20px; right: 30px; display: flex; align-items: center; gap: 7px; padding: 9px 13px; border-radius: 12px; background: rgba(7, 40, 29, .85); color: #fff; font-size: .66rem; }
  @media (max-width: 640px) { height: 330px; border-radius: 30px 30px 70px 30px; transform: rotate(1deg); figcaption { right: 18px; bottom: 18px; } }
`;

const SmallPhoto = styled.figure`
  position: absolute;
  bottom: 0;
  left: 0;
  width: 43%;
  height: 165px;
  margin: 0;
  border: 6px solid var(--brand-accent);
  border-radius: 26px;
  transform: rotate(-7deg);
  overflow: hidden;
  box-shadow: 0 12px 25px rgba(0, 0, 0, .18);
  img { width: 100%; height: 100%; object-fit: cover; }
  @media (max-width: 640px) { height: 125px; border-width: 4px; border-radius: 22px; }
`;

const VeganSeal = styled.div`
  position: absolute;
  top: -24px;
  right: -4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 106px;
  height: 106px;
  padding: 14px;
  border-radius: 50%;
  background: var(--brand-accent);
  color: #21351d;
  text-align: center;
  font-size: .72rem;
  font-weight: 800;
  transform: rotate(9deg);
  @media (max-width: 640px) { width: 90px; height: 90px; right: 0; font-size: .65rem; }
`;

const HeroDoodles = styled.div`
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  svg { position: absolute; width: 100px; height: 100px; color: var(--brand-main); opacity: .16; stroke-width: 1; }
  svg:nth-child(1) { left: -25px; bottom: 25px; transform: rotate(-25deg); width: 180px; height: 180px; }
  svg:nth-child(2) { top: 90px; left: 45%; transform: rotate(12deg); }
  svg:nth-child(3) { right: 15px; bottom: 40px; }
`;

const Content = styled.div`
  width: min(1200px, calc(100% - 64px));
  margin: 0 auto;
  padding: 95px 0 80px;
  @media (max-width: 640px) { width: calc(100% - 40px); padding: 60px 0; }
`;

const Story = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(35px, 7vw, 90px);
  align-items: center;
  margin-bottom: 85px;
  @media (max-width: 750px) { grid-template-columns: 1fr; gap: 38px; margin-bottom: 55px; }
`;

const StoryPhoto = styled.figure`
  position: relative;
  margin: 0;
  isolation: isolate;
  &::before { content: ''; position: absolute; inset: 12px -10px -12px 10px; border-radius: 30px; background: color-mix(in srgb, var(--brand-accent) 65%, var(--glass-bg-strong)); transform: rotate(-3deg); z-index: -1; }
  img { display: block; width: 100%; height: 390px; object-fit: cover; border-radius: 30px; }
  @media (max-width: 640px) { img { height: 290px; border-radius: 25px; } }
`;

const StoryCopy = styled.div`
  > span { color: var(--brand-secondary); }
  h2 { max-width: 540px; }
  p { margin: 0; color: var(--brand-muted); font-size: .98rem; }
  p + p { margin-top: 18px; }
`;

const Mission = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
  gap: 22px;
  margin-bottom: 28px;
  @media (max-width: 750px) { grid-template-columns: 1fr; }
`;

const MissionCopy = styled.div`
  position: relative;
  overflow: hidden;
  padding: clamp(30px, 4.5vw, 58px);
  border-radius: 30px;
  background: color-mix(in srgb, var(--brand-main) 14%, var(--glass-bg-strong));
  color: var(--brand-ink);
  > svg:first-child { display: block; margin-bottom: 23px; color: var(--brand-secondary); }
  > span { color: var(--brand-secondary); }
  h2 { position: relative; z-index: 1; font-size: clamp(2rem, 3.3vw, 3rem); max-width: 560px; margin-bottom: 0; }
  .mission-leaf { position: absolute; right: -20px; bottom: -25px; width: 175px; height: 175px; color: var(--brand-main); opacity: .14; transform: rotate(-25deg); stroke-width: 1; }
`;

const BarPhoto = styled.figure`
  min-height: 340px;
  position: relative;
  margin: 0;
  border-radius: 30px;
  overflow: hidden;
  img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  @media (max-width: 750px) { min-height: 280px; }
`;

const Values = styled.section`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
  margin-bottom: 70px;
  @media (max-width: 750px) { grid-template-columns: 1fr; gap: 16px; margin-bottom: 45px; }
`;

const Value = styled.article`
  padding: 30px;
  border: 1px solid var(--glass-border);
  border-radius: 26px;
  background: var(--glass-bg-strong);
  h3 { color: var(--brand-ink); font-size: 1.2rem; margin: 24px 0 13px; }
  p { margin: 0; color: var(--brand-muted); font-size: .9rem; }
`;

const IconCircle = styled.div`
  display: grid;
  place-items: center;
  width: 53px;
  height: 53px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--brand-accent) 35%, var(--glass-bg-strong));
  color: var(--brand-secondary);
`;

const Visit = styled.section`
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 30px;
  padding: clamp(28px, 4.5vw, 55px);
  border-radius: 32px;
  background: #073f34;
  color: #fff;
  h2 { max-width: 650px; color: #fff; font-size: clamp(2rem, 3.2vw, 3rem); margin-bottom: 0; }
  > a { flex-shrink: 0; }
  @media (max-width: 750px) { flex-direction: column; align-items: flex-start; }
`;

const VisitDoodle = styled.div`
  position: absolute;
  right: 20px;
  bottom: -50px;
  z-index: -1;
  color: var(--brand-main);
  opacity: .15;
  transform: rotate(-10deg);
  svg { width: 250px; height: 250px; stroke-width: 1; }
`;

const Facts = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 25px;
  padding: 0 0 55px;
  h3 { margin: 0 0 10px; font-size: 1.25rem; }
  p { margin: 0; color: var(--brand-muted); font-size: .9rem; }
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;
