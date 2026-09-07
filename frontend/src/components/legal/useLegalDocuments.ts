import { useCallback, useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LegalDocumentWrite } from '../../services/legalDocumentService'
import { listLegalDocuments, publishLegalDocument, type DocumentLocale, type DocumentType } from '../../services/legalDocumentService'
import { documentForEditing, type LegalVariables } from './legalContent'

export function useLegalDocuments() {
  const { t } = useTranslation('legal')
  const [documents, setDocuments] = useState<Record<string, LegalDocumentWrite>>({})
  const [drafts, setDrafts] = useState<Record<string, LegalDocumentWrite>>({})
  const [variables, setVariables] = useState<LegalVariables>({ organization_name: '', organization_contact: '' })
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const dirty = Object.entries(drafts).some(([key, draft]) => JSON.stringify(draft) !== JSON.stringify(documents[key]))
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
  useEffect(() => {
    let active = true
    void listLegalDocuments().then(result => {
      if (!active) return
      setDocuments(Object.fromEntries(result.items.map(item => [`${item.document_type}:${item.locale}`, documentForEditing(item)])))
      setVariables(result)
      setLoaded(true)
      setError(false)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [attempt])
  const update = (key: string, value: LegalDocumentWrite) => {
    setDrafts(previous => ({ ...previous, [key]: value }))
    setSaved(null)
  }
  const save = async (type: DocumentType, locale: DocumentLocale, draft: LegalDocumentWrite) => {
    const key = `${type}:${locale}`
    setSaving(key)
    setSaveError(null)
    try {
      const result = documentForEditing(await publishLegalDocument(type, locale, draft))
      setDocuments(previous => ({ ...previous, [key]: result }))
      setDrafts(previous => ({ ...previous, [key]: result }))
      setSaved(key)
    } catch { setSaveError(key) }
    finally { setSaving(null) }
  }
  const updateContact = useCallback((contact: string) => setVariables(previous => ({ ...previous, organization_contact: contact })), [])
  return { documents, drafts, variables, loaded, error, retry: () => setAttempt(value => value + 1), update,
    save, saving, saveError, saved, dirty, blocker, updateContact, leaveMessage: t('leaveDescription') }
}

export type LegalDocumentsState = ReturnType<typeof useLegalDocuments>
