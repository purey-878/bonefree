import type { AdminRole } from "../types/admin";

export type AdminOrderView = "service" | "kitchen" | "management";

const ORDER_VIEWS_BY_ROLE: Record<AdminRole, readonly AdminOrderView[]> = {
  owner: ["service", "kitchen", "management"],
  manager: ["service", "kitchen"],
  chef: ["kitchen"],
  waiter: ["service", "kitchen"],
};

export function orderViewsForRole(role: AdminRole): readonly AdminOrderView[] {
  return ORDER_VIEWS_BY_ROLE[role];
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
  return role !== "waiter";
}

export function adminDashboardPathForRole(role: AdminRole): string {
  if (role === "owner") return "/admin/dashboard";
  return `/admin/dashboard?tab=orders&view=${defaultOrderViewForRole(role)}`;
}
