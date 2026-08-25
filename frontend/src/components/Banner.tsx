import React from 'react';
import Navbar from './Navbar';
import { ASSETS } from '../constants/assets';
import { useTranslation } from 'react-i18next';


const Banner: React.FC = () => {
  const { t } = useTranslation('storefront');
  return (
    <>
      <Navbar />
      <section className="banner">
        <div className="banner-content">
          <img src={ASSETS.images.hero.stamp} alt={t('banner.stampAlt')} className="vegan-stamp" />
          <h1>{t('banner.title')}</h1>
          <p>{t('banner.description')}</p>
          <a href="#menu" className="btn btn-custom-glass">{t('banner.menu')}</a>
        </div>
      </section>
    </>
  );
};

export default Banner;
