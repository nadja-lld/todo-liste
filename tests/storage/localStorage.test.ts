import { describe, expect, it } from "vitest";
import { inboxListId, listsOf } from "../../src/domain/selectors";
import { createInitialState } from "../../src/domain/state";
import { BACKUP_KEY_PREFIX, loadState, saveState, STATE_KEY } from "../../src/storage/localStorage";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const now = new Date(2026, 8, 14, 9, 0);
const NAMES = { a: "Person 1", b: "Person 2" };

describe("loadState", () => {
  it("returns a fresh initial state when nothing is stored", () => {
    const result = loadState(fakeStorage(), "Aufgaben", NAMES, now);
    expect(result.recoveredFromCorrupt).toBe(false);
    expect(result.state.lists[0]?.name).toBe("Aufgaben");
    expect(result.state.tasks).toEqual([]);
  });

  it("loads a previously saved state", () => {
    const storage = fakeStorage();
    const state = createInitialState("Privat", NAMES, now);
    expect(saveState(storage, state)).toBe(true);
    const result = loadState(storage, "Aufgaben", NAMES, now);
    expect(result.state).toEqual(state);
    expect(result.recoveredFromCorrupt).toBe(false);
  });

  it("moves corrupt data to a backup key and starts fresh", () => {
    const storage = fakeStorage({ [STATE_KEY]: "{broken" });
    const result = loadState(storage, "Aufgaben", NAMES, now);
    expect(result.recoveredFromCorrupt).toBe(true);
    expect(result.state.lists[0]?.name).toBe("Aufgaben");
    const backupKey = `${BACKUP_KEY_PREFIX}${now.toISOString()}`;
    expect(storage.getItem(backupKey)).toBe("{broken");
    expect(storage.getItem(STATE_KEY)).toBeNull();
  });

  it("treats schema-invalid JSON as corrupt", () => {
    const storage = fakeStorage({ [STATE_KEY]: JSON.stringify({ schemaVersion: 99 }) });
    const result = loadState(storage, "Aufgaben", NAMES, now);
    expect(result.recoveredFromCorrupt).toBe(true);
  });

  it("does not throw and keeps the corrupt data when the backup write fails", () => {
    const storage = fakeStorage({ [STATE_KEY]: "{broken" });
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const result = loadState(storage, "Aufgaben", NAMES, now);
    expect(result.recoveredFromCorrupt).toBe(true);
    expect(result.state.lists[0]?.name).toBe("Aufgaben");
    expect(storage.getItem(STATE_KEY)).toBe("{broken");
  });
});

describe("saveState", () => {
  it("returns false when the storage throws", () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(saveState(storage, createInitialState("A", NAMES, now))).toBe(false);
  });
});

describe("loadState migration", () => {
  it("loads a stored v1 document by migrating it instead of quarantining it", () => {
    const v1 = {
      schemaVersion: 1,
      lists: [{ id: "l1", name: "Alt", position: 0 }],
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
    };
    const storage = fakeStorage({ [STATE_KEY]: JSON.stringify(v1) });
    const result = loadState(storage, "Aufgaben", NAMES, now);
    expect(result.recoveredFromCorrupt).toBe(false);
    expect(listsOf(result.state, "a").map((l) => l.name)).toEqual(["Alt"]);
    expect(result.state.tasks).toHaveLength(1);
    expect(inboxListId(result.state, "b")).not.toBeNull();
  });
});
