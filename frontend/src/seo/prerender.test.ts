import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { PUBLIC_PATHS } from './metadata'

describe('styled initial pages', () => {
  let server: ViteDevServer
  let render: (path: string) => Promise<{ html: string; styles: string }>

  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      ssr: { noExternal: ['styled-components'] },
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    })
    render = (await server.ssrLoadModule('/src/prerender.tsx')).renderInitialPage
  }, 30000)

  afterAll(async () => { await server?.close() })

  it('renders the real public layouts and navigation without executing API effects', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network during prerender'))
    try {
      for (const path of PUBLIC_PATHS) {
        const { html, styles } = await render(path)
        expect(html).toMatch(/<h1[\s>]/)
        expect(html).toContain(`class="app-route-stage${path === '/' ? ' app-route-stage--home' : ''}"`)
        expect(html).toContain('<header')
        expect(html).toContain('href="/menu"')
        expect(styles).toContain('<style data-initial-styles>')
        expect(styles).toContain('#root[data-initial-render] .')
        expect(styles).toContain(':root{--brand-main:')
        expect(styles).not.toContain('#root[data-initial-render] :root')
        expect(styles).not.toMatch(/<style data-styled=/)
      }
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally { fetchSpy.mockRestore() }
  })

  it('keeps the homepage hero and avoids introducing a separate text-only SEO view', async () => {
    const { html, styles } = await render('/')
    expect(html).toContain('Abrir menu')
    expect(html).toContain('Pratos vegetais')
    expect(html).not.toContain('<nav aria-label="Bonefree">')
    expect(styles).toContain('hero-banner')
  })
})
