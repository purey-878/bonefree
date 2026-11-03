import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

export default function AdminAccessDenied() {
  const { t } = useTranslation('account');
  const navigate = useNavigate();
  const logout = () => {
    for (const key of ['admin_token', 'admin_role', 'admin_name']) localStorage.removeItem(key);
    navigate('/admin/login', { replace: true });
  };
  return <main className="auth-container"><section className="auth-card">
    <h1>{t('admin.accessDenied')}</h1>
    <p>{t('admin.contentAccessOnly')}</p>
    <button className="auth-btn" type="button" onClick={logout}>{t('admin.signOut')}</button>
    <Link to="/">{t('admin.backToSite')}</Link>
  </section></main>;
}
