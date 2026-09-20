import { describe, expect, it } from "vitest";
import { exportFileName, parseImport, serializeState } from "../../src/domain/exportImport";
import { inboxListId } from "../../src/domain/selectors";
import { addTask, createInitialState } from "../../src/domain/state";

const now = new Date(2026, 8, 14, 9, 0);
const NAMES = { a: "Person 1", b: "Person 2" };

describe("serializeState / parseImport", () => {
  it("round-trips a state and reports counts", () => {
    const initial = createInitialState("Aufgaben", NAMES, now);
    const state = addTask(
      initial,
      { listId: inboxListId(initial, "a")!, title: "Milch", createdBy: "a" },
      now,
    );
    const text = serializeState(state);
    expect(text.endsWith("\n")).toBe(true);
    const result = parseImport(text, NAMES, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toEqual(state);
      expect(result.listCount).toBe(2);
      expect(result.taskCount).toBe(1);
    }
  });

  it("rejects text that is not JSON", () => {
    const result = parseImport("{not json", NAMES, now);
    expect(result).toEqual({ ok: false, error: "invalid JSON" });
  });

  it("rejects JSON that fails schema validation", () => {
    const result = parseImport(
      JSON.stringify({ schemaVersion: 2, users: [], lists: [], tasks: "x" }),
      NAMES,
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("tasks must be an array");
  });

  it("imports a backup exported before the second person existed", () => {
    const v1 = JSON.stringify({
      schemaVersion: 1,
      lists: [{ id: "l1", name: "Aufgaben", position: 0 }],
      tasks: [
        {
          id: "t1",
          listId: "l1",
          title: "Milch",
          priority: "medium",
          recurrence: "none",
          createdAt: "2026-09-01T08:00:00.000Z",
        },
      ],
    });
    const result = parseImport(v1, NAMES, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.lists[0]!.owner).toBe("a");
      expect(result.state.tasks[0]!.createdBy).toBe("a");
    }
  });
});

describe("exportFileName", () => {
  it("embeds the date", () => expect(exportFileName("2026-09-14")).toBe("todos-2026-09-14.json"));
});
