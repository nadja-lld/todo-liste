import { describe, expect, it } from "vitest";
import { inboxListId, listsOf, liveLists, liveTasks } from "../../src/domain/selectors";
import {
  addList,
  addTask,
  clearCompleted,
  createInitialState,
  deleteList,
  deleteTask,
  markTaskSeen,
  moveList,
  renameList,
  toggleTask,
  updateTask,
} from "../../src/domain/state";
import type { AppState } from "../../src/domain/types";

const now = new Date(2026, 8, 14, 9, 0); // 14 Sep 2026 local
const later = new Date(2026, 8, 14, 11, 0);
const NAMES = { a: "Person 1", b: "Person 2" };

function initial(listName = "Aufgaben"): AppState {
  return createInitialState(listName, NAMES, now);
}

function stateWithTask(overrides: Partial<Parameters<typeof updateTask>[2]> = {}): {
  state: AppState;
  taskId: string;
  listId: string;
} {
  const start = initial();
  const listId = inboxListId(start, "a")!;
  let state = addTask(start, { listId, title: "Miete", createdBy: "a" }, now);
  const taskId = state.tasks[0]!.id;
  state = updateTask(state, taskId, overrides, now);
  return { state, taskId, listId };
}

describe("createInitialState", () => {
  it("creates one list per person and no tasks", () => {
    const state = initial();
    expect(state.schemaVersion).toBe(2);
    expect(state.users.map((u) => u.id)).toEqual(["a", "b"]);
    expect(listsOf(state, "a")).toHaveLength(1);
    expect(listsOf(state, "b")).toHaveLength(1);
    expect(state.tasks).toEqual([]);
  });
});

describe("addTask", () => {
  it("adds a medium-priority, non-recurring task with trimmed title", () => {
    const start = initial();
    const listId = inboxListId(start, "a")!;
    const state = addTask(start, { listId, title: "  Milch kaufen  ", createdBy: "a" }, now);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({
      listId,
      title: "Milch kaufen",
      priority: "medium",
      recurrence: "none",
      createdAt: now.toISOString(),
      createdBy: "a",
      updatedAt: now.toISOString(),
    });
    expect(start.tasks).toHaveLength(0);
  });

  it("ignores empty titles", () => {
    const start = initial();
    const state = addTask(
      start,
      { listId: inboxListId(start, "a")!, title: "   ", createdBy: "a" },
      now,
    );
    expect(state).toBe(start);
  });

  it("marks a task added to your own list as already seen", () => {
    const start = initial();
    const state = addTask(
      start,
      { listId: inboxListId(start, "a")!, title: "Für mich", createdBy: "a" },
      now,
    );
    expect(state.tasks[0]!.seenAt).toBe(now.toISOString());
  });

  it("leaves a task delegated to the other person unseen", () => {
    const start = initial();
    const state = addTask(
      start,
      { listId: inboxListId(start, "b")!, title: "Für dich", createdBy: "a" },
      now,
    );
    expect(state.tasks[0]).not.toHaveProperty("seenAt");
    expect(state.tasks[0]!.createdBy).toBe("a");
  });
});

describe("markTaskSeen", () => {
  it("stamps an unseen task once and never again", () => {
    const start = initial();
    let state = addTask(
      start,
      { listId: inboxListId(start, "b")!, title: "Für dich", createdBy: "a" },
      now,
    );
    const id = state.tasks[0]!.id;
    state = markTaskSeen(state, id, later);
    expect(state.tasks[0]!.seenAt).toBe(later.toISOString());
    const again = markTaskSeen(state, id, new Date(2026, 8, 14, 13, 0));
    expect(again).toBe(state);
  });

  it("ignores an unknown task", () => {
    const state = initial();
    expect(markTaskSeen(state, "nope", now)).toBe(state);
  });
});

