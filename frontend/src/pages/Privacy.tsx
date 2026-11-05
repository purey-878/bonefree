import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './Privacy.css';

export default function Privacy() {
  const { t } = useTranslation('storefront');
  return <><Navbar /><main className="privacy-page">
    <h1>{t('privacy.title')}</h1>
    <p>{t('privacy.intro')}</p>
    <h2>{t('privacy.storageTitle')}</h2><p>{t('privacy.storage')}</p>
    <h2>{t('privacy.adminTitle')}</h2><p>{t('privacy.admin')}</p>
    <h2>{t('privacy.externalTitle')}</h2><p>{t('privacy.external')}</p>
    <h2>{t('privacy.controlTitle')}</h2><p>{t('privacy.control')}</p>
    <p><Link to="/contact">{t('privacy.contact')}</Link></p>
  </main></>;
}
