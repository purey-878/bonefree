import { describe, expect, it } from "vitest";
import {
  adminDashboardPathForRole,
  adminTabsForRole,
  canEditCatalog,
  canManageKitchenOrders,
  canManageServiceOrders,
  canViewCatalog,
  defaultOrderViewForRole,
  orderViewForRole,
  orderViewsForRole,
} from "./adminOrderViews";

describe("admin order views", () => {
  it("exposes the expected role-based view matrix", () => {
    expect(orderViewsForRole("owner")).toEqual(["service", "kitchen", "management"]);
    expect(orderViewsForRole("manager")).toEqual(["service", "kitchen", "management"]);
    expect(orderViewsForRole("chef")).toEqual(["service", "kitchen"]);
    expect(orderViewsForRole("waiter")).toEqual(["service", "kitchen"]);
  });

  it("exposes catalog tabs progressively without leaking owner areas", () => {
    expect(adminTabsForRole("chef")).toEqual(["orders", "products", "ingredients"]);
    expect(adminTabsForRole("waiter")).toEqual(["orders", "products", "ingredients"]);
    expect(adminTabsForRole("manager")).toEqual(["orders", "products", "ingredients", "categories"]);
    expect(adminTabsForRole("owner")).toContain("settings");
  });

  it("falls back safely when a requested view is invalid or unauthorized", () => {
    expect(orderViewForRole("owner", "invalid")).toBe("management");
    expect(orderViewForRole("manager", "management")).toBe("management");
    expect(orderViewForRole("chef", "service")).toBe("service");
    expect(orderViewForRole("waiter", "kitchen")).toBe("kitchen");
  });

  it("uses role-specific dashboard entry points", () => {
    expect(defaultOrderViewForRole("owner")).toBe("management");
    expect(adminDashboardPathForRole("owner")).toBe("/admin/dashboard");
    expect(adminDashboardPathForRole("manager")).toBe("/admin/dashboard?tab=orders&view=service");
    expect(adminDashboardPathForRole("waiter")).toBe("/admin/dashboard?tab=orders&view=service");
    expect(adminDashboardPathForRole("chef")).toBe("/admin/dashboard?tab=orders&view=kitchen");
  });

  it("allows every staff role to operate the kitchen", () => {
    expect(canManageKitchenOrders("owner")).toBe(true);
    expect(canManageKitchenOrders("manager")).toBe(true);
    expect(canManageKitchenOrders("chef")).toBe(true);
    expect(canManageKitchenOrders("waiter")).toBe(true);
  });

  it("keeps the progressive service and catalog capabilities", () => {
    expect(canManageServiceOrders("chef")).toBe(false);
    expect(canManageServiceOrders("waiter")).toBe(true);
    expect(canManageServiceOrders("manager")).toBe(true);
    expect(canManageServiceOrders("owner")).toBe(true);
    for (const role of ["chef", "waiter", "manager", "owner"] as const) {
      expect(canViewCatalog(role)).toBe(true);
    }
    expect(canEditCatalog("chef")).toBe(false);
    expect(canEditCatalog("waiter")).toBe(false);
    expect(canEditCatalog("manager")).toBe(true);
    expect(canEditCatalog("owner")).toBe(true);
  });
});