describe("updateTask", () => {
  it("applies a patch and removes dueDate when set to undefined", () => {
    const { state, taskId } = stateWithTask({ dueDate: "2026-10-01", priority: "high" });
    expect(state.tasks[0]).toMatchObject({ dueDate: "2026-10-01", priority: "high" });
    const cleared = updateTask(state, taskId, { dueDate: undefined }, now);
    expect(cleared.tasks[0]).not.toHaveProperty("dueDate");
  });

  it("keeps required fields when the patch sets them to undefined", () => {
    const { state, taskId } = stateWithTask();
    const result = updateTask(state, taskId, { title: undefined, priority: undefined }, now);
    expect(result.tasks[0]).toMatchObject({ title: "Miete", priority: "medium" });
  });

  it("trims the title and drops an empty note", () => {
    const { state, taskId } = stateWithTask();
    const result = updateTask(state, taskId, { title: "  Miete zahlen  ", note: "   " }, now);
    expect(result.tasks[0]).toMatchObject({ title: "Miete zahlen" });
    expect(result.tasks[0]).not.toHaveProperty("note");
  });

  it("clears the note when set to undefined", () => {
    const { state, taskId } = stateWithTask({ note: "Bank" });
    expect(state.tasks[0]).toHaveProperty("note", "Bank");
    const result = updateTask(state, taskId, { note: undefined }, now);
    expect(result.tasks[0]).not.toHaveProperty("note");
  });

  it("stamps updatedAt so the change wins a later merge", () => {
    const { state, taskId } = stateWithTask();
    const edited = updateTask(state, taskId, { title: "Brot" }, later);
    expect(edited.tasks[0]!.updatedAt).toBe(later.toISOString());
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
      createdBy: "a",
    });
    expect(next).not.toHaveProperty("completedAt");
  });

  it("marks the generated follow-up as seen so it never reads as delegated", () => {
    const start = initial();
    let state = addTask(
      start,
      { listId: inboxListId(start, "b")!, title: "Müll", createdBy: "a" },
      now,
    );
    const id = state.tasks[0]!.id;
    state = updateTask(state, id, { recurrence: "daily", dueDate: "2026-09-14" }, now);
    state = toggleTask(state, id, now);
    const followUp = state.tasks.find((t) => t.id !== id)!;
    expect(followUp.seenAt).toBe(now.toISOString());
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
  it("tombstones a task instead of dropping it", () => {
    const { state, taskId } = stateWithTask();
    const after = deleteTask(state, taskId, now);
    expect(after.tasks).toHaveLength(1);
    expect(after.tasks[0]!.deletedAt).toBe(now.toISOString());
    expect(liveTasks(after)).toEqual([]);
  });

  it("returns the same state when deleting an unknown task", () => {
    const { state } = stateWithTask();
    expect(deleteTask(state, "nope", now)).toBe(state);
  });

  it("returns the same state when deleting an already deleted task", () => {
    const { state, taskId } = stateWithTask();
    const once = deleteTask(state, taskId, now);
    expect(deleteTask(once, taskId, later)).toBe(once);
  });

  it("clears only completed tasks", () => {
    const { state, taskId, listId } = stateWithTask();
    const withSecond = addTask(state, { listId, title: "Offen", createdBy: "a" }, now);
    const done = toggleTask(withSecond, taskId, now);
    const cleared = clearCompleted(done, "a", now);
    expect(liveTasks(cleared).map((t) => t.title)).toEqual(["Offen"]);
  });

  it("leaves the other person's completed tasks alone", () => {
    const start = initial();
    let state = addTask(
      start,
      { listId: inboxListId(start, "a")!, title: "Meins", createdBy: "a" },
      now,
    );
    state = addTask(
      state,
      { listId: inboxListId(state, "b")!, title: "Deins", createdBy: "b" },
      now,
    );
    state = toggleTask(state, state.tasks[0]!.id, now);
    state = toggleTask(state, state.tasks[1]!.id, now);
    const cleared = clearCompleted(state, "a", now);
    expect(liveTasks(cleared).map((t) => t.title)).toEqual(["Deins"]);
  });

  it("returns the same state when nothing is completed", () => {
    const { state } = stateWithTask();
    expect(clearCompleted(state, "a", now)).toBe(state);
  });
});

