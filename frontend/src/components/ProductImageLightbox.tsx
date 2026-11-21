import { useEffect, useId, useRef } from 'react';
import { ArrowUpRight, ImageIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { applyApiImageFallback, productImageFallback } from '../utils/imageFallback';
import './ProductImageLightbox.css';

export default function ProductImageLightbox({ src, alt, description, detailsHref, onClose }: {
  src: string;
  alt: string;
  description?: string | null;
  detailsHref?: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation(['common', 'storefront']);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className="product-image-lightbox" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <div className="product-image-lightbox-panel">
      <header className="product-image-lightbox-heading">
        <span className="product-image-lightbox-mark" aria-hidden="true"><ImageIcon size={20} /></span>
        <h2 id={titleId}>{alt}</h2>
        <button type="button" className="product-image-lightbox-close" aria-label={t('dialog.close')} onClick={onClose} autoFocus><X size={21} aria-hidden="true" /></button>
      </header>
      <div className="product-image-lightbox-media"><img src={src} alt={alt} onError={event => applyApiImageFallback(event.currentTarget, productImageFallback)} /></div>
      {(description || detailsHref) && <div className="product-image-lightbox-footer">
        {description && <p>{description}</p>}
        {detailsHref && <Link className="product-image-lightbox-details" to={detailsHref} onClick={onClose}>{t('productCard.viewDetails', { ns: 'storefront' })}<ArrowUpRight size={19} aria-hidden="true" /></Link>}
      </div>}
    </div>
  </dialog>;
}
