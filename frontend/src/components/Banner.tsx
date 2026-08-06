import React from 'react';
import Navbar from './Navbar';
import { ASSETS } from '../constants/assets';


const Banner: React.FC = () => {
  return (
    <>
      <Navbar />
      <section className="banner">
        <div className="banner-content">
          <img src={ASSETS.images.hero.stamp} alt="Vegan stamp" className="vegan-stamp" />
          <h1>Plant-based flavor for every table</h1>
          <p>Fresh vegan dishes served with a glassy, modern interface.</p>
          <a href="#menu" className="btn btn-custom-glass">View Menu</a>
        </div>
      </section>
    </>
  );
};

export default Banner;
