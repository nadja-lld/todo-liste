import { describe, expect, it } from "vitest";
import { sortOpenTasks, splitDelegated, splitTasks } from "../../src/domain/sorting";
import type { Task } from "../../src/domain/types";

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    listId: "l1",
    title: overrides.id,
    priority: "medium",
    recurrence: "none",
    createdAt: "2026-09-01T00:00:00.000Z",
    createdBy: "a",
    updatedAt: "2026-09-01T00:00:00.000Z",
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
  const doneToday = new Date(2026, 8, 14, 10, 0).toISOString();
  const doneYesterday = new Date(2026, 8, 13, 10, 0).toISOString();

  it("separates open and completed tasks", () => {
    const tasks = [task({ id: "open" }), task({ id: "done", completedAt: doneToday })];
    const { open, completed } = splitTasks(tasks, today);
    expect(open.map((t) => t.id)).toEqual(["open"]);
    expect(completed.map((t) => t.id)).toEqual(["done"]);
  });

  it("drops tasks completed before today from the completed list", () => {
    const tasks = [
      task({ id: "yesterday", completedAt: doneYesterday }),
      task({ id: "today", completedAt: doneToday }),
    ];
    const { open, completed } = splitTasks(tasks, today);
    expect(open).toEqual([]);
    expect(completed.map((t) => t.id)).toEqual(["today"]);
  });

  it("moves open tasks due more than 30 days out into later", () => {
    const tasks = [
      task({ id: "soon", dueDate: "2026-10-14" }),
      task({ id: "far", dueDate: "2026-10-15" }),
      task({ id: "undated" }),
    ];
    const { open, later } = splitTasks(tasks, today);
    expect(open.map((t) => t.id)).toEqual(["soon", "undated"]);
    expect(later.map((t) => t.id)).toEqual(["far"]);
  });

  it("keeps a far-dated task that was finished today in completed", () => {
    const tasks = [task({ id: "done", dueDate: "2026-12-01", completedAt: doneToday })];
    const { later, completed } = splitTasks(tasks, today);
    expect(later).toEqual([]);
    expect(completed.map((t) => t.id)).toEqual(["done"]);
  });
});

describe("splitDelegated", () => {
  const done = (id: string, completedAt: string) => task({ id, completedAt });

  it("keeps open tasks", () => {
    const result = splitDelegated([task({ id: "offen" })], today);
    expect(result.open.map((t) => t.id)).toEqual(["offen"]);
    expect(result.done).toEqual([]);
  });

  it("moves open hand-overs due more than 30 days out into later", () => {
    const result = splitDelegated(
      [task({ id: "bald", dueDate: "2026-09-20" }), task({ id: "fern", dueDate: "2026-11-01" })],
      today,
    );
    expect(result.open.map((t) => t.id)).toEqual(["bald"]);
    expect(result.later.map((t) => t.id)).toEqual(["fern"]);
  });

  it("shows a task finished today", () => {
    const result = splitDelegated([done("heute", "2026-09-14T08:00:00.000Z")], today);
    expect(result.done.map((t) => t.id)).toEqual(["heute"]);
  });

  it("shows a task finished within the last seven days", () => {
    const result = splitDelegated([done("neulich", "2026-09-09T08:00:00.000Z")], today);
    expect(result.done.map((t) => t.id)).toEqual(["neulich"]);
  });

  it("hides a task finished longer ago", () => {
    const result = splitDelegated([done("alt", "2026-09-01T08:00:00.000Z")], today);
    expect(result.done).toEqual([]);
  });

  it("puts the most recently finished first", () => {
    const result = splitDelegated(
      [done("aelter", "2026-09-10T08:00:00.000Z"), done("neuer", "2026-09-13T08:00:00.000Z")],
      today,
    );
    expect(result.done.map((t) => t.id)).toEqual(["neuer", "aelter"]);
  });
});
