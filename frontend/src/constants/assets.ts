// src/constants/assets.ts
// Centralized asset management for images and other static assets
// All paths are relative to src/assets/images

// Type definitions for better TypeScript support
type MenuImages = {
  acai: string;
  burrito: string;
};

type IconImages = {
  hamburgerMenu: string;
  glutenFree: string;
};

type HeroImages = {
  stamp: string;
  burgerGirl: string;
  heroBanner: string;
};

type BackgroundImages = {
  menu: string;
  heroBanner: string;
  aboutUs: string;
  contactForm: string;
  reservation: string;
};

type AboutImages = {
  image1: string;
  image1WebP: string;
  image2: string;
  image2WebP: string;
  photo1: string;
  photo1WebP: string;
  rightImage: string;
  aboutImage2: string;
  aboutImage3: string;
  indexAboutTap: string;
  indexAboutTapWebP: string;
  indexAboutUsLogo: string;
  indexAboutUsLogoWebP: string;
};

type BannerImages = {
  burger: string;
  menu: string;
  indexHeroBanner: string;
  indexHeroBannerWebP: string;
  indexMenuBackground: string;
  indexMenuBackgroundWebP: string;
};

type LogoImages = {
  bonefree: string;
  bonefreeWebP: string;
};

type EventImages = {
  djAdriano: string;
  djKhalil: string;
};

type CounterImages = {
  background: string;
};

type TestImages = {
  test1: string;
  test2: string;
  test3: string;
  test4: string;
};

type AssetsType = {
  images: {
    navigation: {
      hamburger: string;
    };
    menu: MenuImages;
    icons: IconImages;
    hero: HeroImages;
    backgrounds: BackgroundImages;
    about: AboutImages;
    banners: BannerImages;
    logos: LogoImages;
    events: EventImages;
    counter: CounterImages;
    test: TestImages;
  };
};

// Main ASSETS constant with all image paths organized by category
export const ASSETS: AssetsType = {
  images: {
    // Navigation-related images
    navigation: {
      hamburger: '/assets/images/hamburger-menu.webp',
    },

    // Menu item images
    menu: {
      acai: '/assets/images/acai.avif',
      burrito: '/assets/images/burrito.avif',
    },

    // Icon images
    icons: {
      hamburgerMenu: '/assets/images/hamburger-menu.png',
      glutenFree: '/assets/images/gluten_free.png',
    },

    // Hero section images
    hero: {
      stamp: '/assets/images/bonefree-logo.webp',
      burgerGirl: '/assets/images/burger-girl.webp',
      heroBanner: '/assets/images/index-hero-banner.webp',
    },

    // Background images
    backgrounds: {
      menu: '/assets/images/index-menu-background.webp',
      heroBanner: '/assets/images/index-hero-banner.webp',
      aboutUs: '/assets/images/about-us-background.webp',
      contactForm: '/assets/images/contact-form-background.webp',
      reservation: '/assets/images/reservation-background.webp',
    },

    // About page images
    about: {
      image1: '/assets/images/about-img-1.jpg',
      image1WebP: '/assets/images/about-img-1.webp',
      image2: '/assets/images/about-img-2.jpeg',
      image2WebP: '/assets/images/about-img-2.webp',
      photo1: '/assets/images/about-us-photo-1.jpg',
      photo1WebP: '/assets/images/about-us-photo-1.webp',
      rightImage: '/assets/images/about-us-right-image.jpg',
      aboutImage2: '/assets/images/about-image-2.jpg',
      aboutImage3: '/assets/images/about-us-3.jpg',
      indexAboutTap: '/assets/images/index-about-tap.jpeg',
      indexAboutTapWebP: '/assets/images/index-about-tap.webp',
      indexAboutUsLogo: '/assets/images/index-about-us-logo.jpeg',
      indexAboutUsLogoWebP: '/assets/images/index-about-us-logo.webp',
    },

    // Banner images
    banners: {
      burger: '/assets/images/banner-burger.png',
      menu: '/assets/images/banner-menu.jpeg',
      indexHeroBanner: '/assets/images/index-hero-banner.jpg',
      indexHeroBannerWebP: '/assets/images/index-hero-banner.webp',
      indexMenuBackground: '/assets/images/index-menu-background.jpeg',
      indexMenuBackgroundWebP: '/assets/images/index-menu-background.webp',
    },

    // Logo images
    logos: {
      bonefree: '/assets/images/bonefree-logo.webp',
      bonefreeWebP: '/assets/images/bonefree-logo.webp',
    },

    // Event/People images
    events: {
      djAdriano: '/assets/images/dj_adriano.jpg',
      djKhalil: '/assets/images/dj_khalil.jpg',
    },

    // Counter section images
    counter: {
      background: '/assets/images/counter-back.jpg',
    },

    // Test/Sample images
    test: {
      test1: '/assets/images/test1.png',
      test2: '/assets/images/test2.png',
      test3: '/assets/images/test3.png',
      test4: '/assets/images/test4.png',
    },
  },
};

// Default export for convenience
export default ASSETS;
