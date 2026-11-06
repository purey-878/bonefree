import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect, useLayoutEffect } from 'react'
import { loadAdminTranslations } from './i18n/loadAdminTranslations'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import './siteThemes.css'
import './theme.css'

import PageMetadata from './components/PageMetadata'
import Footer from './components/Footer'
import SiteThemeController from './components/SiteThemeController'

import AdminAccessDenied from './components/AdminAccessDenied'
import HomePage from './pages/Home'
import type { AdminRole } from './types/admin'
import { normalizeAdminRole } from './utils/adminAccess'

// The homepage stays eager. Other route code and CSS load only when needed.
const About = lazy(() => import('./pages/About'))
const AdminDashboard = lazy(async () => {
  const [page] = await Promise.all([import('./pages/AdminDashboard'), loadAdminTranslations()])
  return page
})
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const Contact = lazy(() => import('./pages/Contact'))
const Events = lazy(() => import('./pages/Events'))
const Menu = lazy(() => import('./pages/Menu'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Privacy = lazy(() => import('./pages/Privacy'))
const ProductDetail = lazy(() => import('./pages/ProductDetail'))

// Keep the styled snapshot visible until a cold route's code/CSS is ready.
const initialRouteMarkup = typeof document === 'undefined' ? '' : document.getElementById('root')?.innerHTML ?? ''
const initialStage = typeof document === 'undefined' ? null : document.querySelector('.app-route-stage')
const initialAnimation = initialStage?.getAnimations().find(animation => 'animationName' in animation && animation.animationName === 'app-route-enter')
const initialAnimationTime = Number(initialAnimation?.currentTime ?? 0)
const initialAnimationClock = typeof performance === 'undefined' ? 0 : performance.now()

function continueInitialAnimation() {
  const root = document.getElementById('root')
  if (!root?.hasAttribute('data-initial-render') || !initialAnimation) return
  const animation = root.querySelector('.app-route-stage')?.getAnimations()
    .find(animation => 'animationName' in animation && animation.animationName === 'app-route-enter')
  if (animation) animation.currentTime = initialAnimationTime + performance.now() - initialAnimationClock
}

function InitialRouteFallback() {
  useLayoutEffect(continueInitialAnimation, [])
  return <div dangerouslySetInnerHTML={{ __html: initialRouteMarkup }} />
}
const initialRouteFallback = <InitialRouteFallback />

function InitialRenderComplete() {
  useLayoutEffect(() => {
    // Neither the lazy fallback nor the committed page should replay the fade.
    continueInitialAnimation()
    document.getElementById('root')?.removeAttribute('data-initial-render')
    document.querySelectorAll('style[data-initial-styles]').forEach(style => style.remove())
  }, [])
  return null
}

function ProtectedAdminRoute({
  children,
  roles,
}: {
  children: ReactNode
  roles?: AdminRole[]
}) {
  const token = localStorage.getItem("admin_token")
  const adminRole = normalizeAdminRole(localStorage.getItem("admin_role"))

  if (!token) return <Navigate to="/admin/login" replace />
  if (adminRole) localStorage.setItem("admin_role", adminRole)
  if (roles && (!adminRole || !roles.includes(adminRole))) {
    return <AdminAccessDenied />
  }
  return <>{children}</>
}

function App() {
  const location = useLocation()
  const visibleLocation = location
  const hideFooter = location.pathname.startsWith("/admin/")

  useEffect(() => {
    if (visibleLocation.hash) {
      window.requestAnimationFrame(() => {
        document
          .getElementById(visibleLocation.hash.slice(1))
          ?.scrollIntoView({ block: "start" })
      })
      return
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    // Query-string changes represent in-place state (filters, tabs and pagination),
    // so they must not throw the user back to the top of the current screen.
  }, [visibleLocation.hash, visibleLocation.pathname])

  return (
    <>
      <SiteThemeController />
      <PageMetadata />

      <Suspense fallback={initialRouteFallback}>
      <div className="app-route-stage" key={visibleLocation.pathname}>
        <Routes location={visibleLocation}>
          <Route path="/" element={<HomePage />} />

          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<ProtectedAdminRoute roles={["owner", "manager"]}><AdminDashboard /></ProtectedAdminRoute>} />
          <Route path="/admin/super" element={<ProtectedAdminRoute roles={["owner"]}><Navigate to="/admin/dashboard" replace /></ProtectedAdminRoute>} />

          <Route path="/menu" element={<Menu />} />

          <Route path="/about" element={<About />} />
          <Route path="/events" element={<Events />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      {!hideFooter && <Footer />}
      <InitialRenderComplete />
      </Suspense>
    </>
  )
}

export default App
