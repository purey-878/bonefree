// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider, type RouterProviderProps } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLegalDocuments, type LegalDocumentsState } from './useLegalDocuments'
import { listLegalDocuments, publishLegalDocument } from '../../services/legalDocumentService'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../services/legalDocumentService', () => ({ listLegalDocuments: vi.fn(), publishLegalDocument: vi.fn() }))

let state: LegalDocumentsState
let root: Root
let router: RouterProviderProps['router']
const body = { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Original policy' }] }] }
const original = { title: 'Original', body, document_type: 'privacy_policy' as const, locale: 'en-GB' as const, updated_at: '2026-08-29T00:00:00' }
function Harness() {
  const current = useLegalDocuments()
  useEffect(() => { state = current }, [current])
  return <div>{current.loaded ? 'loaded' : 'loading'}</div>
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(listLegalDocuments).mockResolvedValue({ items: [original], organization_name: 'Company', organization_contact: 'mail@example.com' })
  root = createRoot(document.createElement('div'))
  router = createMemoryRouter([{ path: '/', element: <Harness /> }, { path: '/away', element: <p>Away</p> }])
  await act(async () => root.render(<RouterProvider router={router} />))
})
afterEach(async () => { await act(async () => root.unmount()); router.dispose(); vi.resetAllMocks() })

describe('legal document drafts', () => {
  it('keeps missing translations empty and preserves independent language drafts after a failed save', async () => {
    expect(state.documents['privacy_policy:pt-PT']).toBeUndefined()
    await act(async () => {
      state.update('privacy_policy:pt-PT', { title: 'Português', body })
      state.update('privacy_policy:de-DE', { title: 'Deutsch', body })
    })
    vi.mocked(publishLegalDocument).mockRejectedValue(new Error('offline'))
    await act(async () => state.save('privacy_policy', 'pt-PT', state.drafts['privacy_policy:pt-PT']))
    expect(state.drafts['privacy_policy:pt-PT'].title).toBe('Português')
    expect(state.drafts['privacy_policy:de-DE'].title).toBe('Deutsch')
    expect(state.saveError).toBe('privacy_policy:pt-PT')
    expect(state.dirty).toBe(true)
  })

  it('blocks navigation and browser unload until the owner discards changes', async () => {
    await act(async () => state.update('privacy_policy:en-GB', { title: 'Changed', body }))
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await act(async () => { await router.navigate('/away') })
    expect(state.blocker.state).toBe('blocked')
    await act(async () => state.blocker.reset?.())
    expect(router.state.location.pathname).toBe('/')
    expect(state.drafts['privacy_policy:en-GB'].title).toBe('Changed')
    await act(async () => { await router.navigate('/away') })
    await act(async () => state.blocker.proceed?.())
    expect(router.state.location.pathname).toBe('/away')
  })

  it('clears the pending state after publishing and retains dynamic contact references', async () => {
    await act(async () => state.update('privacy_policy:en-GB', { title: 'Changed', body }))
    vi.mocked(publishLegalDocument).mockResolvedValue({ ...original, title: 'Changed' })
    await act(async () => state.save('privacy_policy', 'en-GB', state.drafts['privacy_policy:en-GB']))
    expect(state.dirty).toBe(false)
    await act(async () => state.updateContact('updated@example.com'))
    expect(state.variables.organization_contact).toBe('updated@example.com')
    expect(state.dirty).toBe(false)
  })
})
