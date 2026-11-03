import { describe, expect, it } from 'vitest';
import { adminDashboardPathForRole, adminTabForRole, adminTabsForRole, canAccessAdmin } from './adminAccess';

describe('content administration access', () => {
  it('admits owners and managers, and rejects operational and unknown roles', () => {
    for (const role of ['owner', 'manager', 'super_admin', 'staff_admin']) expect(canAccessAdmin(role)).toBe(true);
    for (const role of ['chef', 'waiter', '', null, 'unexpected']) {
      expect(canAccessAdmin(role)).toBe(false);
      expect(adminTabsForRole(role)).toEqual([]);
    }
  });
  it('keeps settings and administrator management owner-only', () => {
    expect(adminTabsForRole('manager')).toEqual(['products', 'ingredients', 'categories']);
    expect(adminTabsForRole('owner')).toContain('settings');
    expect(adminTabsForRole('owner')).toContain('staff');
    expect(adminTabForRole('manager', 'settings')).toBe('products');
  });
  it('falls back to products for retired tabs and login destinations', () => {
    for (const tab of ['orders', 'reviews', 'clientes', 'analytics', 'dashboard', null]) {
      expect(adminTabForRole('owner', tab)).toBe('products');
      expect(adminTabForRole('manager', tab)).toBe('products');
    }
    expect(adminTabForRole('manager', 'ingredients')).toBe('ingredients');
    expect(adminDashboardPathForRole()).toBe('/admin/dashboard?tab=products');
  });
});
