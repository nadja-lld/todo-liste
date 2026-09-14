import { describe, expect, it } from "vitest";
import { nextDueDate } from "../../src/domain/recurrence";

describe("nextDueDate", () => {
  it("daily adds one day", () => expect(nextDueDate("2026-09-14", "daily")).toBe("2026-09-15"));
  it("weekly adds seven days", () =>
    expect(nextDueDate("2026-09-14", "weekly")).toBe("2026-09-21"));
  it("monthly adds one month with clamping", () => {
    expect(nextDueDate("2026-09-14", "monthly")).toBe("2026-10-14");
    expect(nextDueDate("2027-01-31", "monthly")).toBe("2027-02-28");
  });
});
