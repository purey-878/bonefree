import { useState } from 'react';
import { ArrowUpRight, Clock3, Mail, MapPin, Phone, Route, Sun, Sunrise, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import Navbar from '../components/Navbar';
import { BUSINESS } from '../seo/business';

const mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(BUSINESS.fullAddress);
const mapEmbedUrl = 'https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d49878.87222597991!2d-9.2476054!3d38.615999!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd1ecbd167fb7389%3A0x4bfb3119d6e98f29!2sBone%20Free!5e0!3m2!1sen!2spt!4v1780922610537!5m2!1sen!2spt';

export default function Contact() {
  const { t } = useTranslation('storefront');
  const [mapEnabled, setMapEnabled] = useState(false);
  return <Page>
    <Navbar />
    <Hero className="contact-hero">
      <Doodles aria-hidden="true"><Sun /><Waves /><Sunrise /></Doodles>
      <HeroInner>
        <HeroCopy><Kicker><Sun size={20} aria-hidden="true" />{t('contact.location')}</Kicker><h1>{t('contact.heroTitle')}</h1><p>{t('contact.heroDescription')}</p><HeroActions><Action href={mapsUrl} target="_blank" rel="noopener noreferrer"><Route size={19} aria-hidden="true" />{t('contact.directions')}<ArrowUpRight size={18} aria-hidden="true" /></Action><HeroLink to="/reservations">{t('home.reserveTable')}<ArrowUpRight size={18} aria-hidden="true" /></HeroLink></HeroActions></HeroCopy>
        <HeroPhoto><img src="/assets/images/contact-us-image.jpg" alt={t('contact.restaurantAlt')} fetchPriority="high" /><figcaption><MapPin size={16} aria-hidden="true" />Costa da Caparica</figcaption><SunSeal aria-hidden="true"><Sun size={51} strokeWidth={1.6} /></SunSeal></HeroPhoto>
      </HeroInner>
    </Hero>

    <Content>
      <Details aria-label={t('contact.detailsLabel')}>
        <DetailCard><CardIcon><MapPin size={25} aria-hidden="true" /></CardIcon><h2>{t('contact.address')}</h2><a className="contact-value" href={mapsUrl} target="_blank" rel="noopener noreferrer"><span>{BUSINESS.address.streetAddress}</span><span>{BUSINESS.address.postalCode} {BUSINESS.address.addressLocality}</span><ArrowUpRight size={19} aria-hidden="true" /></a></DetailCard>
        <DetailCard><CardIcon><Clock3 size={25} aria-hidden="true" /></CardIcon><h2>{t('contact.hours')}</h2><p className="contact-value">{t('contact.hoursValue')}</p></DetailCard>
        <DetailCard><CardIcon><Phone size={25} aria-hidden="true" /></CardIcon><h2>{t('contact.phone')}</h2><a className="contact-value" href={`tel:${BUSINESS.telephone}`}>{BUSINESS.phoneDisplay}<ArrowUpRight size={19} aria-hidden="true" /></a></DetailCard>
        <DetailCard><CardIcon><Mail size={25} aria-hidden="true" /></CardIcon><h2>{t('contact.email')}</h2><a className="contact-value contact-email" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}<ArrowUpRight size={19} aria-hidden="true" /></a></DetailCard>
      </Details>

      <MapSection aria-labelledby="contact-directions-title">
        <DirectionsCopy><Kicker><MapPin size={18} aria-hidden="true" />{t('contact.location')}</Kicker><h2 id="contact-directions-title">{t('contact.directions')}</h2><address><strong>{BUSINESS.name}</strong><span>{BUSINESS.address.streetAddress}</span><span>{BUSINESS.address.postalCode} {BUSINESS.address.addressLocality}</span></address><Action href={mapsUrl} target="_blank" rel="noopener noreferrer">{t('contact.openMaps')}<ArrowUpRight size={18} aria-hidden="true" /></Action><Sun className="directions-sun" aria-hidden="true" /></DirectionsCopy>
        <MapFrame className="contact-map">
          {mapEnabled ? <iframe src={mapEmbedUrl} title={t('contact.mapTitle')} width="100%" height="100%" allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <MapPlaceholder><MapIcon aria-hidden="true"><MapPin size={39} /><Sun size={23} /></MapIcon><h3>{t('contact.mapTitle')}</h3><p>{t('privacy.mapNotice')}</p><LoadMap type="button" onClick={() => setMapEnabled(true)}>{t('privacy.loadMap')}<ArrowUpRight size={18} aria-hidden="true" /></LoadMap></MapPlaceholder>}
        </MapFrame>
      </MapSection>

      <Visit><VisitCopy><Kicker><Sunrise size={19} aria-hidden="true" />{t('contact.hungry')}</Kicker><h2>{t('contact.featureTitle')}</h2><Link to="/reservations">{t('home.reserveTable')}<ArrowUpRight size={19} aria-hidden="true" /></Link><Sun aria-hidden="true" className="visit-sun" /></VisitCopy><img src="/assets/images/banner-menu.jpeg" alt={t('contact.tableAlt')} loading="lazy" /></Visit>
    </Content>
  </Page>;
}

