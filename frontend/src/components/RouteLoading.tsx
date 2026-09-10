import { useTranslation } from 'react-i18next'

export default function RouteLoading() {
  const { t } = useTranslation('common')
  return (
    <div className="route-loading" role="status" aria-label={t('actions.loading')}>
      <div className="route-loading-placeholder route-loading-title" aria-hidden="true" />
      <div className="route-loading-placeholder" aria-hidden="true" />
      <div className="route-loading-placeholder route-loading-content" aria-hidden="true" />
    </div>
  )
}
