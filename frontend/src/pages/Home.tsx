import ReservationPromotionNotice, { ReservationPromotionBadge } from '../components/ReservationPromotionNotice';
import { useReservationPromotionState } from '../hooks/useReservationPromotion';
import { formatProductPrices } from "../utils/pricing"
import { ArrowRight, CalendarDays, Leaf, Music2, Sparkles, UtensilsCrossed, Waves } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { homeAction, homeCard, homeHeading, homeKicker } from "../components/homeStyles";

import Navbar from "../components/Navbar";
import HeroOceanWave from "../components/HeroOceanWave";
import { ProductCard } from "../components/ui/ProductCard";
import ProductLabel from "../components/ui/ProductLabel";
import HomeUpcomingEvents from '../components/HomeUpcomingEvents';
import HomeStory from '../components/HomeStory';
import { ProductCardSkeleton, Skeleton } from "../components/ui/Skeleton";
import { ASSETS } from "../constants/assets";
import i18n, { resolvedLocale } from "../i18n";
import { getPublicChefSpecial, productService } from "../services";
import type { Product } from "../types/product";
import { applyApiImageFallback, productImageFallback, resolveProductImageUrl } from "../utils/imageFallback";
import { primaryProductMediaUrl } from "../utils/productMedia";

type CategorySummary = {
  count: number;
  name: string;
};

const fallbackDishImage = productImageFallback;
const hiddenHomeProductNames = new Set(["latino loaded nachos", "lationo loaded nachos"]);

function resolveImage(image: string | null | undefined) {
  return resolveProductImageUrl(image, fallbackDishImage);
}

function productDescription(product?: Product | null) {
  return product?.description || i18n.t("home.fallbackDescription", { ns: "storefront" });
}

function isHiddenHomeProduct(product: Product) {
  return hiddenHomeProductNames.has(product.name.trim().toLowerCase());
}

