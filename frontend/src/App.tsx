import './theme.css'
import './siteThemes.css'
import './App.css'

import { lazy, Suspense, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { Location } from 'react-router-dom'

import CookieBanner from './components/CookieBanner'
import Footer from './components/Footer'
import Navbar from './components/Navbar'
import RouteLoading from './components/RouteLoading'
import OrderStatusBar from './components/OrderStatusBar'
import PrototypeNotice from './components/PrototypeNotice'
import SiteThemeController from './components/SiteThemeController'
import currentManifest from './app/manifest/currentManifest'
import type { FeatureRoute } from './app/manifest/types'
import { useAuth } from './hooks'
import { useOrganization } from './organization/context/organization-context'

const AboutPage = lazy(() => import('./pages/About'))
const ContactPage = lazy(() => import('./pages/Contact'))
const NotFoundPage = lazy(() => import('./pages/NotFound'))
const TermsPage = lazy(() => import('./pages/Terms'))
const PrivacyPage = lazy(() => import('./pages/Privacy'))
const AdminApplication = lazy(() => import('./admin/AdminApplication'))

type CartRouteState = {
  backgroundLocation?: Location
}

function ProtectedCustomerRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) return <RouteLoading />
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }
  return <>{children}</>
}

function FeatureRouteElement({ route }: { route: FeatureRoute }) {
  const Component = route.component
  const element = <Component />
  return route.customer_protected
    ? <ProtectedCustomerRoute>{element}</ProtectedCustomerRoute>
    : element
}

function RouteScroll({ location }: { location: Location }) {
  useLayoutEffect(() => {
    if (location.hash) {
      const frame = window.requestAnimationFrame(() => {
        document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
      })
      return () => window.cancelAnimationFrame(frame)
    }
    // Reset before painting the new page; CSS smooth scrolling would expose the footer.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    // Search changes are in-place state (filters, tabs and pagination).
  }, [location.hash, location.pathname])
  return null
}

function App() {
  const { capabilities } = useOrganization()
  const location = useLocation()
  const state = location.state as CartRouteState | null
  const backgroundLocation = state?.backgroundLocation
  const visibleLocation = backgroundLocation ?? location
  const availableFeatureRoutes = Object.values(currentManifest.feature_registry)
    .filter((feature) => capabilities.has(feature.key))
    .flatMap((feature) => feature.public_routes)
  const mainFeatureRoutes = availableFeatureRoutes.filter((route) => route.presentation !== 'overlay')
  const overlayFeatureRoutes = availableFeatureRoutes.filter((route) => route.presentation === 'overlay')
  const hideFooter = [
    '/login', '/register', '/forgot-password', '/admin/login', '/admin/dashboard',
    '/admin/super', '/admin/staff', '/admin/kitchen', '/cart',
  ].includes(visibleLocation.pathname)

  const showNavbar = !visibleLocation.pathname.startsWith('/admin/') || visibleLocation.pathname === '/admin/login'

  return (
    <>
      <SiteThemeController />
      {showNavbar && <Navbar location={visibleLocation} />}
      <div className="app-route-stage">
        <Suspense fallback={<RouteLoading />}>
          <Routes location={visibleLocation}>
            {mainFeatureRoutes.map((route) => (
              <Route key={route.id} path={route.path} element={<FeatureRouteElement key={visibleLocation.pathname} route={route} />} />
            ))}
            <Route path="/admin/*" element={<AdminApplication />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <RouteScroll location={visibleLocation} />
        </Suspense>
      </div>

      {backgroundLocation && (
        <Suspense fallback={null}>
          <Routes>
            {overlayFeatureRoutes.map((route) => (
              <Route key={route.id} path={route.path} element={<FeatureRouteElement route={route} />} />
            ))}
          </Routes>
        </Suspense>
      )}

      <PrototypeNotice />
      <OrderStatusBar />
      <CookieBanner />
      {!hideFooter && <Footer />}
    </>
  )
}

export default App
