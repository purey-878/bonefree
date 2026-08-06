import './theme.css'
import './siteThemes.css'
import { Navigate, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { Location } from 'react-router-dom'

import Footer from './components/Footer'
import CookieBanner from './components/CookieBanner'
import OrderStatusBar from './components/OrderStatusBar'
import SiteThemeController from './components/SiteThemeController'

import HomePage from './pages/Home'
import Menu from './pages/Menu'
import About from './pages/About'
import Events from './pages/Events'
import Contact from './pages/Contact'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Profile from './pages/Profile'
import {ProductDetail} from './pages/ProductDetail'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import type { AdminRole } from './types/admin'

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
  const token = localStorage.getItem("admin_token")
  const adminRole = localStorage.getItem("admin_role") as AdminRole | null

  if (!token) return <Navigate to="/admin/login" replace />
  if (roles && (!adminRole || !roles.includes(adminRole))) {
    if (adminRole === "chef") return <Navigate to="/admin/kitchen" replace />
    if (adminRole === "super_admin") return <Navigate to="/admin/dashboard" replace />
    return <Navigate to="/admin/staff" replace />
  }
  return <>{children}</>
}

function App() {
  const location = useLocation()
  const state = location.state as CartRouteState | null
  const backgroundLocation = state?.backgroundLocation
  const visibleLocation = backgroundLocation ?? location
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
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<ProtectedAdminRoute roles={["super_admin"]}><AdminDashboard experience="super" /></ProtectedAdminRoute>} />
        <Route path="/admin/super" element={<ProtectedAdminRoute roles={["super_admin"]}><AdminDashboard experience="super" /></ProtectedAdminRoute>} />
        <Route path="/admin/staff" element={<ProtectedAdminRoute roles={["staff_admin", "super_admin"]}><AdminDashboard experience="staff" /></ProtectedAdminRoute>} />
        <Route path="/admin/kitchen" element={<ProtectedAdminRoute roles={["chef", "staff_admin", "super_admin"]}><AdminDashboard experience="kitchen" /></ProtectedAdminRoute>} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/orders" element={<Navigate to="/profile?tab=orders" replace />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/about" element={<About />} />
        <Route path="/events" element={<Events />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/product/:id" element={<ProductDetail />} />
      </Routes>

      {backgroundLocation && (
        <Routes>
          <Route path="/cart" element={<Cart overlay />} />
        </Routes>
      )}

      <OrderStatusBar />
      <CookieBanner />
      {!hideFooter && <Footer />}
    </>
  )
}

export default App
