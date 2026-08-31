import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AdminSessionProvider } from '../context/AdminSessionProvider'
import { useAdminSession } from '../context/admin-session-context'
import { loadAdminLegacyTranslations } from '../i18n'
import type { AdminRole } from '../types/admin'

const AdminLoginPage = lazy(() => import('../pages/AdminLogin'))
const AdminDashboardPage = lazy(async () => {
  await loadAdminLegacyTranslations()
  return import('../pages/AdminDashboard')
})

function ProtectedAdminRoute({ children, roles }: { children: ReactNode; roles?: AdminRole[] }) {
  const { isAuthenticated, role, mode } = useAdminSession()

  if (!isAuthenticated || mode !== 'operational') return <Navigate to="/admin/login" replace />
  if (roles && !roles.includes(role)) return <Navigate to="/admin/dashboard" replace />
  return <>{children}</>
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<Suspense fallback={null}><AdminLoginPage /></Suspense>} />
      <Route path="dashboard" element={<ProtectedAdminRoute roles={['owner', 'manager', 'waiter', 'chef']}><Suspense fallback={null}><AdminDashboardPage /></Suspense></ProtectedAdminRoute>} />
      <Route path="super" element={<ProtectedAdminRoute roles={['owner']}><Navigate to="/admin/dashboard" replace /></ProtectedAdminRoute>} />
      <Route path="staff" element={<ProtectedAdminRoute roles={['owner', 'manager', 'waiter', 'chef']}><Navigate to="/admin/dashboard?tab=orders&view=service" replace /></ProtectedAdminRoute>} />
      <Route path="kitchen" element={<ProtectedAdminRoute roles={['owner', 'manager', 'waiter', 'chef']}><Navigate to="/admin/dashboard?tab=orders&view=kitchen" replace /></ProtectedAdminRoute>} />
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  )
}

export default function AdminApplication() {
  return (
    <AdminSessionProvider>
      <AdminRoutes />
    </AdminSessionProvider>
  )
}
