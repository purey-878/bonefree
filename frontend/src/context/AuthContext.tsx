import { useEffect, useState } from 'react'
import type { ReactNode } from "react";
import { authService } from "../services/authService";
import { cartService } from "../services/cartService";
import { claimStoredGuestOrders } from "../services/guestOrderService";
import type { RegisterRequest, User } from "../types/user";
import { AuthContext } from "./auth-context";

async function mergeBrowserState() {
  const [cartMerge, orderClaim] = await Promise.allSettled([
    cartService.mergeGuestCartOnLogin(),
    claimStoredGuestOrders(),
  ])
  if (cartMerge.status === "rejected") {
    console.error("Error merging cart:", cartMerge.reason)
  }
  if (orderClaim.status === "rejected") {
    console.error("Error claiming guest orders:", orderClaim.reason)
  }
}

async function retryGuestOrderClaim() {
  try {
    await claimStoredGuestOrders()
  } catch (orderClaimError) {
    console.error("Error claiming guest orders:", orderClaimError)
  }
}

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
      .then(async (userData) => {
        await retryGuestOrderClaim()
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
    setToken(data.accessToken)
    setUser(data.user)
    localStorage.setItem('token', data.accessToken)

    await mergeBrowserState()
  }

  const register = async (payload: RegisterRequest) => {
    const data = await authService.register(payload)
    setToken(data.accessToken)
    setUser(data.user)
    localStorage.setItem('token', data.accessToken)

    await mergeBrowserState()
  }

  const refreshUser = async () => {
    const userData = await authService.getCurrentUser()
    setUser(userData)
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_role')
    localStorage.removeItem('admin_name')
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
