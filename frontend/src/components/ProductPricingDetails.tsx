import { useTranslation } from 'react-i18next';
import type { CatalogExtra, CatalogPortion } from '../types/pricing';
import { formatEuro } from '../utils/money';
import './ProductPricingDetails.css';

export default function ProductPricingDetails({ portions = [], extras = [] }: { portions?: CatalogPortion[]; extras?: CatalogExtra[] }) {
  const { t } = useTranslation('storefront');
  const groups = [
    { title: t('pricing.sizes'), items: portions.map(option => ({ ...option, amount: formatEuro(option.price) })) },
    { title: t('pricing.upgrades'), items: extras.filter(option => option.type === 'replacement').map(option => ({ ...option, amount: `+${formatEuro(option.priceDelta)}` })) },
    { title: t('pricing.optionalExtras'), items: extras.filter(option => option.type === 'addon').map(option => ({ ...option, amount: `+${formatEuro(option.priceDelta)}` })) },
  ];
  return <>{groups.filter(group => group.items.length).map(group => (
    <section className="pd-pricing-options" key={group.title} aria-label={group.title}>
      <h2>{group.title}</h2>
      <dl>{group.items.map((option, index) => <div key={option.id ?? index} className={!option.isAvailable ? 'is-unavailable' : undefined}>
        <dt>{option.label}{!option.isAvailable && <small>{t('pricing.unavailable')}</small>}</dt>
        <dd>{option.amount}</dd>
      </div>)}</dl>
    </section>
  ))}</>;
}
