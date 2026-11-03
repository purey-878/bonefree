import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import './siteThemes.css'
import './theme.css'

import CookieBanner from './components/CookieBanner'
import Footer from './components/Footer'
import SiteThemeController from './components/SiteThemeController'

import AdminAccessDenied from './components/AdminAccessDenied'
import About from './pages/About'
import AdminDashboard from './pages/AdminDashboard'
import AdminLogin from './pages/AdminLogin'
import Contact from './pages/Contact'
import Events from './pages/Events'
import HomePage from './pages/Home'
import Menu from './pages/Menu'
import NotFound from './pages/NotFound'
import { ProductDetail } from './pages/ProductDetail'
import type { AdminRole } from './types/admin'
import { normalizeAdminRole } from './utils/adminAccess'

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
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>

      <CookieBanner />
      {!hideFooter && <Footer />}
    </>
  )
}

export default App
