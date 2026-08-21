const ACTIVE_ORDER_KEY = "active_order_id"
const ACTIVE_ORDER_ACCESS_TOKEN_KEY = "active_order_access_token"
const ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY = "active_order_access_expires_at"

export interface ActiveOrderAccess {
  orderId: number
  accessToken: string | null
  accessExpiresAt: string | null
}

export function clearActiveOrder(notify = true) {
  localStorage.removeItem(ACTIVE_ORDER_KEY)
  localStorage.removeItem(ACTIVE_ORDER_ACCESS_TOKEN_KEY)
  localStorage.removeItem(ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY)
  if (notify) window.dispatchEvent(new Event("active-order-updated"))
}

export function rememberActiveOrder(
  orderId: number,
  accessToken?: string | null,
  accessExpiresAt?: string | null,
  notify = true,
) {
  localStorage.setItem(ACTIVE_ORDER_KEY, String(orderId))
  if (accessToken) localStorage.setItem(ACTIVE_ORDER_ACCESS_TOKEN_KEY, accessToken)
  else localStorage.removeItem(ACTIVE_ORDER_ACCESS_TOKEN_KEY)
  if (accessExpiresAt) localStorage.setItem(ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY, accessExpiresAt)
  else localStorage.removeItem(ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY)
  if (notify) window.dispatchEvent(new Event("active-order-updated"))
}

export function readActiveOrder(): ActiveOrderAccess | null {
  const orderId = Number(localStorage.getItem(ACTIVE_ORDER_KEY))
  if (!Number.isInteger(orderId) || orderId <= 0) return null

  const accessToken = localStorage.getItem(ACTIVE_ORDER_ACCESS_TOKEN_KEY)
  const accessExpiresAt = localStorage.getItem(ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY)
  if (accessToken && accessExpiresAt) {
    const expiry = new Date(accessExpiresAt).getTime()
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      clearActiveOrder(false)
      return null
    }
  }

  return { orderId, accessToken, accessExpiresAt }
}

export {
  ACTIVE_ORDER_KEY,
  ACTIVE_ORDER_ACCESS_TOKEN_KEY,
  ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY,
}
