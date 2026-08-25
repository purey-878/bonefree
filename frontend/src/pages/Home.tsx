import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Clock, Sparkles, Star, UtensilsCrossed } from "lucide-react";
import styled from "styled-components";

import Navbar from "../components/Navbar";
import { ProductCard, ProductCardSkeleton, Skeleton } from "../components/ui";
import { ASSETS } from "../constants/assets";
import { getPublicChefSpecial, getPublicLoyaltyCouponSettings, productService } from "../services";
import type { Product, ProductReview } from "../types/product";
import {
  defaultLoyaltyCouponSettings,
  loyaltyCouponDetail,
  loyaltyCouponHeadline,
} from "../utils/loyaltyCoupon";
import { applyApiImageFallback, productImageFallback, resolveProductImageUrl } from "../utils/imageFallback";
import { formatEuro } from "../utils/money";
import { primaryProductMediaUrl } from "../utils/productMedia";
import i18n, { resolvedLocale } from "../i18n";
import manifest from "../app/manifest/currentManifest";
import { useOrganization } from "../organization/context/organization-context";
import { PageRenderer } from "../sections/PageRenderer";
import { resolvePageSections } from "../sections/sectionResolution";


type CategorySummary = {
  count: number;
  name: string;
};

const HOME_REVIEW_LIMIT = 3;
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

function reviewCopy(review: Pick<ProductReview, "comment" | "title">) {
  return review.comment?.trim() || review.title?.trim() || "";
}

