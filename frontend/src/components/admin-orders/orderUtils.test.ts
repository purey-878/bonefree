import { describe, expect, it } from "vitest";
import { localDateInputValue } from "./orderUtils";

describe("localDateInputValue", () => {
  it("formats the local calendar date for a date input without UTC conversion", () => {
    expect(localDateInputValue(new Date(2026, 7, 3, 23, 45))).toBe("2026-08-03");
  });

  it("pads single-digit months and days", () => {
    expect(localDateInputValue(new Date(2026, 0, 9, 8, 0))).toBe("2026-01-09");
  });
});
