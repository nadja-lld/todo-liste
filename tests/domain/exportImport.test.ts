import { describe, expect, it } from "vitest";
import { exportFileName, parseImport, serializeState } from "../../src/domain/exportImport";
import { addTask, createInitialState } from "../../src/domain/state";

const now = new Date(2026, 8, 14, 9, 0);

describe("serializeState / parseImport", () => {
  it("round-trips a state and reports counts", () => {
    const initial = createInitialState("Aufgaben");
    const state = addTask(initial, { listId: initial.lists[0]!.id, title: "Milch" }, now);
    const text = serializeState(state);
    expect(text.endsWith("\n")).toBe(true);
    const result = parseImport(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toEqual(state);
      expect(result.listCount).toBe(1);
      expect(result.taskCount).toBe(1);
    }
  });

  it("rejects text that is not JSON", () => {
    const result = parseImport("{not json");
    expect(result).toEqual({ ok: false, error: "invalid JSON" });
  });

  it("rejects JSON that fails schema validation", () => {
    const result = parseImport(JSON.stringify({ schemaVersion: 1, lists: [], tasks: "x" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("tasks must be an array");
  });
});

describe("exportFileName", () => {
  it("embeds the date", () => expect(exportFileName("2026-09-14")).toBe("todos-2026-09-14.json"));
});