const HomePage = () => {
  const { t } = useTranslation("storefront");
  const { capabilities, experience } = useOrganization();
  const renderableHomeSections = useMemo(() => new Set(resolvePageSections({
    page: experience.experience.pages.home,
    sectionRegistry: manifest.section_registry,
    capabilities,
    availableSlots: new Set([
      "hero",
      "category_navigation",
      "loyalty",
      "popular_products",
      "chef_special",
      "reviews",
    ]),
  }).sections.map((section) => section.type)), [capabilities, experience]);
  const reviewsEnabled = renderableHomeSections.has("reviews");
  const loyaltyEnabled = renderableHomeSections.has("loyalty");
  const chefSpecialEnabled = renderableHomeSections.has("chef_special");
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [homeReviews, setHomeReviews] = useState<Awaited<ReturnType<typeof productService.getFeaturedReviews>>>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [chefSpecialProductId, setChefSpecialProductId] = useState<number | null>(null);
  const [loyaltyCouponSettings, setLoyaltyCouponSettings] = useState(defaultLoyaltyCouponSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroCarouselPaused, setHeroCarouselPaused] = useState(false);
  const [activeHeroProductIndex, setActiveHeroProductIndex] = useState(0);
  const heroSwipeStartXRef = useRef<number | null>(null);
  const heroSwipeStartYRef = useRef<number | null>(null);
  const skipHeroCardClickRef = useRef(false);
  const popularCarouselRef = useRef<HTMLDivElement | null>(null);
  const [activePopularIndex, setActivePopularIndex] = useState(0);

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        const [data, chefSpecialSetting, couponSettings, featuredReviews] = await Promise.all([
          productService.getAll(),
          chefSpecialEnabled
            ? getPublicChefSpecial().catch(() => ({ productId: null }))
            : Promise.resolve({ productId: null }),
          loyaltyEnabled
            ? getPublicLoyaltyCouponSettings().catch(() => defaultLoyaltyCouponSettings)
            : Promise.resolve({ ...defaultLoyaltyCouponSettings, enabled: false }),
          reviewsEnabled
            ? productService.getFeaturedReviews(HOME_REVIEW_LIMIT).catch(() => [])
            : Promise.resolve([]),
        ]);
        setProducts(data);
        setChefSpecialProductId(chefSpecialSetting.productId ?? null);
        setLoyaltyCouponSettings(couponSettings);
        setHomeReviews(featuredReviews);
      } catch (fetchError) {
        setError(t("home.loadError"));
        setReviewsLoading(false);
        console.error(fetchError);
      } finally {
        setLoading(false);
        setReviewsLoading(false);
      }
    };

    fetchHomeData();
  }, [chefSpecialEnabled, loyaltyEnabled, reviewsEnabled, t]);

  const visibleProducts = useMemo(
    () => products.filter((product) => !isHiddenHomeProduct(product)),
    [products],
  );

  const availableProducts = useMemo(
    () => visibleProducts.filter((product) => product.available),
    [visibleProducts],
  );

  const categories = useMemo<CategorySummary[]>(() => {
    const counts = new Map<string, number>();
    visibleProducts.forEach((product) => {
      const name = product.category || t("home.fallbackCategory");
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });

    return Array.from(counts, ([name, count]) => ({ count, name })).slice(0, 7);
  }, [t, visibleProducts]);

  const featuredDish = availableProducts.find((product) => product.media.length > 0) ?? availableProducts[0] ?? visibleProducts[0];
  const sortedPopularProducts = [...availableProducts]
    .sort((a, b) => {
      if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1;
      return (b.sold ?? 0) - (a.sold ?? 0);
    });
  const highlightedProducts = sortedPopularProducts.filter((product) => product.highlighted);
  const popularProducts = highlightedProducts.length > 0 ? highlightedProducts : sortedPopularProducts.slice(0, 4);
  const configuredChefSpecial = products.find((product) => product.id === chefSpecialProductId && !isHiddenHomeProduct(product));
  const chefSpecial = configuredChefSpecial
    ?? availableProducts.find((product) => product.id !== featuredDish?.id)
    ?? featuredDish;
  const heroDish = popularProducts[activeHeroProductIndex] ?? featuredDish;
  useEffect(() => {
    setActiveHeroProductIndex(0);
  }, [popularProducts.length]);

  useEffect(() => {
    setActivePopularIndex(0);
    popularCarouselRef.current?.scrollTo({ left: 0 });
  }, [popularProducts.length]);

  useEffect(() => {
    if (loading || heroCarouselPaused || popularProducts.length <= 1) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveHeroProductIndex((currentIndex) => (currentIndex + 1) % popularProducts.length);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [heroCarouselPaused, loading, popularProducts.length]);

  const pauseHeroCarousel = () => {
    setHeroCarouselPaused(true);
  };

  const changeHeroProduct = (direction: 1 | -1) => {
    if (popularProducts.length <= 1) return;

    pauseHeroCarousel();
    setActiveHeroProductIndex((currentIndex) => (
      (currentIndex + direction + popularProducts.length) % popularProducts.length
    ));
  };

  const handleHeroPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;

    pauseHeroCarousel();
    heroSwipeStartXRef.current = event.clientX;
    heroSwipeStartYRef.current = event.clientY;
    skipHeroCardClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleHeroPointerUp = (event: PointerEvent<HTMLElement>) => {
    const startX = heroSwipeStartXRef.current;
    const startY = heroSwipeStartYRef.current;
    heroSwipeStartXRef.current = null;
    heroSwipeStartYRef.current = null;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (startX == null || startY == null) return;

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const isHorizontalSwipe = Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;

    if (!isHorizontalSwipe) return;

    skipHeroCardClickRef.current = true;
    changeHeroProduct(deltaX < 0 ? 1 : -1);
  };

  const resetHeroSwipe = (event: PointerEvent<HTMLElement>) => {
    heroSwipeStartXRef.current = null;
    heroSwipeStartYRef.current = null;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

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
      <PageRenderer
        pageKey="home"
        slots={{
          hero: (
      <HeroSection>
        <HeroOverlay />
        <Navbar />
        <HeroContent>

          <HeroCopy>
            <Eyebrow>
              <Sparkles size={16} />
              {t("home.heroEyebrow")}
            </Eyebrow>
            <HeroTitle>{t("home.heroTitle")}</HeroTitle>
            <HeroText>{t("home.heroText")}</HeroText>
            <HeroActions>
              <PrimaryCta className="fw-semibold" to="/menu">
                {t("home.openMenu")}
                <ArrowRight size={18} />
              </PrimaryCta>
              <SecondaryCta className="fw-semibold" to="/contact">
                {t("home.findRestaurant")}
              </SecondaryCta>
            </HeroActions>
            <TrustStrip aria-label={t("home.highlights")}>
              <TrustItem>
                <Star size={17} />
                {t("home.rating")}
              </TrustItem>
              <TrustItem>
                <UtensilsCrossed size={17} />
                {t("home.tableOrders")}
              </TrustItem>
              <TrustItem>
                <Clock size={17} />
                {t("home.kitchenRhythm")}
              </TrustItem>
            </TrustStrip>

          </HeroCopy>

          <FeaturedDishCard
            aria-label={t("home.featuredDish")}
            onFocusCapture={pauseHeroCarousel}
            onClick={() => {
              if (skipHeroCardClickRef.current) {
                skipHeroCardClickRef.current = false;
                return;
              }

              if (heroDish) navigate(`/product/${heroDish.id}`);
            }}
            onPointerCancel={resetHeroSwipe}
            onPointerDown={handleHeroPointerDown}
            onPointerEnter={pauseHeroCarousel}
            onPointerLeave={resetHeroSwipe}
            onPointerUp={handleHeroPointerUp}
            onTouchStart={pauseHeroCarousel}
            onWheel={pauseHeroCarousel}
          >
            {loading ? (
              <>
                <Skeleton height="210px" />
                <Skeleton width="52%" height="20px" />
                <Skeleton width="84%" height="28px" />
                <Skeleton width="72%" height="16px" />
              </>
            ) : heroDish ? (
              <>
                <FeaturedImage
                  key={heroDish.id}
                  alt={heroDish.name}
                  onError={(event) => {
                    applyApiImageFallback(event.currentTarget, fallbackDishImage);
                  }}
                  src={resolveImage(primaryProductMediaUrl(heroDish.media, "card"))}
                />
                <FeaturedMeta>
                  <span>{heroDish.category}</span>
                  <strong>{formatEuro(heroDish.price)}</strong>
                </FeaturedMeta>
                <FeaturedTitle>{heroDish.name}</FeaturedTitle>
                <FeaturedText>{productDescription(heroDish)}</FeaturedText>
                <HeroCarouselDots aria-label={t("home.chooseFeatured")}>
                  {popularProducts.map((product, index) => (
                    <button
                      key={product.id}
                      type="button"
                      className={index === activeHeroProductIndex ? "active" : ""}
                      aria-label={t("home.showProduct", { name: product.name })}
                      aria-current={index === activeHeroProductIndex ? "true" : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        pauseHeroCarousel();
                        setActiveHeroProductIndex(index);
                      }}
                    />
                  ))}
                </HeroCarouselDots>
              </>
            ) : (
              <FeaturedEmpty>{error ?? t("home.highlightsPreparing")}</FeaturedEmpty>
            )}
          </FeaturedDishCard>
        </HeroContent>
      </HeroSection>
          ),
          category_navigation: (
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
          ),
          loyalty: (
            <>
      {loyaltyCouponSettings.enabled && (
        <LoyaltyRewardBanner aria-label={t("home.loyaltyAria")} className="mt-5">
          <div>
            <SectionKicker>{t("home.loyaltyTitle")}</SectionKicker>
            <h2>{loyaltyCouponHeadline(loyaltyCouponSettings)}</h2>
            <p>{loyaltyCouponDetail(loyaltyCouponSettings)}</p>
          </div>
          <PrimaryCta to="/profile">
            {t("home.viewCoupons")}
            <ArrowRight size={18} />
          </PrimaryCta>
        </LoyaltyRewardBanner>
      )}
            </>
          ),
          popular_products: (
      <FavoritesSection>
        <SectionHeader>
          <SectionKicker className="fw-bold">{t("home.popular")}</SectionKicker>
          <h2>{t("home.popularTitle")}</h2>
          <p>{t("home.popularText")}</p>
        </SectionHeader>

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
                className="p-4"
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
      </FavoritesSection>
          ),
          chef_special: (
      <ChefSpecialBanner aria-label={t("home.chefAria")}>
        <ChefImageWrap>
          <ChefImage
            alt={chefSpecial?.name ?? t("home.todaySpecial")}
            onError={(event) => {
              applyApiImageFallback(event.currentTarget, fallbackDishImage);
            }}
            src={resolveImage(primaryProductMediaUrl(chefSpecial?.media, "card"))}
          />
        </ChefImageWrap>
        <ChefCopy>
          <ChefHeader>
            <SectionKicker>{t("home.todaySpecial")}</SectionKicker>
            {chefSpecial && <ChefCategory>{chefSpecial.category}</ChefCategory>}
          </ChefHeader>
          <h2>{chefSpecial?.name ?? t("home.plantSpecial")}</h2>
          <p>
            {chefSpecial
              ? productDescription(chefSpecial)
              : t("home.askTeam")}
          </p>
          <ChefDetails>

            {chefSpecial && <strong>{formatEuro(chefSpecial.price)}</strong>}
            {chefSpecial && (
              <span>{chefSpecial.available ? t("home.available") : t("home.unavailable")}</span>
            )}
          </ChefDetails>
          <PrimaryCta className="fw-semibold" to={chefSpecial ? `/product/${chefSpecial.id}` : "/menu"}>
            {t("home.viewSpecial")}
            <ArrowRight size={18} />
          </PrimaryCta>
        </ChefCopy>
      </ChefSpecialBanner>
          ),
          reviews: (
            <>
      {(reviewsLoading || homeReviews.length > 0) && reviewsEnabled ? <TestimonialsSection>
        <SectionHeader>
          <SectionKicker>{t("home.reviewsLabel")}</SectionKicker>
          <h2>{t("home.reviewsTitle")}</h2>
        </SectionHeader>
        {reviewsLoading ? (
          <TestimonialGrid aria-label={t("home.loadingReviews")}>
            {Array.from({ length: 3 }, (_, index) => (
              <TestimonialSkeleton key={index}>
                <Skeleton width="42%" height="18px" />
                <Skeleton width="100%" height="72px" />
                <Skeleton width="62%" height="16px" />
              </TestimonialSkeleton>
            ))}
          </TestimonialGrid>
        ) : (
          <TestimonialGrid aria-label={t("home.reviewsAria")}>
            {homeReviews.map((review) => (
              <TestimonialCard key={review.reviewId}>
                <ReviewStars aria-label={t("home.stars", { rating: review.rating })}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star key={index} size={15} fill={index < review.rating ? "currentColor" : "none"} />
                  ))}
                </ReviewStars>
                <blockquote>{reviewCopy(review)}</blockquote>
                <ReviewMeta>
                  <span>{review.customerName || t("home.customer")}</span>
                  <small>
                    <ProductReviewLink to={`/product/${review.productId}`}>{review.productName}</ProductReviewLink>
                    {" | "}
                    {new Date(review.createdAt).toLocaleDateString(resolvedLocale())}
                  </small>
                </ReviewMeta>
              </TestimonialCard>
            ))}
          </TestimonialGrid>
        )}
      </TestimonialsSection> : null}
            </>
          ),
        }}
      />
    </HomeShell>
  );
};

