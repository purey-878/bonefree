import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanupRetiredBrowserStorage, removeRetiredStorage, RETIRED_STORAGE_KEYS } from './retiredStorage';

afterEach(() => vi.unstubAllGlobals());
describe('retired browser storage', () => {
  it('removes only verified legacy keys and preserves active and unknown entries', () => {
    const kept = ['admin_token', 'admin_role', 'admin_name', 'admin_theme', 'admin_sidebar_collapsed', 'admin_editor_view_mode', 'bonefree_locale', 'bonefree-menu-filters', 'bonefree_recently_viewed', 'bonefree_site_theme', 'another_app_key'];
    const data = new Map([...kept, ...RETIRED_STORAGE_KEYS].map(key => [key, 'value']));
    const storage = { removeItem: (key: string) => data.delete(key) };
    removeRetiredStorage(storage);
    removeRetiredStorage(storage);
    expect([...data.keys()]).toEqual(kept);
  });
  it('keeps browsing operational when either storage API is blocked', () => {
    const removeItem = vi.fn();
    vi.stubGlobal('window', {
      get localStorage() { throw new Error('Blocked'); },
      sessionStorage: { removeItem },
    });
    expect(() => cleanupRetiredBrowserStorage()).not.toThrow();
    expect(removeItem).toHaveBeenCalledTimes(RETIRED_STORAGE_KEYS.length);
  });
});
