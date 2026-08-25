import { createContext, useContext } from 'react'

import type { AdminRole } from '../types/admin'

export interface AdminSessionIdentity {
  name: string
  role: AdminRole
}

export interface AdminSessionValue extends AdminSessionIdentity {
  token: string | null
  isAuthenticated: boolean
  login: (session: AdminSessionIdentity & { token: string }) => void
  updateIdentity: (identity: AdminSessionIdentity) => void
  logout: () => void
}

export const AdminSessionContext = createContext<AdminSessionValue | null>(null)

export function normalizeAdminRole(role: unknown): AdminRole | null {
  if (role === 'owner' || role === 'super_admin') return 'owner'
  if (role === 'chef') return 'chef'
  if (role === 'waiter') return 'waiter'
  if (role === 'manager' || role === 'staff_admin' || role === 'admin') return 'manager'
  return null
}

export function useAdminSession(): AdminSessionValue {
  const value = useContext(AdminSessionContext)
  if (!value) throw new Error('useAdminSession must be used within AdminSessionProvider')
  return value
}
