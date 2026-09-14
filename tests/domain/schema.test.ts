import { describe, expect, it } from "vitest";
import { parseAppState } from "../../src/domain/schema";

const validState = {
  schemaVersion: 1,
  lists: [{ id: "l1", name: "Aufgaben", position: 0 }],
  tasks: [
    {
      id: "t1",
      listId: "l1",
      title: "Milch kaufen",
      priority: "medium",
      recurrence: "none",
      createdAt: "2026-09-14T08:00:00.000Z",
    },
    {
      id: "t2",
      listId: "l1",
      title: "Miete",
      note: "Überweisung",
      priority: "high",
      dueDate: "2026-10-01",
      recurrence: "monthly",
      completedAt: "2026-09-01T10:00:00.000Z",
      createdAt: "2026-08-01T08:00:00.000Z",
    },
  ],
};

describe("parseAppState", () => {
  it("accepts a valid state and returns it typed", () => {
    const result = parseAppState(validState);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.tasks).toHaveLength(2);
      expect(result.state.tasks[1]?.dueDate).toBe("2026-10-01");
    }
  });

  it("rejects non-object input", () => {
    expect(parseAppState(null)).toEqual({ ok: false, error: "state must be an object" });
    expect(parseAppState("x").ok).toBe(false);
  });

  it("rejects unknown schema version", () => {
    const result = parseAppState({ ...validState, schemaVersion: 2 });
    expect(result).toEqual({ ok: false, error: "unsupported schemaVersion: 2" });
  });

  it("rejects a task with invalid priority", () => {
    const bad = {
      ...validState,
      tasks: [{ ...validState.tasks[0], priority: "urgent" }],
    };
    const result = parseAppState(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("tasks[0].priority");
  });

  it("rejects a task with malformed dueDate", () => {
    const bad = {
      ...validState,
      tasks: [{ ...validState.tasks[0], dueDate: "01.10.2026" }],
    };
    const result = parseAppState(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("tasks[0].dueDate");
  });

  it("rejects a task pointing to a missing list", () => {
    const bad = { ...validState, tasks: [{ ...validState.tasks[0], listId: "nope" }] };
    const result = parseAppState(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("tasks[0].listId");
  });

  it("rejects duplicate ids", () => {
    const bad = {
      ...validState,
      lists: [
        { id: "l1", name: "A", position: 0 },
        { id: "l1", name: "B", position: 1 },
      ],
    };
    expect(parseAppState(bad).ok).toBe(false);
  });

  it("rejects an empty task title", () => {
    const bad = { ...validState, tasks: [{ ...validState.tasks[0], title: "   " }] };
    expect(parseAppState(bad).ok).toBe(false);
  });

  it("rejects a dueDate with an impossible day of month", () => {
    const feb30 = {
      ...validState,
      tasks: [{ ...validState.tasks[0], dueDate: "2026-02-30" }],
    };
    const result1 = parseAppState(feb30);
    expect(result1.ok).toBe(false);
    if (!result1.ok) expect(result1.error).toContain("tasks[0].dueDate");

    const apr31 = {
      ...validState,
      tasks: [{ ...validState.tasks[0], dueDate: "2026-04-31" }],
    };
    const result2 = parseAppState(apr31);
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.error).toContain("tasks[0].dueDate");
  });

  it("rejects 29 February in a non-leap year and accepts it in a leap year", () => {
    const nonLeap = {
      ...validState,
      tasks: [{ ...validState.tasks[0], dueDate: "2025-02-29" }],
    };
    const result1 = parseAppState(nonLeap);
    expect(result1.ok).toBe(false);

    const leap = {
      ...validState,
      tasks: [{ ...validState.tasks[0], dueDate: "2028-02-29" }],
    };
    const result2 = parseAppState(leap);
    expect(result2.ok).toBe(true);
  });
});
