import { describe, expect, it } from "vitest";
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

describe("loadState", () => {
  it("returns a fresh initial state when nothing is stored", () => {
    const result = loadState(fakeStorage(), "Aufgaben", now);
    expect(result.recoveredFromCorrupt).toBe(false);
    expect(result.state.lists[0]?.name).toBe("Aufgaben");
    expect(result.state.tasks).toEqual([]);
  });

  it("loads a previously saved state", () => {
    const storage = fakeStorage();
    const state = createInitialState("Privat");
    expect(saveState(storage, state)).toBe(true);
    const result = loadState(storage, "Aufgaben", now);
    expect(result.state).toEqual(state);
    expect(result.recoveredFromCorrupt).toBe(false);
  });

  it("moves corrupt data to a backup key and starts fresh", () => {
    const storage = fakeStorage({ [STATE_KEY]: "{broken" });
    const result = loadState(storage, "Aufgaben", now);
    expect(result.recoveredFromCorrupt).toBe(true);
    expect(result.state.lists[0]?.name).toBe("Aufgaben");
    const backupKey = `${BACKUP_KEY_PREFIX}${now.toISOString()}`;
    expect(storage.getItem(backupKey)).toBe("{broken");
    expect(storage.getItem(STATE_KEY)).toBeNull();
  });

  it("treats schema-invalid JSON as corrupt", () => {
    const storage = fakeStorage({ [STATE_KEY]: JSON.stringify({ schemaVersion: 99 }) });
    const result = loadState(storage, "Aufgaben", now);
    expect(result.recoveredFromCorrupt).toBe(true);
  });
});

describe("saveState", () => {
  it("returns false when the storage throws", () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(saveState(storage, createInitialState("A"))).toBe(false);
  });
});
