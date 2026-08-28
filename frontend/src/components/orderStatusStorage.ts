const GUEST_ORDER_ACCESSES_KEY = "bonefree_guest_order_accesses_v1"
const LEGACY_ACTIVE_ORDER_KEY = "active_order_id"
const LEGACY_ACTIVE_ORDER_ACCESS_TOKEN_KEY = "active_order_access_token"
const LEGACY_ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY = "active_order_access_expires_at"
const GUEST_ORDERS_UPDATED_EVENT = "guest-orders-updated"

interface StoredGuestOrderAccess {
  accessToken: string
  accessExpiresAt: string | null
  createdAt?: string | null
}

type StoredGuestOrderAccesses = Record<string, StoredGuestOrderAccess>

export interface GuestOrderAccess extends StoredGuestOrderAccess {
  orderId: number
}

function storageAvailable() {
  return typeof localStorage !== "undefined"
}

function notifyGuestOrdersUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GUEST_ORDERS_UPDATED_EVENT))
  }
}

function isExpired(accessExpiresAt: string | null) {
  if (!accessExpiresAt) return false
  const expiry = new Date(accessExpiresAt).getTime()
  return !Number.isFinite(expiry) || expiry <= Date.now()
}

function parseStoredAccesses(): StoredGuestOrderAccesses {
  if (!storageAvailable()) return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_ORDER_ACCESSES_KEY) ?? "{}")
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed).filter(([orderId, value]) => {
        const access = value as Partial<StoredGuestOrderAccess> | null
        return Number.isInteger(Number(orderId))
          && Number(orderId) > 0
          && Boolean(access)
          && typeof access?.accessToken === "string"
          && access.accessToken.length > 0
          && (access.accessExpiresAt === null || typeof access.accessExpiresAt === "string")
          && (access.createdAt === undefined || access.createdAt === null || typeof access.createdAt === "string")
      }),
    ) as StoredGuestOrderAccesses
  } catch {
    return {}
  }
}

function writeStoredAccesses(accesses: StoredGuestOrderAccesses) {
  if (!storageAvailable()) return
  if (Object.keys(accesses).length === 0) {
    localStorage.removeItem(GUEST_ORDER_ACCESSES_KEY)
    return
  }
  localStorage.setItem(GUEST_ORDER_ACCESSES_KEY, JSON.stringify(accesses))
}

function migrateLegacyAccess(accesses: StoredGuestOrderAccesses) {
  if (!storageAvailable()) return accesses

  const orderId = Number(localStorage.getItem(LEGACY_ACTIVE_ORDER_KEY))
  const accessToken = localStorage.getItem(LEGACY_ACTIVE_ORDER_ACCESS_TOKEN_KEY)
  const accessExpiresAt = localStorage.getItem(LEGACY_ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY)
  const canMigrate = Number.isInteger(orderId)
    && orderId > 0
    && Boolean(accessToken)
    && !isExpired(accessExpiresAt)

  if (canMigrate && !accesses[String(orderId)]) {
    accesses[String(orderId)] = { accessToken: accessToken!, accessExpiresAt }
  }

  localStorage.removeItem(LEGACY_ACTIVE_ORDER_KEY)
  localStorage.removeItem(LEGACY_ACTIVE_ORDER_ACCESS_TOKEN_KEY)
  localStorage.removeItem(LEGACY_ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY)
  return accesses
}

export function readGuestOrderAccesses(): GuestOrderAccess[] {
  const stored = migrateLegacyAccess(parseStoredAccesses())
  const valid: StoredGuestOrderAccesses = {}

  for (const [orderId, access] of Object.entries(stored)) {
    if (!isExpired(access.accessExpiresAt)) valid[orderId] = access
  }

  writeStoredAccesses(valid)
  return Object.entries(valid)
    .map(([orderId, access]) => ({ orderId: Number(orderId), ...access }))
    .sort((first, second) => first.orderId - second.orderId)
}

export function readGuestOrderAccess(orderId: number): GuestOrderAccess | null {
  return readGuestOrderAccesses().find((access) => access.orderId === orderId) ?? null
}

export function rememberGuestOrderAccess(
  orderId: number,
  accessToken?: string | null,
  accessExpiresAt?: string | null,
  notify = true,
  createdAt?: string | null,
) {
  if (!Number.isInteger(orderId) || orderId <= 0 || !accessToken || !storageAvailable()) return
  const accesses = migrateLegacyAccess(parseStoredAccesses())
  accesses[String(orderId)] = {
    accessToken,
    accessExpiresAt: accessExpiresAt ?? null,
    ...(createdAt ? { createdAt } : {}),
  }
  writeStoredAccesses(accesses)
  if (notify) notifyGuestOrdersUpdated()
}

export function removeGuestOrderAccess(orderId: number, notify = true) {
  if (!storageAvailable()) return
  const accesses = migrateLegacyAccess(parseStoredAccesses())
  if (!accesses[String(orderId)]) return
  delete accesses[String(orderId)]
  writeStoredAccesses(accesses)
  if (notify) notifyGuestOrdersUpdated()
}

export function removeGuestOrderAccesses(orderIds: number[], notify = true) {
  if (!storageAvailable() || orderIds.length === 0) return
  const accesses = migrateLegacyAccess(parseStoredAccesses())
  let changed = false
  for (const orderId of orderIds) {
    if (!accesses[String(orderId)]) continue
    delete accesses[String(orderId)]
    changed = true
  }
  if (!changed) return
  writeStoredAccesses(accesses)
  if (notify) notifyGuestOrdersUpdated()
}

export {
  GUEST_ORDER_ACCESSES_KEY,
  GUEST_ORDERS_UPDATED_EVENT,
  LEGACY_ACTIVE_ORDER_KEY,
  LEGACY_ACTIVE_ORDER_ACCESS_TOKEN_KEY,
  LEGACY_ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY,
}
