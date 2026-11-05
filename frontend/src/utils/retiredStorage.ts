// Exact keys verified against the removed frontend in Git history. Never clear
// the whole origin: administrator credentials and active preferences must survive.
export const RETIRED_STORAGE_KEYS = [
  'guest_cart', 'cart', 'token', 'bonefree_guest_order_accesses_v1',
  'active_order_id', 'active_order_access_token', 'active_order_access_expires_at',
  'bonefree_cookie_consent',
] as const;

export function removeRetiredStorage(storage: Pick<Storage, 'removeItem'>) {
  for (const key of RETIRED_STORAGE_KEYS) storage.removeItem(key);
}

export function cleanupRetiredBrowserStorage() {
  for (const kind of ['localStorage', 'sessionStorage'] as const) {
    try { removeRetiredStorage(window[kind]); } catch { /* Browsing works when storage is blocked. */ }
  }
}