const HomeShell = styled.main`
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 10% 0%, rgba(253, 205, 67, 0.14), transparent 30rem),
    radial-gradient(circle at 90% 18%, rgba(7, 96, 80, 0.1), transparent 28rem),
    var(--background-body);
  color: var(--brand-ink);
`;

const HeroSection = styled.section`
  position: relative;
  z-index: 3;
  min-height: 94svh;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(5, 12, 10, 0.82), rgba(7, 17, 15, 0.58) 54%, rgba(7, 17, 15, 0.84)),
    url(${ASSETS.images.hero.heroBanner}) center / cover no-repeat;
  background-attachment: fixed;
  background-position: center;

  @media (max-width: 767px) {
    min-height: 92svh;
    background-attachment: scroll;
  }
`;

const HeroOverlay = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 76% 28%, rgba(253, 205, 67, 0.18), transparent 22rem),
    radial-gradient(circle at 15% 80%, rgba(123, 175, 75, 0.12), transparent 20rem),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(7, 17, 15, 0.38));
  pointer-events: none;
`;

const HeroContent = styled.div`
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.62fr);
  box-sizing: border-box;
  width: min(100%, 1280px);
  min-height: calc(94svh - 72px);
  align-items: center;
  gap: clamp(1.5rem, 4vw, 3rem);
  margin: 0 auto;
  padding: clamp(5rem, 8vw, 7.5rem) 1.5rem clamp(3.5rem, 6vw, 5rem);

  @media (max-width: 1000px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 767px) {
    min-height: calc(92svh - 68px);
    padding: 4rem 1rem 3rem;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;
  width: 100%;
  max-width: 820px;
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
`;

const HeroTitle = styled.h1`
  max-width: min(100%, 860px);
  margin: 0;
  color: #ffffff;
  font-size: clamp(2.7rem, 7.4vw, 6.2rem);
  line-height: 0.96;
  overflow-wrap: break-word;
  text-wrap: balance;

  @media (max-width: 520px) {
    font-size: clamp(2.15rem, 12vw, 3.35rem);
  }
`;

const HeroText = styled.p`
  max-width: 590px;
  margin: 1.35rem 0 0;
  color: rgba(247, 250, 245, 0.82);
  font-size: clamp(1.02rem, 2vw, 1.24rem);
  line-height: 1.65;
`;

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  margin-top: 2rem;

  @media (max-width: 480px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const PrimaryCta = styled(Link)`
  display: inline-flex;
  box-sizing: border-box;
  max-width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 0 1.15rem;
  border: 1px solid rgba(253, 205, 67, 0.42);
  border-radius: var(--radius-sm);
  background: var(--brand-gradient);
  color: var(--white);
  font-weight: 900;
  text-decoration: none;
  text-align: center;
  transition: transform 180ms ease, border-color 180ms ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(253, 205, 67, 0.62);
    color: var(--white);
    text-decoration: none;
  }