const HomePage = () => {
  const { t } = useTranslation("storefront");
  const locale = resolvedLocale();
  const navigate = useNavigate();
  const { promotion, loading: promotionLoading } = useReservationPromotionState();
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<CategorySummary[]>([]);
  const [chefSpecialProductId, setChefSpecialProductId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const popularCarouselRef = useRef<HTMLDivElement | null>(null);
  const [activePopularIndex, setActivePopularIndex] = useState(0);

  useEffect(() => {
    let current = true;
    const fetchHomeData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [catalogPage, chefSpecialSetting] = await Promise.all([
          productService.getPage({ page: 1, perPage: 20, sort: "default", locale }),
          getPublicChefSpecial().catch(() => ({ productId: null })),
        ]);
        if (!current) return;
        const data = catalogPage.items;
        setProducts(data);
        setCatalogCategories(catalogPage.facets.categories.map((category) => ({ name: category.name, count: category.count })).slice(0, 7));
        setChefSpecialProductId(chefSpecialSetting.productId ?? null);
        if (chefSpecialSetting.productId && !data.some((product) => product.id === chefSpecialSetting.productId)) {
          void productService.getById(chefSpecialSetting.productId, locale).then((special) => { if (current) setProducts((items) => [...items, special]); }).catch(() => undefined);
        }
      } catch (fetchError) {
        if (!current) return;
        setError(t("home.loadError"));
        console.error(fetchError);
      } finally {
        if (current) setLoading(false);
      }
    };

    void fetchHomeData();
    return () => { current = false; };
  }, [locale, t]);

  const visibleProducts = useMemo(
    () => products.filter((product) => !isHiddenHomeProduct(product)),
    [products],
  );

  const availableProducts = useMemo(
    () => visibleProducts.filter((product) => product.available),
    [visibleProducts],
  );

  const categories = catalogCategories;

  const featuredDish = availableProducts.find((product) => product.media.length > 0) ?? availableProducts[0] ?? visibleProducts[0];
  const sortedPopularProducts = [...availableProducts]
    .sort((a, b) => {
      if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  const highlightedProducts = sortedPopularProducts.filter((product) => product.highlighted);
  const popularProducts = highlightedProducts.length > 0 ? highlightedProducts : sortedPopularProducts.slice(0, 4);
  const configuredChefSpecial = products.find((product) => product.id === chefSpecialProductId && !isHiddenHomeProduct(product));
  const chefSpecial = configuredChefSpecial
    ?? availableProducts.find((product) => product.id !== featuredDish?.id)
    ?? featuredDish;

  useEffect(() => {
    setActivePopularIndex(0);
    popularCarouselRef.current?.scrollTo({ left: 0 });
  }, [popularProducts.length]);

  const handlePopularCarouselScroll = () => {
    const carousel = popularCarouselRef.current;
    if (!carousel) return;

    const cards = Array.from(carousel.children) as HTMLElement[];
    if (cards.length === 0) return;

    const currentIndex = cards.reduce((closestIndex, card, index) => {
      const closestCard = cards[closestIndex];
      const currentDistance = Math.abs(card.offsetLeft - carousel.scrollLeft);
      const closestDistance = Math.abs(closestCard.offsetLeft - carousel.scrollLeft);
      return currentDistance < closestDistance ? index : closestIndex;
    }, 0);

    setActivePopularIndex(currentIndex);
  };

  const scrollToPopularProduct = (index: number) => {
    const card = popularCarouselRef.current?.children.item(index);
    card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    setActivePopularIndex(index);
  };

  return (
    <HomeShell>
      <HeroSection className="home-hero">
        <HeroOverlay aria-hidden="true"><Leaf /><Waves /><Music2 /></HeroOverlay>
        <Navbar />
        <HeroContent $hasPromotion={!!promotion || promotionLoading}>

          <HeroCopy>
            <Eyebrow>
              <Sparkles size={16} />
              {t("home.heroEyebrow")}
            </Eyebrow>
            <HeroTitle>{t("home.heroTitle")}</HeroTitle>
            <HeroText>{t("home.heroText")}</HeroText>
            <HeroActions>
              <PrimaryCta to="/menu">
                <UtensilsCrossed size={18} aria-hidden="true" />
                {t("home.openMenu")}
              </PrimaryCta>
              <SecondaryCta className="reservation-reserve-button" to={promotion ? `/reservations?date=${promotion.next_date}` : "/reservations"}>
                <CalendarDays size={18} aria-hidden="true" />{t("home.reserveTable")}<ReservationPromotionBadge promotion={promotion} compact />
              </SecondaryCta>
            </HeroActions>
            <HeroEventsLink className="home-events-link" to="/events"><Music2 size={18} aria-hidden="true" />{t('events.viewEvents')}<ArrowRight size={17} aria-hidden="true" /></HeroEventsLink>

          </HeroCopy>

          <ReservationPromotionNotice promotion={promotion} loading={promotionLoading} />
        </HeroContent>
        <HeroWave />
      </HeroSection>

      <HomeUpcomingEvents />

      <CategorySection aria-label={t("home.categories")}>
        <CategoryTrack>
          {loading
            ? Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} width="140px" height="44px" radius="999px" />
            ))
            : categories.map((category) => (
              <CategoryPill key={category.name} to="/menu">
                <span>{category.name}</span>
                <strong>{category.count}</strong>
              </CategoryPill>
            ))}
        </CategoryTrack>
      </CategorySection>

      <FavoritesSection>
        <SectionHeader>
          <SectionKicker><Sparkles size={14} aria-hidden="true" />{t("home.popular")}</SectionKicker>
          <h2>{t("home.popularTitle")}</h2>
          <p>{t("home.popularText")}</p>
        </SectionHeader>

        {error && <p className="home-catalog-notice" role="alert">{error}</p>}
        <PopularCarousel
          aria-label={t("home.popularAria")}
          onScroll={handlePopularCarouselScroll}
          ref={popularCarouselRef}
        >
          {loading
            ? Array.from({ length: 4 }, (_, index) => (
              <ProductCardSkeleton key={index} />
            ))
            : popularProducts.map((product) => (
              <ProductCard
                key={product.id}
                currencySymbol="€"
                product={product}
                resolveImageSrc={resolveImage}
                onSelect={() => navigate(`/product/${product.id}`)}
                tone="light"
              />
            ))}
        </PopularCarousel>
        {!loading && popularProducts.length > 1 && (
          <PopularCarouselDots aria-label={t("home.choosePopular")}>
            {popularProducts.map((product, index) => (
              <button
                key={product.id}
                type="button"
                className={index === activePopularIndex ? "active" : ""}
                aria-label={t("home.showProduct", { name: product.name })}
                aria-current={index === activePopularIndex ? "true" : undefined}
                onClick={() => scrollToPopularProduct(index)}
              />
            ))}
          </PopularCarouselDots>
        )}
        <div className="d-flex flex-wrap gap-3 justify-content-center mt-4">
          <PrimaryCta to="/menu">
            {t("home.openFullMenu")}
            <ArrowRight size={18} aria-hidden="true" />
          </PrimaryCta>
          <SecondaryCta className="reservation-reserve-button" to={promotion ? `/reservations?date=${promotion.next_date}` : "/reservations"}><CalendarDays size={17} aria-hidden="true" />{t("home.reserveTable")}<ReservationPromotionBadge promotion={promotion} compact /></SecondaryCta>
        </div>
      </FavoritesSection>

      <ChefSpecialBanner aria-label={t("home.chefAria")}>
        <ChefImageWrap>
          <ChefImage
            loading="lazy"
            decoding="async"
            alt={chefSpecial?.name ?? t("home.todaySpecial")}
            onError={(event) => {
              applyApiImageFallback(event.currentTarget, fallbackDishImage);
            }}
            src={resolveImage(primaryProductMediaUrl(chefSpecial?.media, "card"))}
          />
        </ChefImageWrap>
        <ChefCopy>
          <ChefHeader>
            <ProductLabel>{t("home.todaySpecial")}</ProductLabel>
            {chefSpecial && <ChefCategory>{chefSpecial.category}</ChefCategory>}
          </ChefHeader>
          <h2>{chefSpecial?.name ?? t("home.plantSpecial")}</h2>
          <p>
            {chefSpecial
              ? productDescription(chefSpecial)
              : t("home.askTeam")}
          </p>
          <ChefDetails>

            {chefSpecial && <strong>{formatProductPrices(chefSpecial)}</strong>}
            {chefSpecial && (
              <span>{chefSpecial.available ? t("home.available") : t("home.unavailable")}</span>
            )}
          </ChefDetails>
          <PrimaryCta to={chefSpecial ? `/product/${chefSpecial.id}` : "/menu"}>
            {t("home.viewSpecial")}
            <ArrowRight size={18} />
          </PrimaryCta>
        </ChefCopy>
      </ChefSpecialBanner>

      <HomeStory />

    </HomeShell>
  );
};