const Page = styled.main`
  --contact-ink: #44351d;
  --contact-muted: #74664e;
  --contact-gold: #f7ce54;
  overflow: clip;
  background: linear-gradient(180deg, #fffdf6, #fff8e8);
  color: var(--contact-ink);
  h1, h2, h3 { font-weight: var(--font-weight-heading, 900); letter-spacing: -.035em; }
  h2 { font-size: clamp(2rem, 3.5vw, 3.2rem); line-height: 1.12; }
  a:focus-visible, button:focus-visible { outline: 3px solid #9b6515; outline-offset: 5px; }
`;
const Hero = styled.section`
  position: relative;
  isolation: isolate;
  border-radius: 0 0 48px 48px;
  background: linear-gradient(180deg, rgba(91, 58, 13, .32), transparent 145px), radial-gradient(ellipse at 80% 5%, #fff0b5, transparent 60%), linear-gradient(135deg, #f9d25e, #ffdc81);
  @media (max-width: 640px) { border-radius: 0 0 30px 30px; }
`;
const HeroInner = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(35px, 6vw, 80px);
  align-items: center;
  width: min(1240px, calc(100% - 64px));
  margin: 0 auto;
  padding: 135px 0 85px;
  @media (max-width: 850px) { grid-template-columns: 1fr; gap: 48px; padding: 110px 0 65px; }
  @media (max-width: 640px) { width: calc(100% - 40px); }
