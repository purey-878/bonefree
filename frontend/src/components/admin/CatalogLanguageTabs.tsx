import { useTranslation } from 'react-i18next';
import type { CatalogLocale } from '../../utils/catalogTranslations';

const languages: Array<{ value: CatalogLocale; label: string }> = [
  { value: 'pt-PT', label: 'Português' },
  { value: 'en-GB', label: 'English' },
  { value: 'de-DE', label: 'Deutsch' },
];
export default function CatalogLanguageTabs({ locale, onChange }: { locale: CatalogLocale; onChange: (locale: CatalogLocale) => void }) {
  const { t } = useTranslation('admin');
  return <div className="ad-catalog-languages">
    <div className="ad-catalog-language-options" role="group" aria-label={t('catalogTranslation.language')}>
      {languages.map(language => <button key={language.value} type="button" className={`ad-btn ad-btn-sm ${locale === language.value ? 'ad-btn-primary' : 'ad-btn-ghost'}`} aria-pressed={locale === language.value} onClick={() => onChange(language.value)}>{language.label}</button>)}
    </div>
    <p className="ad-section-sub">{t(locale === 'pt-PT' ? 'catalogTranslation.original' : 'catalogTranslation.fallback')}</p>
  </div>;
}
