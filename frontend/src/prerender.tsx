// Build-only entry: render the same components and loading states as the browser.
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { ServerStyleSheet, StyleSheetManager, ThemeProvider } from 'styled-components'
import i18n, { i18nReady } from './i18n'
import { GlobalStyles } from './styles/GlobalStyles'
import { theme } from './styles/theme'
import { ToastProvider } from './components/ui/ToastProvider'
import Footer from './components/Footer'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Menu from './pages/Menu'
import About from './pages/About'
import Events from './pages/Events'
import Contact from './pages/Contact'
import Privacy from './pages/Privacy'
import ProductDetail from './pages/ProductDetail'
import AdminLogin from './pages/AdminLogin'

const pages = { '/': Home, '/menu': Menu, '/about': About, '/events': Events, '/contact': Contact, '/privacy': Privacy }

export async function renderInitialPage(path: string) {
  await i18nReady
  await i18n.changeLanguage('pt-PT')
  const Page = pages[path as keyof typeof pages] ?? (path.startsWith('/admin/') ? AdminLogin : ProductDetail)
  const sheet = new ServerStyleSheet()
  try {
    const html = renderToString(
      <StyleSheetManager sheet={sheet.instance}>
        <ThemeProvider theme={theme}>
          <GlobalStyles />
          {/* Scope component rules so server/client component-ID ordering cannot
              affect each other. GlobalStyles still targets html/body normally. */}
          <StyleSheetManager namespace="#root[data-initial-render]">
            <StaticRouter location={path}>
              <ToastProvider>
                <Navbar renderStatic />
                <div className="app-route-stage"><Page /></div>
                {!path.startsWith('/admin/') && <Footer />}
              </ToastProvider>
            </StaticRouter>
          </StyleSheetManager>
        </ThemeProvider>
      </StyleSheetManager>,
    )
    // These rules belong to the static snapshot, not styled-components' client
    // registry. React's first committed route removes them before the next paint.
    const styles = sheet.getStyleTags().replace(/<style[^>]*>/g, '<style data-initial-styles>')
    return { html, styles }
  } finally {
    sheet.seal()
  }
}
