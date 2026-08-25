import { organizationStorage } from '../core/storage/organizationStorage'

const ACTIVE_ORDER_KEY = "active_order_id"
const ACTIVE_ORDER_ACCESS_TOKEN_KEY = "active_order_access_token"
const ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY = "active_order_access_expires_at"

export interface ActiveOrderAccess {
  orderId: number
  accessToken: string | null
  accessExpiresAt: string | null
}

export function clearActiveOrder(notify = true) {
  organizationStorage.removeItem(ACTIVE_ORDER_KEY)
  organizationStorage.removeItem(ACTIVE_ORDER_ACCESS_TOKEN_KEY)
  organizationStorage.removeItem(ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY)
  if (notify) window.dispatchEvent(new Event("active-order-updated"))
}

export function rememberActiveOrder(
  orderId: number,
  accessToken?: string | null,
  accessExpiresAt?: string | null,
  notify = true,
) {
  organizationStorage.setItem(ACTIVE_ORDER_KEY, String(orderId))
  if (accessToken) organizationStorage.setItem(ACTIVE_ORDER_ACCESS_TOKEN_KEY, accessToken)
  else organizationStorage.removeItem(ACTIVE_ORDER_ACCESS_TOKEN_KEY)
  if (accessExpiresAt) organizationStorage.setItem(ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY, accessExpiresAt)
  else organizationStorage.removeItem(ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY)
  if (notify) window.dispatchEvent(new Event("active-order-updated"))
}

export function readActiveOrder(): ActiveOrderAccess | null {
  const orderId = Number(organizationStorage.getItem(ACTIVE_ORDER_KEY))
  if (!Number.isInteger(orderId) || orderId <= 0) return null

  const accessToken = organizationStorage.getItem(ACTIVE_ORDER_ACCESS_TOKEN_KEY)
  const accessExpiresAt = organizationStorage.getItem(ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY)
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
