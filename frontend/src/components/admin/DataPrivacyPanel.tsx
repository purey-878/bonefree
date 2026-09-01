import { useCallback, useEffect, useState } from 'react'
import { Download, RefreshCw, Trash2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import CustomSelect from '../ui/CustomSelect'
import ConfirmDialog from '../ui/ConfirmDialog'
import { useToast } from '../ui/toastContext'
import type {
  DataExportResponse,
  OrganizationDataExportKind,
  PrivacyOverviewResponse,
} from '../../services/dataPrivacyService'
import {
  cancelDataExport,
  createOrganizationDataExport,
  downloadDataExport,
  getPrivacyOverview,
  getPrivacyProfile,
  listDataExports,
  regenerateDataExport,
  updatePrivacyContact,
} from '../../services/dataPrivacyService'
import './DataPrivacyPanel.css'


function formatDate(value: string | null | undefined, locale: string): string {
  return value ? new Date(value).toLocaleString(locale) : '—'
}


type DataPrivacyPanelProps = {
  focusExportQueueRequest?: number
}


export default function DataPrivacyPanel({ focusExportQueueRequest = 0 }: DataPrivacyPanelProps) {
  const { t, i18n } = useTranslation('admin')
  const [overview, setOverview] = useState<PrivacyOverviewResponse | null>(null)
  const [exports, setExports] = useState<DataExportResponse[]>([])
  const [privacyEmail, setPrivacyEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmCompleteCopy, setConfirmCompleteCopy] = useState(false)
  const [exportToRemove, setExportToRemove] = useState<DataExportResponse | null>(null)
  const [selectedExportKind, setSelectedExportKind] = useState<OrganizationDataExportKind>('tenant')
  const toast = useToast()

  const refresh = useCallback(async () => {
    try {
      const [nextOverview, nextExports, profile] = await Promise.all([
        getPrivacyOverview(),
        listDataExports(),
        getPrivacyProfile(),
      ])
      setOverview(nextOverview)
      setExports(nextExports)
      setPrivacyEmail(profile.privacy_contact_email || '')
      setError(null)
    } catch {
      setError(t('privacy.errors.load'))
    }
  }, [t])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (focusExportQueueRequest <= 0) return
    document.getElementById('data-export-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusExportQueueRequest])

  const hasExportBeingPrepared = exports.some((item) => item.status === 'pending' || item.status === 'processing')
  const organizationExportKinds: OrganizationDataExportKind[] = ['tenant', 'customers', 'orders', 'catalog', 'media']
  const activeOrganizationExports = exports.filter((item) => (
    item.kind !== 'customer'
    && (
      item.status === 'pending'
      || item.status === 'processing'
      || (item.status === 'ready' && Boolean(item.expires_at) && new Date(item.expires_at as string).getTime() > Date.now())
      || (item.status === 'cancelled' && Boolean(item.expires_at) && new Date(item.expires_at as string).getTime() > Date.now())
    )
  ))
  const visibleExports = exports.filter((item) => item.status !== 'cancelled')
  const isExportKindBlocked = (kind: OrganizationDataExportKind) => (
    kind === 'tenant'
      ? activeOrganizationExports.length > 0
      : activeOrganizationExports.some((item) => item.kind === 'tenant' || item.kind === kind)
  )
  const selectedExportBlocked = isExportKindBlocked(selectedExportKind)
  const selectedExportPreparing = activeOrganizationExports.some((item) => (
    item.kind === selectedExportKind && (item.status === 'pending' || item.status === 'processing')
  ))
  useEffect(() => {
    if (!hasExportBeingPrepared) return
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => window.clearInterval(timer)
  }, [hasExportBeingPrepared, refresh])

  const run = async (action: () => Promise<unknown>, successMessage?: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
      if (successMessage) toast.success(successMessage)
    } catch {
      setError(t('privacy.errors.action'))
    } finally {
      setBusy(false)
    }
  }

  const exportStatusLabel = (status: DataExportResponse['status']) => t(`privacy.exports.status.${status}`)
  const exportKindLabel = (item: DataExportResponse) => (
    item.kind === 'customer'
      ? t('privacy.exports.customerCopy', { id: item.customer_id })
      : t(`privacy.exports.kind.${item.kind}`)
  )
  const exportKindOptions = organizationExportKinds.map((kind) => {
    const disabled = isExportKindBlocked(kind)
    return {
      value: kind,
      label: disabled
        ? t('privacy.exports.optionUnavailable', { option: t(`privacy.exports.kind.${kind}`) })
        : t(`privacy.exports.kind.${kind}`),
      disabled,
    }
  })

  return (
    <div className="ad-content data-privacy-panel">
      <div className="ad-section-bar">
        <div>
          <h2 className="ad-section-title">{t('privacy.title')}</h2>
          <p className="ad-section-sub">{t('privacy.intro')}</p>
        </div>
        <button className="ad-btn ad-btn-ghost" disabled={busy} onClick={() => void refresh()}>
          <RefreshCw size={16} /> {t('privacy.refresh')}
        </button>
      </div>

      {error && <div className="data-privacy-error" role="alert">{error}</div>}

      <section className="ad-card data-privacy-section">
        <h3>{t('privacy.contact.title')}</h3>
        <p>{t('privacy.contact.description')}</p>
        <form className="data-privacy-inline-form" onSubmit={(event) => {
          event.preventDefault()
          void run(() => updatePrivacyContact(privacyEmail), t('privacy.contact.saved'))
        }}>
          <input
            aria-label={t('privacy.contact.fieldLabel')}
            placeholder={t('privacy.contact.placeholder')}
            type="email"
            value={privacyEmail}
            onChange={(event) => setPrivacyEmail(event.target.value)}
            required
          />
          <button className="ad-btn ad-btn-primary" disabled={busy}>{t('privacy.contact.save')}</button>
        </form>
      </section>

      <section className="ad-card data-privacy-section">
        <div className="data-privacy-heading-row">
          <div>
            <h3>{t('privacy.exports.title')}</h3>
            <p>{t('privacy.exports.description')}</p>
            <small>{t('privacy.exports.explanation')}</small>
          </div>
          <div className="data-privacy-export-controls">
            <CustomSelect
              aria-label={t('privacy.exports.selectLabel')}
              className="data-privacy-export-type"
              menuClassName="data-privacy-export-type-menu"
              menuMinWidth={390}
              value={selectedExportKind}
              onChange={(value) => setSelectedExportKind(String(value) as OrganizationDataExportKind)}
              options={exportKindOptions}
            />
            <button
              className="ad-btn ad-btn-primary"
              disabled={busy || selectedExportBlocked}
              onClick={() => setConfirmCompleteCopy(true)}
            >
              {selectedExportPreparing
                ? t('privacy.exports.preparing')
                : selectedExportBlocked
                  ? t('privacy.exports.selectionUnavailable')
                  : t('privacy.exports.prepare')}
            </button>
          </div>
        </div>
        <div id="data-export-queue" className="data-privacy-queue-heading">
          <h4>{t('privacy.exports.queueTitle')}</h4>
          <p>{t('privacy.exports.queueDescription')}</p>
        </div>
        <div className="data-privacy-list">
          {visibleExports.length === 0 && <p>{t('privacy.exports.empty')}</p>}
          {visibleExports.map((item) => (
            <article key={item.export_id}>
              <div>
                <strong>{exportKindLabel(item)}</strong>
                <span className={`data-privacy-status is-${item.status}`}>{exportStatusLabel(item.status)}</span>
                <span>{t('privacy.exports.requestedAt', { date: formatDate(item.created_at, i18n.language) })}</span>
                {item.can_download && item.expires_at && (
                  <span>{t('privacy.exports.availableUntil', { date: formatDate(item.expires_at, i18n.language) })}</span>
                )}
                {item.downloaded_at && (
                  <span>{t('privacy.exports.lastDownloadedAt', { date: formatDate(item.downloaded_at, i18n.language) })}</span>
                )}
              </div>
              <div className="data-privacy-actions">
                {item.can_download && (
                  <button
                    className="ad-btn ad-btn-sm ad-btn-primary"
                    onClick={() => void run(() => downloadDataExport(item), t('privacy.exports.downloadStarted'))}
                  >
                    <Download size={15} /> {t('privacy.exports.download')}
                  </button>
                )}
                {(item.status === 'pending' || item.status === 'processing') && (
                  <button
                    className="ad-btn ad-btn-sm ad-btn-danger"
                    disabled={busy}
                    onClick={() => setExportToRemove(item)}
                  >
                    <XCircle size={15} /> {t('privacy.exports.cancelCopy')}
                  </button>
                )}
                {item.can_download && (
                  <button
                    className="ad-btn ad-btn-sm ad-btn-danger"
                    disabled={busy}
                    onClick={() => setExportToRemove(item)}
                  >
                    <Trash2 size={15} /> {t('privacy.exports.deleteFile')}
                  </button>
                )}
                {!item.can_download && item.kind === 'customer' && item.status !== 'pending' && item.status !== 'processing' && (
                  <button
                    className="ad-btn ad-btn-sm ad-btn-ghost"
                    onClick={() => void run(() => regenerateDataExport(item.export_id), t('privacy.exports.started'))}
                  >
                    {t('privacy.exports.prepareAgain')}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {overview?.access_expires_at && (
        <section className="ad-card data-privacy-section data-privacy-instruction">
          <h3>{t('privacy.deletion.title')}</h3>
          <div className="data-privacy-deadlines">
            <strong>{t('privacy.deletion.normalAccessUntil', {
              date: formatDate(overview.access_expires_at, i18n.language),
            })}</strong>
          </div>
          <p>{t('privacy.deletion.downloadResponsibility')}</p>
          <p>{t('privacy.deletion.afterDeadline')}</p>
        </section>
      )}

      <ConfirmDialog
        open={confirmCompleteCopy}
        title={t('privacy.exports.confirmTitle', { selection: t(`privacy.exports.kind.${selectedExportKind}`) })}
        description={t('privacy.exports.confirmDescription', { selection: t(`privacy.exports.kind.${selectedExportKind}`) })}
        confirmText={t('privacy.exports.confirmButton')}
        cancelText={t('privacy.exports.confirmCancel')}
        loading={busy}
        onCancel={() => setConfirmCompleteCopy(false)}
        onConfirm={() => {
          setConfirmCompleteCopy(false)
          void run(() => createOrganizationDataExport(selectedExportKind), t('privacy.exports.started'))
        }}
      />
      <ConfirmDialog
        open={Boolean(exportToRemove)}
        title={exportToRemove?.status === 'ready'
          ? t('privacy.exports.deleteTitle')
          : t('privacy.exports.cancelTitle')}
        description={exportToRemove?.status === 'ready'
          ? t('privacy.exports.deleteDescription')
          : t('privacy.exports.cancelDescription')}
        confirmText={exportToRemove?.status === 'ready'
          ? t('privacy.exports.deleteConfirm')
          : t('privacy.exports.cancelConfirm')}
        cancelText={t('privacy.exports.keepCopy')}
        danger
        loading={busy}
        onCancel={() => setExportToRemove(null)}
        onConfirm={() => {
          if (!exportToRemove) return
          const selected = exportToRemove
          const successMessage = selected.status === 'ready'
            ? t('privacy.exports.deleted')
            : t('privacy.exports.cancelled')
          setExportToRemove(null)
          void run(() => cancelDataExport(selected.export_id), successMessage)
        }}
      />
    </div>
  )
}
