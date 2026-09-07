import { useId, useMemo, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Node, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { useTranslation } from 'react-i18next'
import type { LegalDocumentWrite, LegalNodeInput } from '../../services/legalDocumentService'
import type { DocumentLocale, DocumentType } from '../../services/legalDocumentService'
import { emptyLegalDocument, legalDocumentHasText, personalizeLegalText, safeLegalLink, type LegalVariables } from './legalContent'
import type { LegalDocumentsState } from './useLegalDocuments'
import LegalBody from './LegalBody'
import LegalEditorToolbar from './LegalEditorToolbar'
import CustomSelect from '../ui/CustomSelect'
import './LegalDocumentEditor.css'

const locales: { code: DocumentLocale; label: string }[] = [
  { code: 'pt-PT', label: 'Português' }, { code: 'en-GB', label: 'English' }, { code: 'de-DE', label: 'Deutsch' },
]

function RichTextEditor({ body, variables, onChange, disabled }: {
  body: LegalNodeInput; variables: LegalVariables; onChange: (body: LegalNodeInput) => void; disabled: boolean
}) {
  const { t } = useTranslation('legal')
  const [link, setLink] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkError, setLinkError] = useState(false)
  const variableExtension = useMemo(() => Node.create({
    name: 'organizationVariable', group: 'inline', inline: true, atom: true,
    addAttributes: () => ({ name: { default: 'organization_name' } }),
    parseHTML: () => [{ tag: 'span[data-organization-variable]', getAttrs: element => ({ name: element.getAttribute('data-organization-variable') }) }],
    renderHTML: ({ node }) => ['span', { 'data-organization-variable': node.attrs.name, class: 'legal-variable' }, variables[node.attrs.name as keyof LegalVariables] ?? ''],
    renderText: ({ node }) => variables[node.attrs.name as keyof LegalVariables] ?? '',
  }), [variables])
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, blockquote: false, code: false, codeBlock: false,
      horizontalRule: false, strike: false, underline: false, link: { openOnClick: false, autolink: false, defaultProtocol: 'https',
        isAllowedUri: url => Boolean(safeLegalLink(url)) } }), variableExtension],
    content: JSON.parse(JSON.stringify(body, (_key, value) => value === null ? undefined : value)) as JSONContent,
    editable: !disabled,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { 'aria-label': t('body'), role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: current }) => onChange(current.getJSON() as LegalNodeInput),
  }, [variableExtension, disabled])
  if (!editor) return null
  return <div className="legal-rich-editor">
    <LegalEditorToolbar editor={editor} variables={variables} disabled={disabled} linkOpen={linkOpen}
      onLink={() => { setLink(editor.getAttributes('link').href ?? ''); setLinkError(false); setLinkOpen(!linkOpen) }} />
    {linkOpen && <div className="legal-link-form">
      <label>{t('linkUrl')}<input type="url" value={link} onChange={event => { setLink(event.target.value); setLinkError(false) }} /></label>
      <button type="button" onClick={() => {
        const href = safeLegalLink(link)
        if (!href) { setLinkError(true); return }
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
        setLinkOpen(false)
      }}>{t('applyLink')}</button>
      <button type="button" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkOpen(false) }}>{t('removeLink')}</button>
      {linkError && <p role="alert">{t('invalidLink')}</p>}
    </div>}
    <EditorContent editor={editor} />
  </div>
}

function TranslationEditor({ documentType, locale, state }: { documentType: DocumentType; locale: DocumentLocale; state: LegalDocumentsState }) {
  const { t } = useTranslation('legal')
  const [preview, setPreview] = useState(false)
  const key = `${documentType}:${locale}`
  const document = state.drafts[key] ?? state.documents[key] ?? emptyLegalDocument()
  const dirty = Boolean(state.drafts[key]) && JSON.stringify(state.drafts[key]) !== JSON.stringify(state.documents[key])
  const update = (patch: Partial<LegalDocumentWrite>) => state.update(key, { ...document, ...patch })
  const variables = state.variables
  const field = (name: 'title' | 'eyebrow' | 'description' | 'summary_title' | 'summary', maxLength: number) => {
    const props = { value: personalizeLegalText(document[name], variables), maxLength, disabled: Boolean(state.saving),
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        let value = event.target.value
        for (const variable of ['organization_name', 'organization_contact'] as const) {
          if (variables[variable]) value = value.split(variables[variable]).join(`{{${variable}}}`)
        }
        update({ [name]: value })
      } }
    return <label>{t(name)}{name === 'description' || name === 'summary' ? <textarea {...props} rows={3} /> : <input {...props} required={name === 'title'} />}</label>
  }
  return <div className="legal-translation-editor">
    {!state.documents[key] && <p>{t('missingTranslation')}</p>}
    <div className="legal-editor-actions">
      <span role="status">{t(dirty ? 'unsaved' : state.saved === key ? 'saved' : 'published')}</span>
      <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setPreview(!preview)}>{t(preview ? 'edit' : 'preview')}</button>
    </div>
    {preview ? <div className="legal-editor-preview" lang={locale}>
      <h2>{personalizeLegalText(document.title, variables)}</h2><p>{personalizeLegalText(document.description, variables)}</p>
      <aside><strong>{personalizeLegalText(document.summary_title, variables)}</strong><p>{personalizeLegalText(document.summary, variables)}</p></aside>
      <LegalBody body={document.body} variables={variables} />
    </div> : <div lang={locale}>
      <div className="legal-editor-fields">{field('title', 200)}{field('eyebrow', 200)}{field('description', 3000)}{field('summary_title', 200)}{field('summary', 5000)}</div>
      <p>{t('variablesHelp')}</p>
      <RichTextEditor body={document.body} variables={variables} disabled={Boolean(state.saving)} onChange={body => update({ body })} />
    </div>}
    {state.saveError === key && <p role="alert" className="data-privacy-error">{t('saveError')}</p>}
    <button type="button" className="ad-btn ad-btn-primary" disabled={!dirty || Boolean(state.saving) || !document.title.trim() || !legalDocumentHasText(document.body)}
      onClick={() => void state.save(documentType, locale, document)}>{t(state.saving === key ? 'saving' : 'save')}</button>
  </div>
}

export default function LegalDocumentEditor({ documentType, state }: { documentType: DocumentType; state: LegalDocumentsState }) {
  const { t } = useTranslation('legal')
  const [locale, setLocale] = useState<DocumentLocale>('en-GB')
  const localeSelectId = useId()
  return <section className="ad-card data-privacy-section legal-document-editor">
    <h3>{t(documentType)}</h3>
    {state.error ? <p role="alert">{t('loadError')} <button type="button" onClick={state.retry}>{t('retry')}</button></p>
      : !state.loaded ? <p role="status">{t('loading')}</p> : <>
        <div className="legal-language-field">
          <label htmlFor={localeSelectId}>{t('language')}</label>
          <CustomSelect id={localeSelectId} aria-label={t('language')} value={locale} disabled={Boolean(state.saving)}
            menuMinWidth={220} menuClassName="legal-language-menu" options={locales.map(item => ({ value: item.code, label: item.label }))}
            onChange={value => setLocale(value as DocumentLocale)} />
        </div>
        <TranslationEditor key={locale} documentType={documentType} locale={locale} state={state} />
      </>}
  </section>
}
