import './theme.css'
import './siteThemes.css'
import { Navigate, Routes, Route, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { Location } from 'react-router-dom'

import Footer from './components/Footer'
import CookieBanner from './components/CookieBanner'
import OrderStatusBar from './components/OrderStatusBar'
import SiteThemeController from './components/SiteThemeController'

import type { AdminRole } from './types/admin'
import { useAuth } from './hooks'
import currentManifest from './app/manifest/currentManifest'
import type { FeatureRoute } from './app/manifest/types'
import { useOrganization } from './organization/context/organization-context'
import { useAdminSession } from './context/admin-session-context'

const AboutPage = lazy(() => import('./pages/About'))
const ContactPage = lazy(() => import('./pages/Contact'))
const NotFoundPage = lazy(() => import('./pages/NotFound'))
const AdminLoginPage = lazy(() => import('./pages/AdminLogin'))
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboard'))

type CartRouteState = {
  backgroundLocation?: Location
}

function ProtectedAdminRoute({
  children,
  roles,
}: {
  children: ReactNode
  roles?: AdminRole[]
}) {
  const { isAuthenticated, role: adminRole } = useAdminSession()

  if (!isAuthenticated) return <Navigate to="/admin/login" replace />
  if (roles && !roles.includes(adminRole)) {
    if (adminRole === "owner") return <Navigate to="/admin/dashboard" replace />
    if (adminRole === "chef") return <Navigate to="/admin/kitchen" replace />
    return <Navigate to="/admin/staff" replace />
  }
  return <>{children}</>
}

function ProtectedCustomerRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }
  return <>{children}</>
}

function FeatureRouteElement({ route }: { route: FeatureRoute }) {
  const Component = route.component
  const element = (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  )
  return route.customer_protected
    ? <ProtectedCustomerRoute>{element}</ProtectedCustomerRoute>
    : element
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
  const mainFeatureRoutes = availableFeatureRoutes.filter(
    (route) => route.presentation !== 'overlay',
  )
  const overlayFeatureRoutes = availableFeatureRoutes.filter(
    (route) => route.presentation === 'overlay',
  )
  const hideFooter = ["/login", "/register", "/forgot-password", "/admin/login", "/admin/dashboard", "/admin/super", "/admin/staff", "/admin/kitchen", "/cart"].includes(visibleLocation.pathname)

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
  }, [visibleLocation.hash, visibleLocation.pathname, visibleLocation.search])

  return (
    <>
      <SiteThemeController />

      <Routes location={visibleLocation}>
        {mainFeatureRoutes.map((route) => (
          <Route
            key={route.id}
            path={route.path}
            element={<FeatureRouteElement route={route} />}
          />
        ))}
        <Route path="/admin/login" element={<Suspense fallback={null}><AdminLoginPage /></Suspense>} />
        <Route path="/admin/dashboard" element={<ProtectedAdminRoute roles={["owner"]}><Suspense fallback={null}><AdminDashboardPage experience="super" /></Suspense></ProtectedAdminRoute>} />
        <Route path="/admin/super" element={<ProtectedAdminRoute roles={["owner"]}><Suspense fallback={null}><AdminDashboardPage experience="super" /></Suspense></ProtectedAdminRoute>} />
        <Route path="/admin/staff" element={<ProtectedAdminRoute roles={["owner", "manager", "waiter"]}><Suspense fallback={null}><AdminDashboardPage experience="staff" /></Suspense></ProtectedAdminRoute>} />
        <Route path="/admin/kitchen" element={<ProtectedAdminRoute roles={["owner", "manager", "chef"]}><Suspense fallback={null}><AdminDashboardPage experience="kitchen" /></Suspense></ProtectedAdminRoute>} />
        <Route path="/about" element={<Suspense fallback={null}><AboutPage /></Suspense>} />
        <Route path="/contact" element={<Suspense fallback={null}><ContactPage /></Suspense>} />
        <Route path="*" element={<Suspense fallback={null}><NotFoundPage /></Suspense>} />
      </Routes>

      {backgroundLocation && (
        <Routes>
          {overlayFeatureRoutes.map((route) => (
            <Route
              key={route.id}
              path={route.path}
              element={<FeatureRouteElement route={route} />}
            />
          ))}
        </Routes>
      )}

      <OrderStatusBar />
      <CookieBanner />
      {!hideFooter && <Footer />}
    </>
  )
}

export default App
