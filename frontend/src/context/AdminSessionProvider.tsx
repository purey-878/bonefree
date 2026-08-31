import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { organizationStorage } from '../core/storage/organizationStorage'
import {
  AdminSessionContext,
  normalizeAdminRole,
  type AdminSessionIdentity,
} from './admin-session-context'

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => organizationStorage.getItem('admin_token'))
  const [identity, setIdentity] = useState<AdminSessionIdentity>(() => ({
    name: organizationStorage.getItem('admin_name') ?? '',
    role: normalizeAdminRole(organizationStorage.getItem('admin_role')) ?? 'manager',
    mode: organizationStorage.getItem('admin_session_mode') === 'data_access' ? 'data_access' : 'operational',
  }))

  const updateIdentity = useCallback((nextIdentity: AdminSessionIdentity) => {
    setIdentity(nextIdentity)
    organizationStorage.setItem('admin_name', nextIdentity.name)
    organizationStorage.setItem('admin_role', nextIdentity.role)
    organizationStorage.setItem('admin_session_mode', nextIdentity.mode)
  }, [])

  const login = useCallback((session: AdminSessionIdentity & { token: string }) => {
    organizationStorage.setItem('admin_token', session.token)
    setToken(session.token)
    updateIdentity(session)
  }, [updateIdentity])

  const logout = useCallback(() => {
    organizationStorage.removeItem('admin_token')
    organizationStorage.removeItem('admin_role')
    organizationStorage.removeItem('admin_name')
    organizationStorage.removeItem('admin_session_mode')
    setToken(null)
    setIdentity({ name: '', role: 'manager', mode: 'operational' })
  }, [])

  const value = useMemo(() => ({
    ...identity,
    token,
    isAuthenticated: Boolean(token),
    login,
    updateIdentity,
    logout,
  }), [identity, login, logout, token, updateIdentity])

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>
}
