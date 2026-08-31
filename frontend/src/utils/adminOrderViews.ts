import type { AdminRole } from "../types/admin";

export type AdminOrderView = "service" | "kitchen" | "management";
export type AdminDashboardTab = "dashboard" | "products" | "ingredients" | "categories" | "orders" | "reviews" | "analytics" | "clientes" | "staff" | "settings" | "privacy";

const DASHBOARD_TABS_BY_ROLE: Record<AdminRole, readonly AdminDashboardTab[]> = {
  owner: ["dashboard", "products", "ingredients", "categories", "orders", "reviews", "clientes", "staff", "settings", "privacy", "analytics"],
  manager: ["orders", "products", "ingredients", "categories"],
  waiter: ["orders", "products", "ingredients"],
  chef: ["orders", "products", "ingredients"],
};

const ORDER_VIEWS_BY_ROLE: Record<AdminRole, readonly AdminOrderView[]> = {
  owner: ["service", "kitchen", "management"],
  manager: ["service", "kitchen", "management"],
  chef: ["service", "kitchen"],
  waiter: ["service", "kitchen"],
};

export function orderViewsForRole(role: AdminRole): readonly AdminOrderView[] {
  return ORDER_VIEWS_BY_ROLE[role];
}

export function adminTabsForRole(role: AdminRole): readonly AdminDashboardTab[] {
  return DASHBOARD_TABS_BY_ROLE[role];
}

export function defaultOrderViewForRole(role: AdminRole): AdminOrderView {
  if (role === "owner") return "management";
  if (role === "chef") return "kitchen";
  return "service";
}

export function orderViewForRole(role: AdminRole, requestedView: string | null): AdminOrderView {
  const allowedViews = orderViewsForRole(role);
  return allowedViews.includes(requestedView as AdminOrderView)
    ? requestedView as AdminOrderView
    : defaultOrderViewForRole(role);
}

export function canManageKitchenOrders(role: AdminRole): boolean {
  return role === "chef" || role === "waiter" || role === "manager" || role === "owner";
}

export function canManageServiceOrders(role: AdminRole): boolean {
  return role !== "chef";
}

export function canEditCatalog(role: AdminRole): boolean {
  return role === "manager" || role === "owner";
}

export function canViewCatalog(role: AdminRole): boolean {
  return role === "chef" || role === "waiter" || role === "manager" || role === "owner";
}

export function adminDashboardPathForRole(role: AdminRole): string {
  if (role === "owner") return "/admin/dashboard";
  return `/admin/dashboard?tab=orders&view=${defaultOrderViewForRole(role)}`;
}
