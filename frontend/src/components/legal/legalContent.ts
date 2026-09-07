import type { LegalDocumentWrite, LegalNodeInput } from '../../services/legalDocumentService'

export type LegalVariables = { organization_name: string; organization_contact: string }
export const personalizeLegalText = (text: string | undefined, variables: LegalVariables) =>
  (text ?? '').replace(/\{\{(organization_name|organization_contact)\}\}/g, (_, name: keyof LegalVariables) => variables[name])

export function safeLegalLink(href: string | null | undefined): string | undefined {
  if (!href || /[\s\\]/.test(href) || [...href].some(char => char.charCodeAt(0) < 32)) return undefined
  try {
    const url = new URL(href)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? href : undefined
  } catch { return undefined }
}

export const emptyLegalDocument = (): LegalDocumentWrite => ({
  title: '', eyebrow: '', description: '', summary_title: '', summary: '', body: { type: 'doc', content: [{ type: 'paragraph' }] },
})

export function legalDocumentHasText(node: LegalNodeInput): boolean {
  return (node.type === 'text' && Boolean(node.text?.trim())) || (node.content ?? []).some(legalDocumentHasText)
}

export function documentForEditing(document: LegalDocumentWrite): LegalDocumentWrite {
  return { title: document.title, eyebrow: document.eyebrow ?? '', description: document.description ?? '',
    summary_title: document.summary_title ?? '', summary: document.summary ?? '', body: document.body }
}