`;

const SecondaryCta = styled(Link)`
  display: inline-flex;
  box-sizing: border-box;
  max-width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  padding: 0 1.15rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-weight: 900;
  text-decoration: none;
  text-align: center;
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);

  &:hover {
    color: #ffffff;
    text-decoration: none;
  }
`;

const TrustStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.75rem;
`;

const TrustItem = styled.span`
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(247, 250, 245, 0.86);
  font-size: 0.85rem;
  font-weight: 800;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);

  svg {
    color: var(--brand-accent);
  }
`;

const FeaturedDishCard = styled.aside`
  display: grid;
  grid-template-rows: clamp(230px, 28vw, 340px) auto minmax(3.3rem, auto) minmax(4.8rem, auto) 24px;
  gap: 1rem;
  box-sizing: border-box;
  width: 100%;
  max-width: 460px;
  min-height: 570px;
  align-self: center;
  justify-self: end;
  cursor: pointer;
  touch-action: pan-y;
  user-select: none;
  padding: 1rem;
  border: none;
  border-radius: var(--radius-md);
  background:
    radial-gradient(circle at 18% 10%, rgba(253, 205, 67, 0.22), transparent 15rem),
    radial-gradient(circle at 86% 42%, rgba(7, 96, 80, 0.22), transparent 14rem),
    radial-gradient(circle at 30% 92%, rgba(123, 175, 75, 0.18), transparent 13rem),
    linear-gradient(180deg, rgba(255, 255, 255, 0.19), rgba(255, 255, 255, 0.09)),
    rgba(7, 17, 15, 0.26);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  transition: transform 180ms ease;

  &:hover {
    transform: translateY(-2px);
  }

  @media (max-width: 1000px) {
    display: none;
  }

  @media (max-width: 960px) {
    justify-self: start;
    width: min(100%, 520px);
    max-width: 520px;
  }

  @media (max-width: 520px) {
    grid-template-rows: 250px auto minmax(3.1rem, auto) minmax(4.6rem, auto) 24px;
    min-height: 555px;
  }
`;

