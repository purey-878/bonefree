import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { PublicLegalDocumentResponse } from '../services/legalDocumentService'
import Navbar from '../components/Navbar'
import LegalBody from '../components/legal/LegalBody'
import { personalizeLegalText } from '../components/legal/legalContent'
import { normalizeLocale } from '../i18n'
import { useOrganization } from '../organization/context/organization-context'
import { readLegalDocument, type DocumentType } from '../services/legalDocumentService'
import './Legal.css'

export default function LegalDocumentPage({ documentType }: { documentType: DocumentType }) {
  const { t, i18n } = useTranslation('legal')
  const { organization } = useOrganization()
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? 'pt-PT'
  const key = `${organization.slug}:${documentType}:${locale}`
  const [result, setResult] = useState<{ key: string; data?: PublicLegalDocumentResponse; error?: boolean }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void readLegalDocument(documentType, locale, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key, data })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, error: true })
    })
    return () => controller.abort()
  }, [documentType, locale, key, attempt])
  const current = result?.key === key ? result : undefined
  const data = current?.data
  const page = data?.document
  const privacy = documentType === 'privacy_policy'
  return <main className="legal-page site-page">
    <Navbar />
    {!page || !data ? <section className="legal-hero" aria-live="polite">
      <h1>{t(documentType)}</h1>
      <p role={current?.error ? 'alert' : 'status'}>{t(current?.error ? 'loadError' : 'loading')}</p>
      {current?.error && <button onClick={() => { setResult(undefined); setAttempt(value => value + 1) }}>{t('retry')}</button>}
    </section> : <>
      <section className={`legal-hero ${privacy ? 'legal-hero-privacy' : ''}`} lang={page.locale}>
        <span>{personalizeLegalText(page.eyebrow, data)}</span>
        <h1>{personalizeLegalText(page.title, data)}</h1>
        <p>{personalizeLegalText(page.description, data)}</p>
        <small>{t('updated', { date: new Date(page.updated_at).toLocaleDateString(locale) })}</small>
        {data.is_fallback && <p lang={locale} role="status">{t('fallback')}</p>}
      </section>
      <section className="legal-shell" lang={page.locale} aria-label={page.title}>
        <aside className="legal-summary">
          <strong>{personalizeLegalText(page.summary_title, data)}</strong>
          <p>{personalizeLegalText(page.summary, data)}</p>
          <Link lang={locale} to={privacy ? '/terms' : '/privacy'}>{t(privacy ? 'termsLink' : 'privacyLink')}</Link>
        </aside>
        <LegalBody body={page.body} variables={data} />
      </section>
    </>}
  </main>
}
