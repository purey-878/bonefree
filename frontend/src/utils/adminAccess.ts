import type { AdminRole } from '../types/admin';

export type AdminDashboardTab = 'products' | 'ingredients' | 'categories' | 'staff' | 'settings' | 'reservations' | 'meal-finder';
const CATALOG_TABS: readonly AdminDashboardTab[] = ['products', 'ingredients', 'categories', 'reservations', 'meal-finder'];
const OWNER_TABS: readonly AdminDashboardTab[] = [...CATALOG_TABS, 'staff', 'settings'];
const NO_TABS: readonly AdminDashboardTab[] = [];

export function normalizeAdminRole(role: unknown): AdminRole | null {
  if (role === 'owner' || role === 'super_admin') return 'owner';
  if (role === 'manager' || role === 'staff_admin' || role === 'admin') return 'manager';
  if (role === 'waiter' || role === 'chef') return role;
  return null;
}

export function canAccessAdmin(role: unknown): boolean {
  const normalized = normalizeAdminRole(role);
  return normalized === 'owner' || normalized === 'manager';
}

export function adminTabsForRole(role: unknown): readonly AdminDashboardTab[] {
  const normalized = normalizeAdminRole(role);
  return normalized === 'owner' ? OWNER_TABS : normalized === 'manager' ? CATALOG_TABS : NO_TABS;
}

export function adminTabForRole(role: unknown, requested: string | null): AdminDashboardTab {
  const tabs = adminTabsForRole(role);
  return tabs.includes(requested as AdminDashboardTab) ? requested as AdminDashboardTab : 'products';
}

export const canEditCatalog = canAccessAdmin;
export const canViewCatalog = canAccessAdmin;
export function adminDashboardPathForRole(): string {
  return '/admin/dashboard?tab=products';
}
