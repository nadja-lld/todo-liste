import { describe, expect, it } from "vitest";
import { mergeState } from "../../src/domain/merge";
import type { AppState, Task, TodoList } from "../../src/domain/types";

const AT = (iso: string) => new Date(iso).toISOString();
const NOW = new Date("2026-09-20T12:00:00.000Z");

function list(id: string, overrides: Partial<TodoList> = {}): TodoList {
  return {
    id,
    name: id,
    position: 0,
    owner: "a",
    updatedAt: AT("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    listId: "l1",
    title: id,
    priority: "medium",
    recurrence: "none",
    createdAt: AT("2026-09-01T00:00:00Z"),
    createdBy: "a",
    updatedAt: AT("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    schemaVersion: 2,
    users: [
      { id: "a", name: "Person 1", updatedAt: AT("2026-09-01T00:00:00Z") },
      { id: "b", name: "Person 2", updatedAt: AT("2026-09-01T00:00:00Z") },
    ],
    lists: [list("l1")],
    tasks: [],
    ...overrides,
  };
}

function byId<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}

function normalise(s: AppState): AppState {
  const sort = <T extends { id: string }>(items: T[]) =>
    [...items].sort((x, y) => (x.id < y.id ? -1 : 1));
  return { ...s, users: sort(s.users), lists: sort(s.lists), tasks: sort(s.tasks) };
}

describe("mergeState", () => {
  it("keeps a task that only the local side has", () => {
    const local = state({ tasks: [task("t1")] });
    const merged = mergeState(local, state(), NOW);
    expect(byId(merged.tasks, "t1")).toBeDefined();
  });

  it("keeps a task that only the remote side has", () => {
    const remote = state({ tasks: [task("t1")] });
    const merged = mergeState(state(), remote, NOW);
    expect(byId(merged.tasks, "t1")).toBeDefined();
  });

  it("lets the later edit of the same task win", () => {
    const local = state({
      tasks: [task("t1", { title: "Alt", updatedAt: AT("2026-09-10T00:00:00Z") })],
    });
    const remote = state({
      tasks: [task("t1", { title: "Neu", updatedAt: AT("2026-09-12T00:00:00Z") })],
    });
    expect(byId(mergeState(local, remote, NOW).tasks, "t1")!.title).toBe("Neu");
    expect(byId(mergeState(remote, local, NOW).tasks, "t1")!.title).toBe("Neu");
  });

  it("breaks an exact timestamp tie by id so both devices agree", () => {
    const same = AT("2026-09-10T00:00:00Z");
    const local = state({ tasks: [task("t1", { title: "Links", updatedAt: same })] });
    const remote = state({ tasks: [task("t1", { title: "Rechts", updatedAt: same })] });
    // Same id on both sides: the tie-break must still be deterministic.
    const a = byId(mergeState(local, remote, NOW).tasks, "t1")!.title;
    const b = byId(mergeState(remote, local, NOW).tasks, "t1")!.title;
    expect(a).toBe(b);
  });

  it("lets a later delete beat an earlier completion", () => {
    const local = state({
      tasks: [
        task("t1", {
          completedAt: AT("2026-09-10T00:00:00Z"),
          updatedAt: AT("2026-09-10T00:00:00Z"),
        }),
      ],
    });
    const remote = state({
      tasks: [
        task("t1", {
          deletedAt: AT("2026-09-11T00:00:00Z"),
          updatedAt: AT("2026-09-11T00:00:00Z"),
        }),
      ],
    });
    expect(byId(mergeState(local, remote, NOW).tasks, "t1")!.deletedAt).toBeDefined();
  });

  it("lets a later completion beat an earlier delete, bringing the task back", () => {
    const local = state({
      tasks: [
        task("t1", {
          deletedAt: AT("2026-09-10T00:00:00Z"),
          updatedAt: AT("2026-09-10T00:00:00Z"),
        }),
      ],
    });
    const remote = state({
      tasks: [
        task("t1", {
          completedAt: AT("2026-09-11T00:00:00Z"),
          updatedAt: AT("2026-09-11T00:00:00Z"),
        }),
      ],
    });
    const merged = byId(mergeState(local, remote, NOW).tasks, "t1")!;
    expect(merged.deletedAt).toBeUndefined();
    expect(merged.completedAt).toBeDefined();
  });

  it("merges a list rename independently of its tasks", () => {
    const local = state({
      lists: [list("l1", { name: "Alt", updatedAt: AT("2026-09-10T00:00:00Z") })],
      tasks: [task("t1", { title: "Neu", updatedAt: AT("2026-09-12T00:00:00Z") })],
    });
    const remote = state({
      lists: [list("l1", { name: "Neu", updatedAt: AT("2026-09-11T00:00:00Z") })],
      tasks: [task("t1", { title: "Alt", updatedAt: AT("2026-09-10T00:00:00Z") })],
    });
    const merged = mergeState(local, remote, NOW);
    expect(byId(merged.lists, "l1")!.name).toBe("Neu");
    expect(byId(merged.tasks, "t1")!.title).toBe("Neu");
  });

  it("merges a person's rename by updatedAt", () => {
    const local = state();
    const remote = state({
      users: [
        { id: "a", name: "Nadja", updatedAt: AT("2026-09-15T00:00:00Z") },
        { id: "b", name: "Person 2", updatedAt: AT("2026-09-01T00:00:00Z") },
      ],
    });
    expect(byId(mergeState(local, remote, NOW).users, "a")!.name).toBe("Nadja");
  });

  it("drops tombstones older than 30 days and keeps younger ones", () => {
    const old = AT("2026-08-01T00:00:00Z"); // 50 days before NOW
    const recent = AT("2026-09-15T00:00:00Z"); // 5 days before NOW
    const local = state({
      lists: [list("l1"), list("l2", { deletedAt: old, updatedAt: old })],
      tasks: [
        task("t1", { deletedAt: old, updatedAt: old }),
        task("t2", { deletedAt: recent, updatedAt: recent }),
      ],
    });
    const merged = mergeState(local, state(), NOW);
    expect(byId(merged.tasks, "t1")).toBeUndefined();
    expect(byId(merged.tasks, "t2")).toBeDefined();
    expect(byId(merged.lists, "l2")).toBeUndefined();
  });

  it("is commutative", () => {
    const local = state({
      lists: [list("l1", { name: "L", updatedAt: AT("2026-09-10T00:00:00Z") }), list("l2")],
      tasks: [task("t1", { updatedAt: AT("2026-09-12T00:00:00Z") }), task("t3")],
    });
    const remote = state({
      lists: [list("l1", { name: "R", updatedAt: AT("2026-09-11T00:00:00Z") })],
      tasks: [task("t1", { updatedAt: AT("2026-09-09T00:00:00Z") }), task("t2")],
    });
    expect(normalise(mergeState(local, remote, NOW))).toEqual(
      normalise(mergeState(remote, local, NOW)),
    );
  });

  it("is idempotent", () => {
    const local = state({ tasks: [task("t1"), task("t2")] });
    const once = mergeState(local, state(), NOW);
    expect(normalise(mergeState(once, once, NOW))).toEqual(normalise(once));
  });
});
