import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Product } from '../types/product';
import { formatProductPrices } from '../utils/pricing';
import { primaryProductMediaUrl } from '../utils/productMedia';
import { applyApiImageFallback, productImageFallback, resolveProductImageUrl } from '../utils/imageFallback';
import './HeroFoodCarousel.css';

export default function HeroFoodCarousel({ products, loading }: { products: Product[]; loading: boolean }) {
  const { t } = useTranslation('storefront');
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const show = (index: number, smooth = true) => {
    const element = track.current;
    if (!element) return;
    element.scrollTo({ left: index * element.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
  };
  useEffect(() => {
    if (loading || paused || products.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      const element = track.current;
      if (!document.hidden && element && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const next = (Math.round(element.scrollLeft / element.clientWidth) + 1) % products.length;
        element.scrollTo({ left: next * element.clientWidth, behavior: 'smooth' });
      }
    }, 4500);
    return () => window.clearInterval(timer);
  }, [loading, paused, products.length]);
  return <aside className="hero-food-carousel" aria-label={t('home.featuredDish')} onMouseEnter={() => setPaused(true)} onFocusCapture={() => setPaused(true)}>
    {loading || products.length === 0 ? <p className="hero-food-empty" role="status">{t('home.highlightsPreparing')}</p> : <>
      <div className="hero-food-track" ref={track} onPointerDown={() => setPaused(true)} onScroll={() => {
        const element = track.current;
        if (element) setActive(Math.round(element.scrollLeft / element.clientWidth));
      }}>
        {products.map(product => <Link className="hero-food-slide" key={product.id} to={`/product/${product.id}`}>
          <img src={resolveProductImageUrl(primaryProductMediaUrl(product.media, 'card'), productImageFallback)} alt={product.name} onError={event => applyApiImageFallback(event.currentTarget, productImageFallback)} decoding="async" />
          <div className="hero-food-meta"><span>{product.category}</span><strong>{formatProductPrices(product)}</strong></div>
          <h2>{product.name}</h2>
          <p>{product.description || t('home.fallbackDescription')}</p>
        </Link>)}
      </div>
      {products.length > 1 && <div className="hero-food-controls">
        <div className="hero-food-dots" aria-label={t('home.chooseFeatured')}>
          {products.map((product, index) => <button type="button" key={product.id} aria-label={t('home.showProduct', { name: product.name })} aria-current={active === index ? 'true' : undefined} onClick={() => { setPaused(true); show(index, !window.matchMedia('(prefers-reduced-motion: reduce)').matches); }}><span /></button>)}
        </div>
        <button className="hero-food-play" type="button" aria-label={t(paused ? 'home.resumeHighlights' : 'home.pauseHighlights')} onClick={() => setPaused(value => !value)}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>
      </div>}
    </>}
  </aside>;
}