const HomeShell = styled.main`
  position: relative;
  --home-paper: #fffaf0;
  --home-mint: #e6efd7;
  --home-line: #dbe2ce;
  min-height: 100vh;
  overflow: hidden;
  background: #faf8f0;
  color: var(--brand-ink);
`;

const HeroSection = styled.section`
  position: relative;
  z-index: 3;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(31, 37, 30, .9), rgba(46, 43, 32, .58)),
    url(${ASSETS.images.hero.heroBanner}) center / cover no-repeat;
  background-attachment: scroll;
  background-position: center;

  @media (max-width: 767px) {
    background-attachment: scroll;
  }
`;

const HeroWave = styled(HeroOceanWave)`
  --hero-wave-height: clamp(76px, 8.6vw, 124px);
  position: absolute;
  z-index: 2;
  bottom: calc(var(--hero-wave-height) * -0.16);
  left: 0;
  display: block;
  width: 100%;
  height: var(--hero-wave-height);
  color: #faf8f0;
  pointer-events: none;


  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transform: none;
  }
`;

const HeroOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 85% 15%, rgba(240, 213, 157, .09), transparent 65%);
  pointer-events: none;
  svg { position: absolute; width: 125px; height: 125px; color: #e5dfbc; opacity: .12; stroke-width: 1; }
  svg:nth-child(1) { left: -35px; bottom: 30px; width: 170px; height: 170px; transform: rotate(-20deg); }
  svg:nth-child(2) { top: 100px; left: 46%; transform: rotate(12deg); }
  svg:nth-child(3) { right: 20px; bottom: 35px; color: #fdcd43; }
`;

const HeroContent = styled.div<{ $hasPromotion: boolean }>`
  --hero-copy-width: ${({ $hasPromotion }) => $hasPromotion ? '820px' : '1080px'};
  --hero-title-size: ${({ $hasPromotion }) => $hasPromotion ? 'clamp(2.45rem, 5.1vw, 4.7rem)' : 'clamp(3.3rem, 7.2vw, 6.6rem)'};
  --hero-mobile-title-size: ${({ $hasPromotion }) => $hasPromotion ? 'clamp(1.85rem, 7.2vw, 2.45rem)' : 'clamp(2.35rem, 10vw, 3.3rem)'};
  --hero-description-size: ${({ $hasPromotion }) => $hasPromotion ? '.97rem' : '1.18rem'};
  --hero-mobile-description-size: ${({ $hasPromotion }) => $hasPromotion ? '.9rem' : '1.05rem'};
  --hero-description-width: ${({ $hasPromotion }) => $hasPromotion ? '590px' : '740px'};
  --hero-copy-align: ${({ $hasPromotion }) => $hasPromotion ? 'center' : 'flex-start'};
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: ${({ $hasPromotion }) => $hasPromotion ? 'minmax(0, 1.05fr) minmax(320px, 0.62fr)' : 'minmax(0, 1fr)'};
  box-sizing: border-box;
  width: min(100%, 1360px);
  min-height: 97vh;
  align-items: ${({ $hasPromotion }) => $hasPromotion ? 'center' : 'start'};
  gap: clamp(1.5rem, 4vw, 3rem);
  margin: 0 auto;
  padding: ${({ $hasPromotion }) => $hasPromotion ? '148px' : '152px'} 2rem 68px;

  @media (max-width: 1000px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 767px) {
    min-height: 80vh;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: ${({ $hasPromotion }) => $hasPromotion ? '116px' : '136px'} 1.25rem 36px;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;
  width: 100%;
  max-width: var(--hero-copy-width);

  @media (max-width: 767px) {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: var(--hero-copy-align);
    gap: 14px;
  }
`;

const Eyebrow = styled.p`
  display: inline-flex;
  max-width: 100%;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 1.25rem;
  color: #f6d867;
  font-size: 0.82rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1.35;
  text-transform: uppercase;

  @media (max-width: 767px) {
    flex-wrap: nowrap;
    gap: 0.4rem;
    margin-bottom: 0;
    font-size: 0.7rem;
    letter-spacing: 0.05em;

    svg {
      flex-shrink: 0;
    }
  }
`;

const HeroTitle = styled.h1`
  max-width: min(100%, var(--hero-copy-width));
  margin: 0;
  color: #ffffff;
  font-size: var(--hero-title-size);
  font-weight: 700;
  letter-spacing: -.015em;
  line-height: 1.04;
  overflow-wrap: break-word;
  text-wrap: balance;

  @media (max-width: 520px) {
    font-size: var(--hero-mobile-title-size);
    line-height: 1.04;
  }
`;

const HeroText = styled.p`
  max-width: var(--hero-description-width);
  margin: 1.35rem 0 0;
  color: rgba(247, 250, 245, 0.82);
  font-size: var(--hero-description-size);
  line-height: 1.65;

  @media (max-width: 767px) {
    margin-top: 0;
    font-size: var(--hero-mobile-description-size);
    line-height: 1.5;
  }
`;

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  margin-top: 2rem;

  @media (max-width: 767px) {
    margin-top: 0;
  }

  @media (max-width: 480px) {
    align-items: flex-start;
  }
`;

const HeroEventsLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 11px;
  width: fit-content;
  padding: 12px 0;
  margin-top: 20px;
  color: #f7e2a2;
  font-size: .83rem;
  font-weight: 700;
  text-decoration: none;
  &:hover { color: #fdcd43; }
  &:focus-visible { outline: 3px solid #fdcd43; outline-offset: 5px; }
  @media (max-width: 767px) { margin-top: 0; }
`;

const PrimaryCta = styled(Link)`
  ${homeAction}
  box-sizing: border-box;
  min-height: 44px;
  padding: 10px 16px;
  font-size: .83rem;
`;

const SecondaryCta = styled(PrimaryCta)`
  border-radius: 15px 15px 5px 15px;
  background: #fff8e8;
  color: #285442;
  &:hover { background: #f2edcf; color: #285442; }
`;

const CarouselDots = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;

  button {
    display: inline-grid;
    width: 32px;
    height: 32px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
  }
  button::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #d0d9bf;
  }
  button:hover::before { background: #7baf4b; }
  button:focus-visible { outline: 2px solid #076050; outline-offset: 1px; }
  button.active::before { width: 18px; background: #7baf4b; }
`;

const CategorySection = styled.section`
  width: min(1240px, calc(100% - 40px));
  margin: clamp(28px, 4vw, 48px) auto 0;
  border-block: 1px dashed #d1dbc2;
`;

const CategoryTrack = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  overflow-x: auto;
  padding: 18px 4px 20px;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;

const CategoryPill = styled(Link)`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid var(--home-line);
  border-radius: 14px 14px 14px 5px;
  background: var(--home-paper);
  color: #294b3e;
  box-shadow: 0 2px 0 #7baf4b33;
  font-size: .8rem;
  font-weight: 700;
  text-decoration: none;
  &:hover { background: var(--home-mint); color: #294b3e; }
  &:focus-visible { outline: 2px solid #076050; outline-offset: 3px; }
  strong { display: inline-grid; min-width: 24px; height: 24px; place-items: center; border-radius: 50%; background: #ffdf7c; color: #294b3e; font-size: .72rem; }
`;

const FavoritesSection = styled.section`
  .home-catalog-notice { padding: 14px; border: 1px solid var(--home-line); border-radius: 14px; background: var(--home-mint); color: #294b3e; }

  width: min(100%, 1280px);
  margin: 0 auto;
  padding: clamp(48px, 6vw, 80px) 1.5rem;

  @media (max-width: 520px) {
    padding-inline: 1rem;
  }
`;

const SectionHeader = styled.div`
  max-width: 720px;
  margin-bottom: 28px;
  h2 { ${homeHeading} margin: 14px 0 0; }
  p { max-width: 600px; margin: 14px 0 0; color: #67715f; font-size: .94rem; line-height: 1.7; }
`;

const SectionKicker = styled.span`
  ${homeKicker}
`;

const PopularCarousel = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  align-items: stretch;
  overflow: visible;
  padding: 4px 0 8px;

  & > article {
    ${homeCard}
    --product-card-radius: 24px 24px 24px 8px;
    --product-card-media-radius: 16px;
    --product-card-media-bg: #edf2e4;
    padding: 14px;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    &:hover { box-shadow: 0 5px 0 #7baf4b55; }
    &::before { display: none; }
  }
  .product-card-media { background: #edf2e4; }
  .product-card-media::before { display: none; }
  .product-card-body { min-width: 0; }
  .product-card-body h3 { color: #294b3e; font-size: 1.15rem; }
  .product-card-body a { ${homeAction} min-height: 40px; padding: 8px 10px; font-size: .7rem; background: var(--home-paper); }

  @media (max-width: 1000px) {
    grid-template-columns: none;
    grid-auto-columns: minmax(270px, min(82vw, 360px));
    grid-auto-flow: column;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    padding: 4px 4px 10px;
    scroll-padding-inline: 4px;
    scroll-snap-type: inline mandatory;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    & > article {
      scroll-snap-align: start;
    }
  }

  @media (max-width: 520px) {
    grid-auto-columns: min(78vw, 340px);
    gap: 0.85rem;
    padding: 4px 4px 10px;
    scroll-padding-inline: 4px;
  }
`;

const PopularCarouselDots = styled(CarouselDots)`
  display: none;
  margin-top: 14px;
  @media (max-width: 1000px) { display: flex; }
`;

const ChefSpecialBanner = styled.section`
  position: relative;
  display: grid;
  grid-template-columns: minmax(320px, 0.82fr) minmax(0, 1fr);
  width: min(calc(100% - 3rem), 1280px);
  margin: 0 auto clamp(48px, 6vw, 80px);
  overflow: hidden;
  ${homeCard}

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    width: min(calc(100% - 2rem), 1280px);
  }
`;

const ChefImageWrap = styled.div`
  display: grid;
  min-height: 390px;
  place-items: center;
  padding: clamp(1.25rem, 4vw, 2.4rem);
  background: #edf2e4;
  border-right: 1px dashed #cbd8b9;

  @media (max-width: 860px) {
    min-height: 250px;
    border-right: 0;
    border-bottom: 1px dashed #cbd8b9;
  }
`;

const ChefImage = styled.img`
  width: 100%;
  height: min(330px, 45vw);
  max-height: 330px;
  border-radius: var(--radius-md);
  object-fit: contain;
  filter: drop-shadow(0 8px 12px #294b3e14);

  @media (max-width: 860px) {
    height: 250px;
  }
`;

const ChefCopy = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(1.5rem, 5vw, 3rem);

  h2 {
    ${homeHeading}
    max-width: 650px;
    margin: 16px 0;
  }

  p {
    max-width: 560px;
    margin: 0;
    color: var(--brand-muted);
    line-height: 1.7;
  }
`;

const ChefHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
`;

const ChefCategory = styled.span`
  ${homeKicker}
`;

const ChefDetails = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  margin: 1.4rem 0;
  color: var(--brand-ink);
  font-weight: 900;

  span {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    gap: 0.45rem;
    border: 1px solid #dbe5d7;
    border-radius: 12px 12px 4px 12px;
    background: #fffaf0;
    padding: 0 0.8rem;
    color: #53635b;
    font-size: 0.86rem;
  }

  strong {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    border-radius: 12px 12px 4px 12px;
    background: #e6efd7;
    color: #285442;
    padding: 0 0.9rem;
    font-size: 1.25rem;
  }
`;

export default HomePage;
