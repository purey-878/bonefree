import './theme.css'
import './siteThemes.css'
import './App.css'
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
import GuestOrders from './pages/GuestOrders'
import OrderDetails from './pages/OrderDetails'
import Profile from './pages/Profile'
import {ProductDetail} from './pages/ProductDetail'
import NotFound from './pages/NotFound'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import type { AdminRole } from './types/admin'
import { useAuth } from './hooks'
import { adminDashboardPathForRole } from './utils/adminOrderViews'

type CartRouteState = {
  backgroundLocation?: Location
}

function normalizeAdminRole(role: string | null): AdminRole | null {
  if (!role) return null
  if (role === "owner" || role === "super_admin") return "owner"
  if (role === "chef") return "chef"
  if (role === "waiter") return "waiter"
  if (role === "manager" || role === "staff_admin" || role === "admin") return "manager"
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
    return <Navigate to={adminRole ? adminDashboardPathForRole(adminRole) : "/admin/login"} replace />
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

      <div className="app-route-stage" key={visibleLocation.pathname}>
        <Routes location={visibleLocation}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<ProtectedAdminRoute roles={["owner", "manager", "waiter", "chef"]}><AdminDashboard /></ProtectedAdminRoute>} />
          <Route path="/admin/super" element={<ProtectedAdminRoute roles={["owner"]}><Navigate to="/admin/dashboard" replace /></ProtectedAdminRoute>} />
          <Route path="/admin/staff" element={<ProtectedAdminRoute roles={["owner", "manager", "waiter", "chef"]}><Navigate to="/admin/dashboard?tab=orders&view=service" replace /></ProtectedAdminRoute>} />
          <Route path="/admin/kitchen" element={<ProtectedAdminRoute roles={["owner", "manager", "waiter", "chef"]}><Navigate to="/admin/dashboard?tab=orders&view=kitchen" replace /></ProtectedAdminRoute>} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders" element={<GuestOrders />} />
          <Route path="/orders/:orderId" element={<OrderDetails />} />
          <Route path="/profile" element={<ProtectedCustomerRoute><Profile /></ProtectedCustomerRoute>} />
          <Route path="/about" element={<About />} />
          <Route path="/events" element={<Events />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>

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
