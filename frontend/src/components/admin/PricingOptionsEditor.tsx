import { formatSizePrice } from '../../utils/pricing';
import { useTranslation } from 'react-i18next';
import type { CatalogExtra, CatalogPortion } from '../../types/pricing';
import { catalogText, editCatalogTranslation } from '../../utils/catalogTranslations';
import type { CatalogLocale } from '../../utils/catalogTranslations';
import CatalogLanguageTabs from './CatalogLanguageTabs';
import './PricingOptionsEditor.css';

type Option = CatalogPortion | CatalogExtra;

export default function PricingOptionsEditor({ portions = [], extras = [], onPortionsChange, onExtrasChange, locale, onLocaleChange }: {
  portions?: CatalogPortion[]; extras?: CatalogExtra[];
  onPortionsChange: (value: CatalogPortion[]) => void; onExtrasChange: (value: CatalogExtra[]) => void;
  locale: CatalogLocale; onLocaleChange: (locale: CatalogLocale) => void;
}) {
  const { t } = useTranslation('storefront');
  const update = (kind: 'portions' | 'extras', items: Option[]) => {
    const ordered = items.map((item, displayOrder) => ({ ...item, displayOrder }));
    if (kind === 'portions') onPortionsChange(ordered as CatalogPortion[]);
    else onExtrasChange(ordered as CatalogExtra[]);
  };
  return <div className="ad-pricing-editor">
    <CatalogLanguageTabs locale={locale} onChange={onLocaleChange} />
    <p className="ad-section-sub">{t('pricing.editorHelp')}</p>
    {(['portions', 'extras'] as const).map(kind => {
      const items: Option[] = kind === 'portions' ? portions : extras;
      const change = (index: number, next: Option) => update(kind, items.map((item, i) => i === index ? next : item));
      return <section className={`ad-pricing-group ad-pricing-${kind}`} key={kind} aria-label={t(kind === 'portions' ? 'pricing.sizes' : 'pricing.extras')}>
        <h5>{t(kind === 'portions' ? 'pricing.sizes' : 'pricing.extras')}</h5>
        {items.map((option, index) => <article className="ad-pricing-option" key={option.id ?? `new-${index}`}>
          <div className="ad-pricing-fields">
            <label className="ad-field"><span>{t(kind === 'portions' ? 'pricing.sizeLabel' : 'pricing.label')} · {index + 1}</span>
              <input type="text" maxLength={150} lang={locale} placeholder={kind === 'portions' ? '3, 6…' : option.label || t('pricing.label')}
                value={catalogText({ name: option.label }, option.translations, locale).name ?? ''}
                onChange={event => change(index, locale === 'pt-PT' ? { ...option, label: event.target.value }
                  : { ...option, translations: editCatalogTranslation(option.translations, locale, 'name', event.target.value) })} />
            </label>
            <label className="ad-field"><span>{t(kind === 'portions' ? 'pricing.totalPrice' : 'pricing.additionalPrice')} (€)</span>
              <input type="number" min="0" step="0.01" inputMode="decimal" value={'price' in option ? option.price : option.priceDelta}
                onChange={event => change(index, 'price' in option ? { ...option, price: Number(event.target.value) } : { ...option, priceDelta: Number(event.target.value) })} />
            </label>
            {'type' in option && <label className="ad-field"><span>{t('pricing.type')}</span>
              <select value={option.type} onChange={event => change(index, { ...option, type: event.target.value as CatalogExtra['type'] })}>
                <option value="addon">{t('pricing.addon')}</option><option value="replacement">{t('pricing.replacement')}</option>
              </select>
            </label>}
          </div>
          {'price' in option && option.label.trim() && <p className="ad-size-price-preview">{formatSizePrice({ ...option, label: catalogText({ name: option.label }, option.translations, locale).name || option.label })}</p>}
          <div className="ad-pricing-actions">
            <label className="ad-checkbox-row"><input type="checkbox" checked={option.isAvailable} onChange={event => change(index, { ...option, isAvailable: event.target.checked })} />{t('pricing.available')}</label>
            <div className="ad-pricing-order">
              <button type="button" className="ad-btn ad-btn-ghost" aria-label={t('pricing.moveUp', { name: option.label || index + 1 })} disabled={index === 0}
                onClick={() => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; update(kind, next); }}>↑</button>
              <button type="button" className="ad-btn ad-btn-ghost" aria-label={t('pricing.moveDown', { name: option.label || index + 1 })} disabled={index === items.length - 1}
                onClick={() => { const next = [...items]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; update(kind, next); }}>↓</button>
              <button type="button" className="ad-btn ad-btn-ghost" aria-label={t('pricing.removeNamed', { name: option.label || index + 1 })} onClick={() => update(kind, items.filter((_, i) => i !== index))}>{t('pricing.remove')}</button>
            </div>
          </div>
        </article>)}
        <button type="button" className="ad-btn ad-btn-ghost" disabled={items.length >= 30} onClick={() => {
          onLocaleChange('pt-PT');
          update(kind, [...items, kind === 'portions' ? { label: '', price: 0, isAvailable: true } : { label: '', priceDelta: 0, type: 'addon', isAvailable: true }]);
        }}>{t(kind === 'portions' ? 'pricing.addSize' : 'pricing.addExtra')}</button>
      </section>;
    })}
  </div>;
}
