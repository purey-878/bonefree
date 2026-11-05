import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { applyPageMetadata } from '../seo/documentMetadata';
import { pageMetadata } from '../seo/metadata';

export default function PageMetadata() {
  const { i18n } = useTranslation();
  const { pathname } = useLocation();
  useEffect(() => {
    applyPageMetadata(pageMetadata(pathname, i18n.resolvedLanguage));
  }, [pathname, i18n.resolvedLanguage]);
  return null;
}