describe("lists", () => {
  it("adds a list at the end with the next position", () => {
    const state = addList(initial(), "Einkauf", "a", now);
    expect(listsOf(state, "a").map((l) => l.name)).toEqual(["Aufgaben", "Einkauf"]);
  });

  it("ignores empty list names", () => {
    const start = initial();
    expect(addList(start, "  ", "a", now)).toBe(start);
  });

  it("renames a list", () => {
    const start = initial();
    const renamed = renameList(start, inboxListId(start, "a")!, "Privat", now);
    expect(listsOf(renamed, "a")[0]!.name).toBe("Privat");
  });

  it("returns the same state when renaming an unknown list", () => {
    const start = initial();
    expect(renameList(start, "nope", "X", now)).toBe(start);
  });

  it("moves a list up and down within its owner and ignores moves past the edges", () => {
    let state = addList(addList(initial("A"), "B", "a", now), "C", "a", now);
    const idC = listsOf(state, "a")[2]!.id;
    state = moveList(state, idC, "up", now);
    expect(listsOf(state, "a").map((l) => l.name)).toEqual(["A", "C", "B"]);
    state = moveList(state, idC, "up", now);
    expect(listsOf(state, "a").map((l) => l.name)).toEqual(["C", "A", "B"]);
    const unchanged = moveList(state, idC, "up", now);
    expect(listsOf(unchanged, "a").map((l) => l.name)).toEqual(["C", "A", "B"]);
    state = moveList(state, idC, "down", now);
    expect(listsOf(state, "a").map((l) => l.name)).toEqual(["A", "C", "B"]);
  });

  it("never reorders across people", () => {
    const start = initial("A");
    const bList = inboxListId(start, "b")!;
    const state = moveList(start, bList, "up", now);
    expect(state).toBe(start);
  });

  it("tombstones a list together with its tasks", () => {
    let state = addList(initial("A"), "B", "a", now);
    const idB = listsOf(state, "a")[1]!.id;
    state = addTask(state, { listId: idB, title: "In B", createdBy: "a" }, now);
    state = addTask(
      state,
      { listId: inboxListId(state, "a")!, title: "In A", createdBy: "a" },
      now,
    );
    const after = deleteList(state, idB, now);
    expect(listsOf(after, "a").map((l) => l.name)).toEqual(["A"]);
    expect(liveTasks(after).map((t) => t.title)).toEqual(["In A"]);
    expect(after.tasks.find((t) => t.title === "In B")!.deletedAt).toBe(now.toISOString());
    expect(after.lists).toHaveLength(3); // tombstone retained for the merge
  });

  it("refuses to delete the owner's last remaining list", () => {
    const start = initial("A");
    expect(deleteList(start, inboxListId(start, "a")!, now)).toBe(start);
  });

  it("hides tombstoned lists from liveLists but keeps the other person's", () => {
    let state = addList(initial("A"), "B", "a", now);
    const idB = listsOf(state, "a")[1]!.id;
    state = deleteList(state, idB, now);
    expect(liveLists(state).map((l) => l.name)).toEqual(["A", "A"]);
  });
});

describe("inboxListId", () => {
  it("gives each person their own inbox", () => {
    const state = initial();
    expect(inboxListId(state, "a")).not.toBeNull();
    expect(inboxListId(state, "b")).not.toBeNull();
    expect(inboxListId(state, "a")).not.toBe(inboxListId(state, "b"));
  });

  it("returns the lowest-position live list", () => {
    const state = addList(initial(), "Zweitliste", "a", now);
    expect(inboxListId(state, "a")).toBe(listsOf(state, "a")[0]!.id);
  });
});
