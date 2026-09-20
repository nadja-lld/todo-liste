import { describe, expect, it } from "vitest";
import { delegatedBy, inboxListId } from "../../src/domain/selectors";
import { addTask, createInitialState, deleteTask, toggleTask } from "../../src/domain/state";
import type { AppState } from "../../src/domain/types";

const now = new Date(2026, 8, 14, 9, 0);
const NAMES = { a: "Nadja", b: "Gerald" };

function withTask(state: AppState, title: string, owner: "a" | "b", createdBy: "a" | "b") {
  return addTask(state, { listId: inboxListId(state, owner)!, title, createdBy }, now);
}

describe("delegatedBy", () => {
  it("lists what I put on the other person's list", () => {
    let state = createInitialState("Aufgaben", NAMES, now);
    state = withTask(state, "Für Gerald", "b", "a");
    expect(delegatedBy(state, "a").map((t) => t.title)).toEqual(["Für Gerald"]);
  });

  it("ignores my own tasks", () => {
    let state = createInitialState("Aufgaben", NAMES, now);
    state = withTask(state, "Für mich", "a", "a");
    expect(delegatedBy(state, "a")).toEqual([]);
  });

  it("ignores what the other person put on their own list", () => {
    let state = createInitialState("Aufgaben", NAMES, now);
    state = withTask(state, "Seins", "b", "b");
    expect(delegatedBy(state, "a")).toEqual([]);
  });

  it("ignores what the other person put on my list", () => {
    let state = createInitialState("Aufgaben", NAMES, now);
    state = withTask(state, "Von Gerald", "a", "b");
    expect(delegatedBy(state, "a")).toEqual([]);
  });

  it("keeps a handed-over task after it was completed, so the outcome is visible", () => {
    let state = createInitialState("Aufgaben", NAMES, now);
    state = withTask(state, "Müll", "b", "a");
    state = toggleTask(state, state.tasks[0]!.id, now);
    const [task] = delegatedBy(state, "a");
    expect(task?.completedAt).toBeDefined();
  });

  it("drops a handed-over task once it is deleted", () => {
    let state = createInitialState("Aufgaben", NAMES, now);
    state = withTask(state, "Müll", "b", "a");
    state = deleteTask(state, state.tasks[0]!.id, now);
    expect(delegatedBy(state, "a")).toEqual([]);
  });

  it("sees it from the other side too", () => {
    let state = createInitialState("Aufgaben", NAMES, now);
    state = withTask(state, "Für Nadja", "a", "b");
    expect(delegatedBy(state, "b").map((t) => t.title)).toEqual(["Für Nadja"]);
  });
});