`;
const HeroCopy = styled.div`
  h1 { color: var(--contact-ink); margin: 22px 0; font-size: clamp(3rem, 5.4vw, 5.2rem); line-height: 1.04; text-wrap: balance; }
  p { color: #64512d; max-width: 510px; line-height: 1.8; font-size: 1rem; margin: 0; }
  @media (max-width: 640px) { h1 { font-size: clamp(2.5rem, 10.6vw, 3.9rem); } p { font-size: .94rem; } }
`;
const Kicker = styled.span`display: inline-flex; align-items: center; gap: 9px; font-size: .78rem; font-weight: 700; line-height: 1.5; svg { flex-shrink: 0; }`;
const HeroActions = styled.div`display: flex; align-items: center; flex-wrap: wrap; gap: 22px; margin-top: 30px;`;
const Action = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 100%;
  padding: 15px 22px;
  border-radius: 18px;
  background: var(--contact-ink);
  color: #fff9e8;
  font-size: .86rem;
  font-weight: 800;
  text-decoration: none;
  svg { flex-shrink: 0; }
  &:hover { color: #fff9e8; background: #614a25; transform: translateY(-2px); }
`;
const HeroLink = styled(Link)`display: inline-flex; align-items: center; gap: 9px; padding-block: 12px; color: var(--contact-ink); font-weight: 700; font-size: .86rem; text-decoration: none; &:hover { color: var(--contact-ink); text-decoration: underline; }`;
const HeroPhoto = styled.figure`
  position: relative;
  margin: 0 10px;
  height: 370px;
  transform: rotate(2deg);
  > img { width: 100%; height: 100%; object-fit: cover; border-radius: 35px 35px 90px 35px; border: 5px solid #fff5d5; }
  figcaption { position: absolute; bottom: 25px; left: 25px; display: flex; align-items: center; gap: 9px; padding: 11px 15px; border-radius: 14px; background: #fff9e8; color: var(--contact-ink); font-size: .72rem; }
  @media (max-width: 640px) { height: 280px; margin-inline: 0; transform: rotate(1deg); }
`;
const SunSeal = styled.div`
  position: absolute;
  top: -25px;
  right: -15px;
  display: grid;
  place-items: center;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: #fff8df;
  color: #b77815;
  box-shadow: 0 7px 20px rgba(125, 82, 17, .1);
  transform: rotate(-10deg);
  @media (max-width: 640px) { width: 84px; height: 84px; right: 0; }
`;
const Doodles = styled.div`
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  svg { position: absolute; color: #a77112; opacity: .12; stroke-width: 1; width: 130px; height: 130px; }
  svg:nth-child(1) { left: -65px; bottom: -70px; width: 260px; height: 260px; }
  svg:nth-child(2) { top: 85px; left: 44%; transform: rotate(15deg); }
  svg:nth-child(3) { right: -10px; bottom: 20px; }
`;
const Content = styled.div`
  width: min(1200px, calc(100% - 64px));
  margin: 0 auto;
  padding: 65px 0 75px;
  @media (max-width: 640px) { width: calc(100% - 40px); padding: 45px 0 55px; }
`;
const Details = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  margin-bottom: 65px;
  @media (max-width: 1000px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 550px) { grid-template-columns: 1fr; gap: 16px; margin-bottom: 45px; }
`;
const DetailCard = styled.article`
  position: relative;
  min-width: 0;
  padding: 27px;
  border: 1px solid #eadfbd;
  border-radius: 27px;
  background: #fffefa;
  h2 { font-size: .84rem; margin: 23px 0 14px; color: var(--contact-muted); letter-spacing: 0; font-weight: 600; }
  .contact-value { white-space: pre-line; display: block; margin: 0; color: var(--contact-ink); font-size: 1.02rem; line-height: 1.65; font-weight: 700; text-decoration: none; overflow-wrap: anywhere; }
  .contact-value span { display: block; }
  .contact-value span + span { font-size: .83rem; font-weight: 400; margin-top: 4px; }
  a.contact-value:hover { color: #976014; text-decoration: underline; text-underline-offset: 4px; }
  .contact-value > svg { display: block; margin-top: 15px; color: #976014; }
  .contact-email { font-size: .91rem; }
  &:first-child { background: #fff4d0; }
`;
const CardIcon = styled.div`display: grid; place-items: center; width: 53px; height: 53px; border-radius: 18px; background: #ffedb4; color: #94651b;`;
const MapSection = styled.section`
  display: grid;
  grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr);
  gap: 24px;
  margin-bottom: 65px;
  @media (max-width: 800px) { grid-template-columns: 1fr; }
  @media (max-width: 640px) { margin-bottom: 45px; }
`;
const DirectionsCopy = styled.div`
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: clamp(28px, 4vw, 48px);
  border-radius: 30px;
  background: #fff0be;
  h2 { margin: 24px 0; color: var(--contact-ink); }
  address { font-style: normal; line-height: 1.85; color: var(--contact-muted); font-size: .92rem; margin: 0 0 28px; }
  address strong, address span { display: block; }
  address strong { color: var(--contact-ink); font-size: 1.1rem; margin-bottom: 6px; }
  .directions-sun { position: absolute; z-index: -1; right: -65px; bottom: -75px; width: 260px; height: 260px; color: #d49b31; opacity: .13; stroke-width: 1; }
`;
const MapFrame = styled.div`
  min-width: 0;
  min-height: 430px;
  border: 1px solid #eadfbd;
  border-radius: 30px;
  overflow: hidden;
  background: #fffdf5;
  iframe { display: block; min-height: 430px; height: 100%; border: 0; }
  @media (max-width: 640px) { min-height: 380px; iframe { min-height: 380px; } }
`;
const MapPlaceholder = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  height: 100%;
  min-height: inherit;
  padding: 35px 28px;
  text-align: center;
  h3 { color: var(--contact-ink); font-size: 1.3rem; line-height: 1.4; margin: 26px 0 13px; }
  p { color: var(--contact-muted); font-size: .85rem; max-width: 370px; line-height: 1.8; margin: 0 0 26px; }
`;
const MapIcon = styled.div`
  position: relative;
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  border-radius: 28px;
  background: #ffedb4;
  color: #94651b;
  transform: rotate(-7deg);
  > svg + svg { position: absolute; top: -11px; right: -14px; width: 37px; height: 37px; padding: 6px; border-radius: 50%; background: #fffaf0; }
`;
const LoadMap = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 14px 21px;
  border: 0;
  border-radius: 17px;
  background: var(--contact-ink);
  color: #fff9e8;
  font-size: .86rem;
  font-weight: 700;
  cursor: pointer;
  &:hover { background: #614a25; }
`;
const Visit = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
  overflow: hidden;
  border-radius: 32px;
  background: #f9d25e;
  > img { display: block; width: 100%; height: 100%; min-height: 320px; object-fit: cover; }
  @media (max-width: 750px) { grid-template-columns: 1fr; > img { height: 260px; min-height: 0; } }
`;
const VisitCopy = styled.div`
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: clamp(28px, 4.5vw, 55px);
  h2 { color: var(--contact-ink); font-size: clamp(2rem, 3.2vw, 3rem); margin: 20px 0 28px; }
  > a { display: inline-flex; align-items: center; gap: 16px; padding: 15px 22px; border-radius: 18px; background: var(--contact-ink); color: #fff9e8; text-decoration: none; font-size: .86rem; font-weight: 800; }
  > a:hover { background: #614a25; }
  .visit-sun { position: absolute; z-index: -1; right: -55px; bottom: -80px; width: 260px; height: 260px; color: #a77112; opacity: .12; stroke-width: 1; }
`;
