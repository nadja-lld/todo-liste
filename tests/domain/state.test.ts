import { describe, expect, it } from "vitest";
import {
  addList,
  addTask,
  clearCompleted,
  createInitialState,
  deleteList,
  deleteTask,
  moveList,
  renameList,
  sortedLists,
  toggleTask,
  updateTask,
} from "../../src/domain/state";
import type { AppState } from "../../src/domain/types";

const now = new Date(2026, 8, 14, 9, 0); // 14 Sep 2026 local

function stateWithTask(overrides: Partial<Parameters<typeof updateTask>[2]> = {}): {
  state: AppState;
  taskId: string;
  listId: string;
} {
  const initial = createInitialState("Aufgaben");
  const listId = initial.lists[0]!.id;
  let state = addTask(initial, { listId, title: "Miete" }, now);
  const taskId = state.tasks[0]!.id;
  state = updateTask(state, taskId, overrides);
  return { state, taskId, listId };
}

describe("createInitialState", () => {
  it("creates one default list and no tasks", () => {
    const state = createInitialState("Aufgaben");
    expect(state.schemaVersion).toBe(1);
    expect(state.lists).toHaveLength(1);
    expect(state.lists[0]?.name).toBe("Aufgaben");
    expect(state.tasks).toEqual([]);
  });
});

describe("addTask", () => {
  it("adds a medium-priority, non-recurring task with trimmed title", () => {
    const initial = createInitialState("Aufgaben");
    const listId = initial.lists[0]!.id;
    const state = addTask(initial, { listId, title: "  Milch kaufen  " }, now);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({
      listId,
      title: "Milch kaufen",
      priority: "medium",
      recurrence: "none",
      createdAt: now.toISOString(),
    });
    expect(initial.tasks).toHaveLength(0);
  });

  it("ignores empty titles", () => {
    const initial = createInitialState("Aufgaben");
    const state = addTask(initial, { listId: initial.lists[0]!.id, title: "   " }, now);
    expect(state).toBe(initial);
  });
});

describe("updateTask", () => {
  it("applies a patch and removes dueDate when set to undefined", () => {
    const { state, taskId } = stateWithTask({ dueDate: "2026-10-01", priority: "high" });
    expect(state.tasks[0]).toMatchObject({ dueDate: "2026-10-01", priority: "high" });
    const cleared = updateTask(state, taskId, { dueDate: undefined });
    expect(cleared.tasks[0]).not.toHaveProperty("dueDate");
  });

  it("keeps required fields when the patch sets them to undefined", () => {
    const { state, taskId } = stateWithTask();
    const result = updateTask(state, taskId, { title: undefined, priority: undefined });
    expect(result.tasks[0]).toMatchObject({ title: "Miete", priority: "medium" });
  });

  it("trims the title and drops an empty note", () => {
    const { state, taskId } = stateWithTask();
    const result = updateTask(state, taskId, { title: "  Miete zahlen  ", note: "   " });
    expect(result.tasks[0]).toMatchObject({ title: "Miete zahlen" });
    expect(result.tasks[0]).not.toHaveProperty("note");
  });

  it("clears the note when set to undefined", () => {
    const { state, taskId } = stateWithTask({ note: "Bank" });
    expect(state.tasks[0]).toHaveProperty("note", "Bank");
    const result = updateTask(state, taskId, { note: undefined });
    expect(result.tasks[0]).not.toHaveProperty("note");
  });
});

