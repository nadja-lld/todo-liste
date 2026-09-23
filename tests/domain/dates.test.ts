import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsClamped,
  dueBucket,
  formatDueDate,
  isBeyondHorizon,
  isoDateOfTimestamp,
  toIsoDate,
} from "../../src/domain/dates";

const labels = { today: "Heute", tomorrow: "Morgen" };

describe("toIsoDate", () => {
  it("uses the local calendar date, not UTC", () => {
    // 14 Sep 2026 23:30 local time -> still 2026-09-14 regardless of timezone
    const local = new Date(2026, 8, 14, 23, 30);
    expect(toIsoDate(local)).toBe("2026-09-14");
  });
});

describe("addDays", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });
  it("adds seven days across a year boundary", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});

describe("addMonthsClamped", () => {
  it("adds one month keeping the day when possible", () => {
    expect(addMonthsClamped("2026-09-14", 1)).toBe("2026-10-14");
  });
  it("clamps 31 Jan to 28 Feb in a non-leap year", () => {
    expect(addMonthsClamped("2027-01-31", 1)).toBe("2027-02-28");
  });
  it("clamps 31 Jan to 29 Feb in a leap year", () => {
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });
  it("crosses the year boundary", () => {
    expect(addMonthsClamped("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("dueBucket", () => {
  const today = "2026-09-14";
  it("classifies undefined as none", () => expect(dueBucket(undefined, today)).toBe("none"));
  it("classifies past as overdue", () => expect(dueBucket("2026-09-13", today)).toBe("overdue"));
  it("classifies same day as today", () => expect(dueBucket("2026-09-14", today)).toBe("today"));
  it("classifies later as future", () => expect(dueBucket("2026-09-15", today)).toBe("future"));
});

describe("formatDueDate", () => {
  const today = "2026-09-14";
  it("says today", () => expect(formatDueDate("2026-09-14", today, labels)).toBe("Heute"));
  it("says tomorrow", () => expect(formatDueDate("2026-09-15", today, labels)).toBe("Morgen"));
  it("formats other dates as DD.MM.YYYY", () => {
    expect(formatDueDate("2026-10-01", today, labels)).toBe("01.10.2026");
    expect(formatDueDate("2026-09-13", today, labels)).toBe("13.09.2026");
  });
});

describe("isoDateOfTimestamp", () => {
  it("returns the local calendar date of a timestamp", () => {
    expect(isoDateOfTimestamp(new Date(2026, 8, 14, 23, 30).toISOString())).toBe("2026-09-14");
    expect(isoDateOfTimestamp(new Date(2026, 8, 15, 0, 15).toISOString())).toBe("2026-09-15");
  });

  it("returns an empty string for an unparsable timestamp", () => {
    expect(isoDateOfTimestamp("nope")).toBe("");
  });
});

describe("isBeyondHorizon", () => {
  const today = "2026-09-14";
  it("keeps a task due exactly 30 days out in view", () => {
    expect(isBeyondHorizon("2026-10-14", today)).toBe(false);
  });
  it("pushes a task due 31 days out beyond the horizon", () => {
    expect(isBeyondHorizon("2026-10-15", today)).toBe(true);
  });
  it("keeps overdue tasks in view", () => {
    expect(isBeyondHorizon("2026-08-01", today)).toBe(false);
  });
  it("keeps undated tasks in view", () => {
    expect(isBeyondHorizon(undefined, today)).toBe(false);
  });
});
