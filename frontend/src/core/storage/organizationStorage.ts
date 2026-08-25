let organizationSlug: string | null = null

type StorageName = 'localStorage' | 'sessionStorage'

const bonefreeLocalStorageMigrations: ReadonlyArray<readonly [string, string]> = [
  ['token', 'token'],
  ['admin_token', 'admin_token'],
  ['admin_role', 'admin_role'],
  ['admin_name', 'admin_name'],
  ['guest_cart', 'guest_cart'],
  ['cart', 'guest_cart'],
  ['active_order_id', 'active_order_id'],
  ['active_order_access_token', 'active_order_access_token'],
  ['active_order_access_expires_at', 'active_order_access_expires_at'],
  ['bonefree_site_theme', 'site_theme'],
  ['bonefree_cookie_consent', 'cookie_consent'],
  ['bonefree_recently_viewed', 'recently_viewed'],
  ['bonefree-loyalty-banner-dismissed', 'loyalty_banner_dismissed'],
  ['admin_sidebar_collapsed', 'admin_sidebar_collapsed'],
  ['admin_theme', 'admin_theme'],
]

const bonefreeSessionStorageMigrations: ReadonlyArray<readonly [string, string]> = [
  ['bonefree-menu-filters', 'menu_filters'],
]

function storage(name: StorageName): Storage | null {
  if (name === 'localStorage') {
    return typeof localStorage === 'undefined' ? null : localStorage
  }
  return typeof sessionStorage === 'undefined' ? null : sessionStorage
}

function scopedKey(key: string): string {
  return organizationSlug ? `${organizationSlug}:${key}` : key
}

function migrate(
  storageName: StorageName,
  mappings: ReadonlyArray<readonly [string, string]>,
): void {
  const targetStorage = storage(storageName)
  if (!targetStorage) return
  for (const [legacyKey, nextKey] of mappings) {
    const legacyValue = targetStorage.getItem(legacyKey)
    if (legacyValue === null) continue
    const targetKey = scopedKey(nextKey)
    if (targetStorage.getItem(targetKey) === null) {
      targetStorage.setItem(targetKey, legacyValue)
    }
    targetStorage.removeItem(legacyKey)
  }
}

export function configureOrganizationStorage(slug: string): void {
  organizationSlug = slug
  if (slug === 'bonefree') {
    migrate('localStorage', bonefreeLocalStorageMigrations)
    migrate('sessionStorage', bonefreeSessionStorageMigrations)
  }
}

function organizationScopedStorage(storageName: StorageName) {
  return {
    key: scopedKey,
    getItem(key: string): string | null {
      return storage(storageName)?.getItem(scopedKey(key)) ?? null
    },
    setItem(key: string, value: string): void {
      storage(storageName)?.setItem(scopedKey(key), value)
    },
    removeItem(key: string): void {
      storage(storageName)?.removeItem(scopedKey(key))
    },
  }
}

export const organizationStorage = organizationScopedStorage('localStorage')
export const organizationSessionStorage = organizationScopedStorage('sessionStorage')

export function clearOrganizationStorageContextForTests(): void {
  organizationSlug = null
}