const FeaturedImage = styled.img`
  width: 100%;
  height: 100%;
  border-radius: var(--radius-sm);
  background:
    radial-gradient(circle at 28% 22%, rgba(253, 205, 67, 0.24), transparent 36%),
    radial-gradient(circle at 76% 72%, rgba(123, 175, 75, 0.2), transparent 42%),
    rgba(255, 255, 255, 0.04);
  object-fit: contain;
  padding: 1rem;
`;

const FeaturedMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: rgba(247, 250, 245, 0.68);
  font-size: 0.82rem;
  font-weight: 900;
  text-transform: uppercase;

  strong {
    color: var(--brand-accent);
    font-size: 1.25rem;
  }
`;

const FeaturedTitle = styled.h2`
  display: -webkit-box;
  min-height: 3.3rem;
  margin: 0;
  overflow: hidden;
  color: #ffffff;
  font-size: 1.35rem;
  line-height: 1.22;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`;

const FeaturedText = styled.p`
  display: -webkit-box;
  min-height: 4.8rem;
  margin: 0;
  overflow: hidden;
  color: rgba(247, 250, 245, 0.72);
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
`;

const HeroCarouselDots = styled.div`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.1rem;

  button {
    width: 9px;
    height: 9px;
    border: 1px solid rgba(255, 255, 255, 0.34);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    cursor: pointer;
    padding: 0;
    transition: width 180ms ease, background 180ms ease, border-color 180ms ease;
  }

  button:hover,
  button:focus-visible {
    border-color: rgba(253, 205, 67, 0.8);
    outline: none;
  }

  button.active {
    width: 24px;
    border-color: rgba(253, 205, 67, 0.86);
    background: var(--brand-accent);
  }
