import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY,
  ACTIVE_ORDER_ACCESS_TOKEN_KEY,
  ACTIVE_ORDER_KEY,
  clearActiveOrder,
  readActiveOrder,
  rememberActiveOrder,
} from './orderStatusStorage';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('active guest order storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent: vi.fn() },
    });
  });

  it('keeps the guest token and expiry only in dedicated local storage fields', () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    rememberActiveOrder(42, 'guest-secret', expiresAt);

    expect(readActiveOrder()).toEqual({
      orderId: 42,
      accessToken: 'guest-secret',
      accessExpiresAt: expiresAt,
    });
    expect(localStorage.getItem(ACTIVE_ORDER_KEY)).toBe('42');
    expect(localStorage.getItem(ACTIVE_ORDER_ACCESS_TOKEN_KEY)).toBe('guest-secret');
    expect(localStorage.getItem(ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY)).toBe(expiresAt);
  });

  it('discards expired guest access and removes every related value', () => {
    rememberActiveOrder(42, 'expired-secret', new Date(Date.now() - 1_000).toISOString(), false);

    expect(readActiveOrder()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('replacing a guest order with an authenticated order removes the old secret', () => {
    rememberActiveOrder(42, 'guest-secret', new Date(Date.now() + 60_000).toISOString(), false);
    rememberActiveOrder(77, null, null, false);

    expect(readActiveOrder()).toEqual({ orderId: 77, accessToken: null, accessExpiresAt: null });
    clearActiveOrder(false);
    expect(localStorage.length).toBe(0);
  });
});