describe("toggleTask", () => {
  it("completes an open task with a timestamp", () => {
    const { state, taskId } = stateWithTask();
    const done = toggleTask(state, taskId, now);
    expect(done.tasks[0]?.completedAt).toBe(now.toISOString());
  });

  it("reopens a completed task", () => {
    const { state, taskId } = stateWithTask();
    const reopened = toggleTask(toggleTask(state, taskId, now), taskId, now);
    expect(reopened.tasks[0]).not.toHaveProperty("completedAt");
  });

  it("creates the next instance for a recurring task based on its due date", () => {
    const { state, taskId, listId } = stateWithTask({
      dueDate: "2026-09-10",
      recurrence: "weekly",
      priority: "high",
      note: "Bank",
    });
    const done = toggleTask(state, taskId, now);
    expect(done.tasks).toHaveLength(2);
    const original = done.tasks.find((t) => t.id === taskId)!;
    const next = done.tasks.find((t) => t.id !== taskId)!;
    expect(original.completedAt).toBe(now.toISOString());
    expect(next).toMatchObject({
      listId,
      title: "Miete",
      note: "Bank",
      priority: "high",
      recurrence: "weekly",
      dueDate: "2026-09-17",
      createdAt: now.toISOString(),
    });
    expect(next).not.toHaveProperty("completedAt");
  });

  it("uses today as the base when a recurring task has no due date", () => {
    const { state, taskId } = stateWithTask({ recurrence: "daily" });
    const done = toggleTask(state, taskId, now);
    const next = done.tasks.find((t) => t.id !== taskId)!;
    expect(next.dueDate).toBe("2026-09-15");
  });

  it("does not create another instance when reopening a recurring task", () => {
    const { state, taskId } = stateWithTask({ recurrence: "daily" });
    const done = toggleTask(state, taskId, now);
    const reopened = toggleTask(done, taskId, now);
    expect(reopened.tasks).toHaveLength(2);
  });
});

describe("deleteTask / clearCompleted", () => {
  it("deletes a task by id", () => {
    const { state, taskId } = stateWithTask();
    expect(deleteTask(state, taskId).tasks).toEqual([]);
  });

  it("returns the same state when deleting an unknown task", () => {
    const { state } = stateWithTask();
    expect(deleteTask(state, "nope")).toBe(state);
  });

  it("removes only completed tasks", () => {
    const { state, taskId, listId } = stateWithTask();
    const withSecond = addTask(state, { listId, title: "Offen" }, now);
    const done = toggleTask(withSecond, taskId, now);
    const cleared = clearCompleted(done);
    expect(cleared.tasks.map((t) => t.title)).toEqual(["Offen"]);
  });

  it("returns the same state when nothing is completed", () => {
    const { state } = stateWithTask();
    expect(clearCompleted(state)).toBe(state);
  });
});

describe("lists", () => {
  it("adds a list at the end with the next position", () => {
    const state = addList(createInitialState("Aufgaben"), "Einkauf");
    expect(sortedLists(state).map((l) => l.name)).toEqual(["Aufgaben", "Einkauf"]);
    expect(state.lists[1]?.position).toBe(1);
  });

  it("ignores empty list names", () => {
    const initial = createInitialState("Aufgaben");
    expect(addList(initial, "  ")).toBe(initial);
  });

  it("renames a list", () => {
    const initial = createInitialState("Aufgaben");
    const renamed = renameList(initial, initial.lists[0]!.id, "Privat");
    expect(renamed.lists[0]?.name).toBe("Privat");
  });

  it("returns the same state when renaming an unknown list", () => {
    const initial = createInitialState("Aufgaben");
    expect(renameList(initial, "nope", "X")).toBe(initial);
  });

  it("moves a list up and down and ignores moves past the edges", () => {
    let state = addList(addList(createInitialState("A"), "B"), "C");
    const idC = sortedLists(state)[2]!.id;
    state = moveList(state, idC, "up");
    expect(sortedLists(state).map((l) => l.name)).toEqual(["A", "C", "B"]);
    state = moveList(state, idC, "up");
    expect(sortedLists(state).map((l) => l.name)).toEqual(["C", "A", "B"]);
    const unchanged = moveList(state, idC, "up");
    expect(sortedLists(unchanged).map((l) => l.name)).toEqual(["C", "A", "B"]);
    state = moveList(state, idC, "down");
    expect(sortedLists(state).map((l) => l.name)).toEqual(["A", "C", "B"]);
  });

  it("deletes a list together with its tasks", () => {
    let state = addList(createInitialState("A"), "B");
    const idB = sortedLists(state)[1]!.id;
    state = addTask(state, { listId: idB, title: "In B" }, now);
    state = addTask(state, { listId: state.lists[0]!.id, title: "In A" }, now);
    const after = deleteList(state, idB);
    expect(after.lists.map((l) => l.name)).toEqual(["A"]);
    expect(after.tasks.map((t) => t.title)).toEqual(["In A"]);
  });

  it("refuses to delete the last remaining list", () => {
    const initial = createInitialState("A");
    expect(deleteList(initial, initial.lists[0]!.id)).toBe(initial);
  });
});
