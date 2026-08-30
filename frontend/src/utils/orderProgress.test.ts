import { describe, expect, it } from "vitest"

import { orderProgressStepState } from "./orderProgress"

describe("orderProgressStepState", () => {
  it("marks earlier, current and later order stages", () => {
    expect(orderProgressStepState("in_preparation", "pending")).toBe("complete")
    expect(orderProgressStepState("in_preparation", "in_preparation")).toBe("current")
    expect(orderProgressStepState("in_preparation", "ready")).toBe("upcoming")
  })

  it("does not present the normal flow as completed for a cancelled order", () => {
    expect(orderProgressStepState("cancelled", "pending")).toBe("upcoming")
    expect(orderProgressStepState("cancelled", "delivered")).toBe("upcoming")
  })
})