`;

const FeaturedEmpty = styled.p`
  margin: 0;
  color: rgba(247, 250, 245, 0.72);
`;

const CategorySection = styled.section`
  position: relative;
  z-index: 4;
  border-block: 1px solid rgba(7, 96, 80, 0.1);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
`;

const LoyaltyRewardBanner = styled.section`
  display: flex;
  width: min(calc(100% - 3rem), 1280px);
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  margin: clamp(2rem, 5vw, 4rem) auto 0;
  padding: clamp(1.2rem, 3vw, 1.8rem);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--radius-md);
  background:
    linear-gradient(135deg, rgba(7, 96, 80, 0.96), rgba(24, 128, 76, 0.9)),
    #076050;
  color: #ffffff;
  box-shadow: none;
  position: relative;
  z-index: 2;

  h2 {
    max-width: 760px;
    margin: 0.45rem 0 0;
    color: #ffffff;
    font-size: clamp(1.35rem, 3vw, 2.35rem);
    line-height: 1.05;
  }

  p {
    max-width: 620px;
    margin: 0.7rem 0 0;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.6;
  }

  & > div > span {
    color: #fff0b8;
  }

  ${PrimaryCta} {
    flex: 0 0 auto;
    background: #ffffff;
    color: #076050;
    border-color: rgba(255, 255, 255, 0.35);
    box-shadow: none;

    &:hover {
      color: #076050;
    }
  }

  @media (max-width: 760px) {
    width: min(calc(100% - 2rem), 1280px);
    align-items: stretch;
    flex-direction: column;
    margin-top: -1rem;
  }
`;

const CategoryTrack = styled.div`
  display: flex;
  width: min(100%, 1280px);
  gap: 0.75rem;
  margin: 0 auto;
  overflow-x: auto;
  padding: 1rem 1.5rem;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const CategoryPill = styled(Link)`
  display: inline-flex;
  min-height: 44px;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.65rem;
  padding: 0 1rem;
  border: 1px solid rgba(7, 96, 80, 0.12);
  border-radius: 999px;
  background: #f8fbf5;
  color: var(--brand-ink);
  font-weight: 900;
  text-decoration: none;

  strong {
    display: inline-grid;
    min-width: 1.55rem;
    height: 1.55rem;
    place-items: center;
    border-radius: 999px;
    background: var(--brand-accent);
    color: #171915;
    font-size: 0.78rem;
  }
`;

const FavoritesSection = styled.section`
  width: min(100%, 1280px);
  margin: 0 auto;
  padding: clamp(4rem, 8vw, 6.5rem) 1.5rem;

  @media (max-width: 520px) {
    padding-inline: 1rem;
  }
`;

const SectionHeader = styled.div`
  max-width: 720px;
  margin-bottom: 2rem;

  h2 {
    margin: 0.35rem 0 0;
    color: var(--brand-ink);
    font-size: clamp(2rem, 5vw, 4rem);
    line-height: 0.98;
  }

  p {
    max-width: 600px;
    margin: 1rem 0 0;
    color: var(--brand-muted);
    font-size: 1rem;
    line-height: 1.65;
  }
`;

const SectionKicker = styled.span`
  color: #6b560a;
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const PopularCarousel = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  align-items: stretch;
  border: 1px solid rgba(234, 208, 120, 0.46);
  border-radius: 28px;
  background:
    radial-gradient(circle at 12% 0%, rgba(253, 205, 67, 0.18), transparent 20rem),
    linear-gradient(180deg, rgba(255, 248, 218, 0.72), rgba(255, 252, 237, 0.5));
  overflow: visible;
  padding: 1rem;

  & > article {
    --product-card-media-bg: transparent;

    border-radius: 18px;
    box-shadow: 0 12px 34px rgba(23, 33, 29, 0.08);
  }

  & > article > button:first-child,
  & > article > div:first-child {
    background: transparent;
  }

  @media (max-width: 1000px) {
    grid-template-columns: none;
    grid-auto-columns: minmax(300px, min(90vw, 420px));
    grid-auto-flow: column;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    padding: 0.85rem 0.85rem 1rem;
    scroll-padding-inline: 0.85rem;
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
    grid-auto-columns: calc(100vw - 4.1rem);
    gap: 0.85rem;
    border-radius: 24px;
    padding: 0.7rem 0.7rem 0.9rem;
    scroll-padding-inline: 0.7rem;
  }
`;

