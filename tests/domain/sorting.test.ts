import { describe, expect, it } from "vitest";
import { sortOpenTasks, splitTasks } from "../../src/domain/sorting";
import type { Task } from "../../src/domain/types";

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    listId: "l1",
    title: overrides.id,
    priority: "medium",
    recurrence: "none",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const today = "2026-09-14";

describe("sortOpenTasks", () => {
  it("orders by bucket: overdue, today, future, none", () => {
    const tasks = [
      task({ id: "none" }),
      task({ id: "future", dueDate: "2026-09-20" }),
      task({ id: "today", dueDate: "2026-09-14" }),
      task({ id: "overdue", dueDate: "2026-09-10" }),
    ];
    expect(sortOpenTasks(tasks, today).map((t) => t.id)).toEqual([
      "overdue",
      "today",
      "future",
      "none",
    ]);
  });

  it("orders by date ascending within the same bucket", () => {
    const tasks = [
      task({ id: "later", dueDate: "2026-09-25" }),
      task({ id: "sooner", dueDate: "2026-09-20" }),
    ];
    expect(sortOpenTasks(tasks, today).map((t) => t.id)).toEqual(["sooner", "later"]);
  });

  it("orders by priority high > medium > low for equal dates", () => {
    const tasks = [
      task({ id: "low", dueDate: "2026-09-14", priority: "low" }),
      task({ id: "high", dueDate: "2026-09-14", priority: "high" }),
      task({ id: "medium", dueDate: "2026-09-14", priority: "medium" }),
    ];
    expect(sortOpenTasks(tasks, today).map((t) => t.id)).toEqual(["high", "medium", "low"]);
  });

  it("orders by createdAt ascending as final tie-breaker", () => {
    const tasks = [
      task({ id: "newer", createdAt: "2026-09-02T00:00:00.000Z" }),
      task({ id: "older", createdAt: "2026-09-01T00:00:00.000Z" }),
    ];
    expect(sortOpenTasks(tasks, today).map((t) => t.id)).toEqual(["older", "newer"]);
  });

  it("does not mutate the input array", () => {
    const tasks = [task({ id: "b", priority: "low" }), task({ id: "a", priority: "high" })];
    sortOpenTasks(tasks, today);
    expect(tasks.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("splitTasks", () => {
  it("separates open and completed tasks", () => {
    const tasks = [task({ id: "open" }), task({ id: "done", completedAt: "2026-09-13T10:00:00Z" })];
    const { open, completed } = splitTasks(tasks);
    expect(open.map((t) => t.id)).toEqual(["open"]);
    expect(completed.map((t) => t.id)).toEqual(["done"]);
  });
});
