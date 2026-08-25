import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearOrganizationStorageContextForTests,
  configureOrganizationStorage,
  organizationSessionStorage,
  organizationStorage,
} from './organizationStorage'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

describe('organization storage', () => {
  beforeEach(() => {
    clearOrganizationStorageContextForTests()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    })
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: new MemoryStorage(),
    })
  })

  it('isolates the same logical key between organizations', () => {
    configureOrganizationStorage('first')
    organizationStorage.setItem('token', 'first-token')
    configureOrganizationStorage('second')
    organizationStorage.setItem('token', 'second-token')

    expect(organizationStorage.getItem('token')).toBe('second-token')
    expect(localStorage.getItem('first:token')).toBe('first-token')
    expect(localStorage.getItem('second:token')).toBe('second-token')
  })

  it('migrates legacy keys only for Bonefree', () => {
    localStorage.setItem('token', 'legacy-token')
    localStorage.setItem('bonefree_site_theme', '{"themeId":"normal"}')
    sessionStorage.setItem('bonefree-menu-filters', '{"sortBy":"default"}')

    configureOrganizationStorage('bonefree')

    expect(organizationStorage.getItem('token')).toBe('legacy-token')
    expect(organizationStorage.getItem('site_theme')).toBe('{"themeId":"normal"}')
    expect(organizationSessionStorage.getItem('menu_filters')).toBe('{"sortBy":"default"}')
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('bonefree_site_theme')).toBeNull()
    expect(sessionStorage.getItem('bonefree-menu-filters')).toBeNull()
  })

  it('does not claim an unscoped legacy key for another tenant', () => {
    localStorage.setItem('token', 'legacy-token')

    configureOrganizationStorage('second')

    expect(organizationStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('token')).toBe('legacy-token')
  })
})
