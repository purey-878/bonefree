import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GUEST_ORDER_ACCESSES_KEY,
  LEGACY_ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY,
  LEGACY_ACTIVE_ORDER_ACCESS_TOKEN_KEY,
  LEGACY_ACTIVE_ORDER_KEY,
  readGuestOrderAccess,
  readGuestOrderAccesses,
  rememberGuestOrderAccess,
  removeGuestOrderAccess,
  removeGuestOrderAccesses,
} from './orderStatusStorage';
import {
  clearOrganizationStorageContextForTests,
  configureOrganizationStorage,
} from '../core/storage/organizationStorage';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('guest order access storage', () => {
  beforeEach(() => {
    clearOrganizationStorageContextForTests();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent: vi.fn() },
    });
  });

  it('keeps several guest tokens indexed by order without replacing earlier orders', () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    rememberGuestOrderAccess(42, 'first-secret', expiresAt, false);
    rememberGuestOrderAccess(77, 'second-secret', expiresAt, false);

    expect(readGuestOrderAccesses()).toEqual([
      { orderId: 42, accessToken: 'first-secret', accessExpiresAt: expiresAt },
      { orderId: 77, accessToken: 'second-secret', accessExpiresAt: expiresAt },
    ]);
    expect(readGuestOrderAccess(77)?.accessToken).toBe('second-secret');
    expect(JSON.parse(localStorage.getItem(GUEST_ORDER_ACCESSES_KEY) ?? '{}')).toHaveProperty('42');
  });

  it('preserves optional creation metadata used to sort before loading a page', () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const createdAt = '2026-08-28T18:45:00';
    rememberGuestOrderAccess(91, 'dated-secret', expiresAt, false, createdAt);

    expect(readGuestOrderAccess(91)?.createdAt).toBe(createdAt);
  });

  it('migrates a valid legacy access and removes every legacy key', () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    localStorage.setItem(LEGACY_ACTIVE_ORDER_KEY, '42');
    localStorage.setItem(LEGACY_ACTIVE_ORDER_ACCESS_TOKEN_KEY, 'legacy-secret');
    localStorage.setItem(LEGACY_ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY, expiresAt);

    expect(readGuestOrderAccesses()).toEqual([
      { orderId: 42, accessToken: 'legacy-secret', accessExpiresAt: expiresAt },
    ]);
    expect(localStorage.getItem(LEGACY_ACTIVE_ORDER_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_ACTIVE_ORDER_ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_ACTIVE_ORDER_ACCESS_EXPIRES_AT_KEY)).toBeNull();
  });

  it('prunes only expired or explicitly removed orders', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    rememberGuestOrderAccess(1, 'expired', new Date(Date.now() - 1_000).toISOString(), false);
    rememberGuestOrderAccess(2, 'valid-two', future, false);
    rememberGuestOrderAccess(3, 'valid-three', future, false);

    expect(readGuestOrderAccesses().map(({ orderId }) => orderId)).toEqual([2, 3]);
    removeGuestOrderAccess(2, false);
    expect(readGuestOrderAccesses().map(({ orderId }) => orderId)).toEqual([3]);
    removeGuestOrderAccesses([3], false);
    expect(readGuestOrderAccesses()).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it('recovers safely from malformed storage', () => {
    localStorage.setItem(GUEST_ORDER_ACCESSES_KEY, '{broken');
    expect(readGuestOrderAccesses()).toEqual([]);
    expect(localStorage.getItem(GUEST_ORDER_ACCESSES_KEY)).toBeNull();
  });

  it('keeps guest-order tokens isolated when the active organization changes', () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    configureOrganizationStorage('first');
    rememberGuestOrderAccess(10, 'first-tenant-secret', expiresAt, false);

    configureOrganizationStorage('second');
    expect(readGuestOrderAccesses()).toEqual([]);
    rememberGuestOrderAccess(20, 'second-tenant-secret', expiresAt, false);

    configureOrganizationStorage('first');
    expect(readGuestOrderAccesses()).toEqual([
      { orderId: 10, accessToken: 'first-tenant-secret', accessExpiresAt: expiresAt },
    ]);

    configureOrganizationStorage('second');
    expect(readGuestOrderAccesses()).toEqual([
      { orderId: 20, accessToken: 'second-tenant-secret', accessExpiresAt: expiresAt },
    ]);
  });
});
