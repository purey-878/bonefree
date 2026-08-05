import { useEffect, useState } from 'react'
import type { ReactNode } from "react";
import { authService } from "../services/authService";
import { cartService } from "../services/cartService";
import type { RegisterRequest, User } from "../types/user";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('token')))

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
        localStorage.removeItem('token')
        setToken(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [token])

  const login = async (email: string, password: string) => {
    const data = await authService.login(email, password)
    setToken(data.access_token)
    setUser(data.user)
    localStorage.setItem('token', data.access_token)

    try {
      await cartService.mergeGuestCartOnLogin()
    } catch (mergeError) {
      console.error('Error merging cart:', mergeError)
    }
  }

  const register = async (payload: RegisterRequest) => {
    const data = await authService.register(payload)
    setToken(data.access_token)
    setUser(data.user)
    localStorage.setItem('token', data.access_token)

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
    localStorage.removeItem('token')
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
