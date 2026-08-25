import { useEffect, useState } from 'react'
import type { ReactNode } from "react";
import { authService } from "../services/authService";
import { cartService } from "../services/cartService";
import type { RegisterRequest, User } from "../types/user";
import { AuthContext } from "./auth-context";
import { organizationStorage } from '../core/storage/organizationStorage'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => organizationStorage.getItem('token'))
  const [loading, setLoading] = useState(() => Boolean(organizationStorage.getItem('token')))

  useEffect(() => {
    if (!token) {
      return
    }

    authService
      .getCurrentUser()
      .then((userData) => {
        setUser(userData)
      })
      .catch((error) => {
        console.error('Error fetching user info:', error)
        organizationStorage.removeItem('token')
        setToken(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [token])

  const login = async (email: string, password: string) => {
    const data = await authService.login(email, password)
    setToken(data.accessToken)
    setUser(data.user)
    organizationStorage.setItem('token', data.accessToken)

    try {
      await cartService.mergeGuestCartOnLogin()
    } catch (mergeError) {
      console.error('Error merging cart:', mergeError)
    }
  }

  const register = async (payload: RegisterRequest) => {
    const data = await authService.register(payload)
    setToken(data.accessToken)
    setUser(data.user)
    organizationStorage.setItem('token', data.accessToken)

    try {
      await cartService.mergeGuestCartOnLogin()
    } catch (mergeError) {
      console.error('Error merging cart:', mergeError)
    }
  }

  const refreshUser = async () => {
    const userData = await authService.getCurrentUser()
    setUser(userData)
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    organizationStorage.removeItem('token')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        refreshUser,
        logout,
        isAuthenticated: !!user && !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