const PopularCarouselDots = styled.div`
  display: none;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.95rem;

  button {
    width: 9px;
    height: 9px;
    border: 1px solid rgba(7, 96, 80, 0.32);
    border-radius: 999px;
    background: rgba(7, 96, 80, 0.12);
    cursor: pointer;
    padding: 0;
    transition: width 180ms ease, background 180ms ease, border-color 180ms ease;
  }

  button:hover,
  button:focus-visible {
    border-color: rgba(123, 175, 75, 0.86);
    outline: none;
  }

  button.active {
    width: 24px;
    border-color: rgba(123, 175, 75, 0.9);
    background: #7baf4b;
  }

  @media (max-width: 1000px) {
    display: flex;
  }
`;

const ChefSpecialBanner = styled.section`
  position: relative;
  display: grid;
  grid-template-columns: minmax(320px, 0.82fr) minmax(0, 1fr);
  width: min(calc(100% - 3rem), 1280px);
  margin: 0 auto clamp(4rem, 8vw, 6.5rem);
  overflow: hidden;
  border: 1px solid rgba(7, 96, 80, 0.14);
  border-radius: var(--radius-md);
  background:
    radial-gradient(circle at 16% 12%, rgba(253, 205, 67, 0.22), transparent 18rem),
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(238, 247, 233, 0.92)),
    #ffffff;
  box-shadow: 0 22px 58px rgba(23, 33, 29, 0.12);

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
  background:
    radial-gradient(circle at center, rgba(253, 205, 67, 0.16), transparent 56%),
    linear-gradient(180deg, #f8faf6, #eef4ec);

  @media (max-width: 860px) {
    min-height: 280px;
  }
`;

const ChefImage = styled.img`
  width: 100%;
  height: min(330px, 45vw);
  max-height: 330px;
  border-radius: var(--radius-md);
  object-fit: contain;
  filter: drop-shadow(0 18px 28px rgba(23, 33, 29, 0.12));

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
    max-width: 650px;
    margin: 0.65rem 0 1rem;
    color: var(--brand-ink);
    font-size: clamp(2rem, 5vw, 4.2rem);
    line-height: 1;
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
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  border: 1px solid #ead078;
  border-radius: 999px;
  background: #f7efd1;
  color: #6b560a;
  padding: 0 0.75rem;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
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
    border-radius: 999px;
    background: #ffffff;
    padding: 0 0.8rem;
    color: #53635b;
    font-size: 0.86rem;
  }

  strong {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    border-radius: 999px;
    background: #fff1f0;
    color: var(--danger);
    padding: 0 0.9rem;
    font-size: 1.25rem;
  }
`;

const TestimonialsSection = styled.section`
  width: min(100%, 1280px);
  margin: 0 auto;
  padding: 0 1.5rem clamp(4rem, 8vw, 6.5rem);
`;

const TestimonialGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const TestimonialCard = styled.article`
  display: flex;
  min-height: 240px;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid rgba(7, 96, 80, 0.12);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 250, 243, 0.92)),
    #ffffff;
  box-shadow: 0 16px 42px rgba(23, 33, 29, 0.08);
  padding: clamp(1.15rem, 3vw, 1.5rem);

  blockquote {
    margin: 1.1rem 0;
    color: var(--brand-ink);
    font-size: clamp(1.05rem, 2vw, 1.25rem);
    font-weight: 750;
    line-height: 1.45;
  }
`;

const ReviewStars = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: #b78b07;
`;

const ReviewMeta = styled.footer`
  display: grid;
  gap: 0.25rem;

  span {
    color: var(--brand-ink);
    font-weight: 900;
  }

  small {
    color: var(--brand-muted);
    font-size: 0.86rem;
    line-height: 1.4;
  }
`;

const ProductReviewLink = styled(Link)`
  color: inherit;
  font-weight: 900;
  text-decoration: none;

  &:hover {
    color: #076050;
  }

  &:focus-visible {
    outline: 3px solid rgba(7, 96, 80, 0.18);
    outline-offset: 2px;
  }
`;

const TestimonialSkeleton = styled.div`
  display: grid;
  min-height: 220px;
  align-content: space-between;
  border: 1px solid rgba(7, 96, 80, 0.1);
  border-radius: 8px;
  background: #ffffff;
  padding: clamp(1.15rem, 3vw, 1.5rem);
`;

export default HomePage;
