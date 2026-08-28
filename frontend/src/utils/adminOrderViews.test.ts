import { describe, expect, it } from "vitest";
import {
  adminDashboardPathForRole,
  canManageKitchenOrders,
  defaultOrderViewForRole,
  orderViewForRole,
  orderViewsForRole,
} from "./adminOrderViews";

describe("admin order views", () => {
  it("exposes the expected role-based view matrix", () => {
    expect(orderViewsForRole("owner")).toEqual(["service", "kitchen", "management"]);
    expect(orderViewsForRole("manager")).toEqual(["service", "kitchen"]);
    expect(orderViewsForRole("chef")).toEqual(["kitchen"]);
    expect(orderViewsForRole("waiter")).toEqual(["service", "kitchen"]);
  });

  it("falls back safely when a requested view is invalid or unauthorized", () => {
    expect(orderViewForRole("owner", "invalid")).toBe("management");
    expect(orderViewForRole("manager", "management")).toBe("service");
    expect(orderViewForRole("chef", "service")).toBe("kitchen");
    expect(orderViewForRole("waiter", "kitchen")).toBe("kitchen");
  });

  it("uses role-specific dashboard entry points", () => {
    expect(defaultOrderViewForRole("owner")).toBe("management");
    expect(adminDashboardPathForRole("owner")).toBe("/admin/dashboard");
    expect(adminDashboardPathForRole("manager")).toBe("/admin/dashboard?tab=orders&view=service");
    expect(adminDashboardPathForRole("waiter")).toBe("/admin/dashboard?tab=orders&view=service");
    expect(adminDashboardPathForRole("chef")).toBe("/admin/dashboard?tab=orders&view=kitchen");
  });

  it("keeps the waiter kitchen view read-only", () => {
    expect(canManageKitchenOrders("owner")).toBe(true);
    expect(canManageKitchenOrders("manager")).toBe(true);
    expect(canManageKitchenOrders("chef")).toBe(true);
    expect(canManageKitchenOrders("waiter")).toBe(false);
  });
});
