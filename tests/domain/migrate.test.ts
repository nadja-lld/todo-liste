import { describe, expect, it } from "vitest";
import { migrate } from "../../src/domain/migrate";
import { parseAppState } from "../../src/domain/schema";

const NOW = new Date("2026-09-20T10:00:00.000Z");
const NAMES = { a: "Person 1", b: "Person 2" };

const V1 = {
  schemaVersion: 1,
  lists: [{ id: "l1", name: "Aufgaben", position: 0 }],
  tasks: [
    {
      id: "t1",
      listId: "l1",
      title: "Milch",
      priority: "medium",
      recurrence: "none",
      createdAt: "2026-09-14T08:00:00.000Z",
    },
  ],
};

function migrated() {
  const parsed = parseAppState(migrate(structuredClone(V1), NAMES, NOW));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.state;
}

describe("migrate", () => {
  it("upgrades a v1 document into a valid v2 document", () => {
    expect(parseAppState(migrate(structuredClone(V1), NAMES, NOW)).ok).toBe(true);
  });

  it("keeps existing data as person a", () => {
    const state = migrated();
    expect(state.lists.find((l) => l.id === "l1")!.owner).toBe("a");
    expect(state.tasks[0]!.createdBy).toBe("a");
    expect(state.users.map((u) => u.id)).toEqual(["a", "b"]);
  });

  it("dates the existing task's updatedAt from its creation, not from now", () => {
    expect(migrated().tasks[0]!.updatedAt).toBe("2026-09-14T08:00:00.000Z");
  });

  it("marks existing tasks as seen so none of them look delegated", () => {
    expect(migrated().tasks[0]!.seenAt).toBe(NOW.toISOString());
  });

  it("gives person b an inbox list so tasks can be delegated to them", () => {
    const state = migrated();
    const bLists = state.lists.filter((l) => l.owner === "b");
    expect(bLists).toHaveLength(1);
    expect(bLists[0]!.position).toBe(1);
  });

  it("passes a v2 document through untouched", () => {
    const v2 = migrate(structuredClone(V1), NAMES, NOW);
    expect(migrate(structuredClone(v2), NAMES, NOW)).toEqual(v2);
  });

  it("leaves an unknown version alone so it is quarantined as corrupt", () => {
    const future = { schemaVersion: 99 };
    expect(migrate(future, NAMES, NOW)).toEqual(future);
    expect(migrate("nonsense", NAMES, NOW)).toBe("nonsense");
  });

  it("survives a v1 document with no lists or tasks", () => {
    const empty = { schemaVersion: 1 };
    expect(parseAppState(migrate(empty, NAMES, NOW)).ok).toBe(true);
  });
});
