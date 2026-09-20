import { describe, expect, it } from "vitest";
import { purgeExpired } from "../../src/domain/purge";
import type { AppState, Task } from "../../src/domain/types";

const NOW = new Date("2026-09-20T12:00:00.000Z");
const RECENT = "2026-09-15T12:00:00.000Z"; // 5 days ago
const OLD = "2026-08-01T12:00:00.000Z"; // 50 days ago

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    listId: "l1",
    title: id,
    priority: "medium",
    recurrence: "none",
    createdAt: OLD,
    createdBy: "a",
    updatedAt: OLD,
    ...overrides,
  };
}

function state(tasks: Task[]): AppState {
  return {
    schemaVersion: 2,
    users: [
      { id: "a", name: "Nadja", updatedAt: OLD },
      { id: "b", name: "Gerald", updatedAt: OLD },
    ],
    lists: [{ id: "l1", name: "Aufgaben", position: 0, owner: "a", updatedAt: OLD }],
    tasks,
  };
}

const ids = (s: AppState) => s.tasks.map((t) => t.id).sort();

describe("purgeExpired", () => {
  it("keeps open tasks however old they are", () => {
    const s = purgeExpired(state([task("alt")]), NOW);
    expect(ids(s)).toEqual(["alt"]);
  });

  it("keeps a task finished within the retention window", () => {
    const s = purgeExpired(state([task("frisch", { completedAt: RECENT })]), NOW);
    expect(ids(s)).toEqual(["frisch"]);
  });

  it("drops a task finished long ago", () => {
    const s = purgeExpired(state([task("alt", { completedAt: OLD })]), NOW);
    expect(ids(s)).toEqual([]);
  });

  it("drops an old tombstone and keeps a recent one", () => {
    const s = purgeExpired(
      state([task("alt", { deletedAt: OLD }), task("neu", { deletedAt: RECENT })]),
      NOW,
    );
    expect(ids(s)).toEqual(["neu"]);
  });

  it("drops a tombstoned list once its retention has passed, with its tasks", () => {
    const base = state([task("darin")]);
    const withDeadList: AppState = {
      ...base,
      lists: [{ ...base.lists[0]!, deletedAt: OLD }],
    };
    expect(purgeExpired(withDeadList, NOW).lists).toEqual([]);
    expect(ids(purgeExpired(withDeadList, NOW))).toEqual([]);
  });

  it("returns the same object when there is nothing to drop", () => {
    const s = state([task("offen")]);
    expect(purgeExpired(s, NOW)).toBe(s);
  });

  it("is idempotent", () => {
    const once = purgeExpired(state([task("a", { completedAt: OLD }), task("b")]), NOW);
    expect(purgeExpired(once, NOW)).toBe(once);
  });

  it("ignores an unparseable timestamp rather than dropping the task", () => {
    const s = purgeExpired(state([task("kaputt", { completedAt: "keine-zeit" })]), NOW);
    expect(ids(s)).toEqual(["kaputt"]);
  });
});
