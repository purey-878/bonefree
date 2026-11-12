import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { applyApiImageFallback, productImageFallback } from '../utils/imageFallback';
import './ProductImageLightbox.css';

export default function ProductImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation('common');

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

  return <dialog ref={dialog} className="product-image-lightbox" aria-label={alt}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <button type="button" className="product-image-lightbox-close" aria-label={t('dialog.close')} onClick={onClose} autoFocus><X size={24} /></button>
    <img src={src} alt={alt} onError={event => applyApiImageFallback(event.currentTarget, productImageFallback)} />
  </dialog>;
}
