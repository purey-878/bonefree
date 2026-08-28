import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  readGuestOrderAccesses,
  rememberGuestOrderAccess,
} from "../components/orderStatusStorage"
import { checkoutService } from "./checkoutService"
import { claimStoredGuestOrders } from "./guestOrderService"

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

describe("guest order claiming", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    })
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { dispatchEvent: vi.fn() },
    })
  })

  it("removes claimed and rejected browser credentials only after a successful response", async () => {
    const expiry = new Date(Date.now() + 60_000).toISOString()
    rememberGuestOrderAccess(10, "valid-token", expiry, false)
    rememberGuestOrderAccess(20, "invalid-token", expiry, false)
    vi.spyOn(checkoutService, "claimGuestOrders").mockResolvedValue({
      claimedOrderIds: [10],
      rejectedOrderIds: [20],
    })

    await expect(claimStoredGuestOrders()).resolves.toEqual([10])
    expect(checkoutService.claimGuestOrders).toHaveBeenCalledWith([
      { orderId: 10, accessToken: "valid-token" },
      { orderId: 20, accessToken: "invalid-token" },
    ])
    expect(readGuestOrderAccesses()).toEqual([])
  })

  it("retains every credential when the association request fails", async () => {
    const expiry = new Date(Date.now() + 60_000).toISOString()
    rememberGuestOrderAccess(10, "valid-token", expiry, false)
    vi.spyOn(checkoutService, "claimGuestOrders").mockRejectedValue(new Error("offline"))

    await expect(claimStoredGuestOrders()).rejects.toThrow("offline")
    expect(readGuestOrderAccesses()).toEqual([
      { orderId: 10, accessToken: "valid-token", accessExpiresAt: expiry },
    ])
  })
})
