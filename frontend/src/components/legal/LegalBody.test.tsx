import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LegalBody from './LegalBody'
import { legalDocumentHasText, personalizeLegalText } from './legalContent'
import type { LegalNodeInput } from '../../services/legalDocumentService'

describe('legal document rendering', () => {
  it('resolves organisation variables without treating content as HTML', () => {
    const body: LegalNodeInput = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: '<script>alert(1)</script>' },
      { type: 'organizationVariable', attrs: { name: 'organization_contact' } },
    ] }] }
    const html = renderToStaticMarkup(<LegalBody body={body} variables={{ organization_name: 'Company', organization_contact: 'new@example.com' }} />)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('new@example.com')
    expect(personalizeLegalText('{{organization_name}} / {{organization_contact}}', { organization_name: 'Company', organization_contact: 'new@example.com' })).toBe('Company / new@example.com')
  })

  it('renders formatting and rejects unsafe links even in an unexpected response', () => {
    const body: LegalNodeInput = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'unsafe', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
      { type: 'text', text: 'safe', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }] },
    ] }] }
    const html = renderToStaticMarkup(<LegalBody body={body} variables={{ organization_name: '', organization_contact: '' }} />)
    expect(html).not.toContain('javascript:')
    expect(html).toContain('<strong>safe</strong>')
    expect(html).toContain('href="https://example.com"')
    expect(legalDocumentHasText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(false)
  })
})
