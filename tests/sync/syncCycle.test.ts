import { describe, expect, it, vi } from "vitest";
import { inboxListId } from "../../src/domain/selectors";
import { addTask, createInitialState } from "../../src/domain/state";
import type { AppState } from "../../src/domain/types";
import { runSyncCycle } from "../../src/sync/syncCycle";
import type { PutResult, RemoteDocument, SyncClient } from "../../src/sync/syncClient";

const NOW = new Date("2026-09-20T10:00:00.000Z");
const NAMES = { a: "Person 1", b: "Person 2" };

function base(): AppState {
  return createInitialState("Aufgaben", NAMES, NOW);
}

function withTask(state: AppState, title: string, owner: "a" | "b" = "a"): AppState {
  return addTask(state, { listId: inboxListId(state, owner)!, title, createdBy: "a" }, NOW);
}

function client(overrides: Partial<SyncClient> = {}): SyncClient {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue({ ok: true, version: 1 } satisfies PutResult),
    ...overrides,
  };
}

describe("runSyncCycle adoption", () => {
  it("takes the server document as-is on a device that has never synced", async () => {
    const server = withTask(base(), "Vom Server");
    const remote: RemoteDocument = { version: 5, state: server };
    const c = client({ get: vi.fn().mockResolvedValue(remote) });

    const result = await runSyncCycle(c, withTask(base(), "Lokales Gerüst"), NOW, true);

    expect(result).toEqual({ outcome: "synced", state: server, version: 5 });
    expect(c.put).not.toHaveBeenCalled();
  });

  it("pushes the local state when the server holds nothing yet", async () => {
    const local = withTask(base(), "Erste Aufgabe");
    const c = client({ put: vi.fn().mockResolvedValue({ ok: true, version: 1 }) });

    const result = await runSyncCycle(c, local, NOW, true);

    expect(result).toEqual({ outcome: "synced", state: local, version: 1 });
    expect(c.put).toHaveBeenCalledWith(0, local);
  });
});

describe("runSyncCycle merging", () => {
  it("merges local and remote and pushes the result", async () => {
    const shared = base();
    const local = withTask(shared, "Lokal");
    const remoteState = withTask(shared, "Entfernt");
    const c = client({
      get: vi.fn().mockResolvedValue({ version: 2, state: remoteState }),
      put: vi.fn().mockResolvedValue({ ok: true, version: 3 }),
    });

    const result = await runSyncCycle(c, local, NOW, false);

    expect(result.outcome).toBe("synced");
    if (result.outcome !== "synced") throw new Error("expected a sync");
    expect(result.state.tasks.map((t) => t.title).sort()).toEqual(["Entfernt", "Lokal"]);
    expect(c.put).toHaveBeenCalledWith(2, result.state);
  });

  it("canonicalises a stored document once and then goes quiet", async () => {
    const twoTasks = withTask(withTask(base(), "Eins"), "Zwei");
    // A document stored before the ordering rule existed.
    const shared: AppState = { ...twoTasks, tasks: [...twoTasks.tasks].reverse() };
    // First pass: the stored document predates the canonical ordering, so one
    // write is expected to bring it in line.
    const first = client({
      get: vi.fn().mockResolvedValue({ version: 4, state: shared }),
      put: vi.fn().mockResolvedValue({ ok: true, version: 5 }),
    });
    const canonical = await runSyncCycle(first, shared, NOW, false);
    expect(canonical.outcome).toBe("synced");
    if (canonical.outcome !== "synced") throw new Error("expected a sync");
    expect(first.put).toHaveBeenCalledTimes(1);

    // Second pass against what was just written: nothing left to do. Without
    // this the two devices would rewrite the document at every poll forever.
    const second = client({
      get: vi.fn().mockResolvedValue({ version: 5, state: canonical.state }),
    });
    const result = await runSyncCycle(second, canonical.state, NOW, false);
    expect(result).toEqual({ outcome: "unchanged", state: canonical.state, version: 5 });
    expect(second.put).not.toHaveBeenCalled();
  });

  it("settles after two devices each add something, instead of writing forever", async () => {
    const shared = base();
    const listA = inboxListId(shared, "a")!;
    const deviceA = addTask(shared, { listId: listA, title: "von A", createdBy: "a" }, NOW);
    const deviceB = addTask(shared, { listId: listA, title: "von B", createdBy: "a" }, NOW);

    // A syncs first and its merge becomes the shared document.
    const aClient = client({
      get: vi.fn().mockResolvedValue({ version: 1, state: deviceB }),
      put: vi.fn().mockResolvedValue({ ok: true, version: 2 }),
    });
    const afterA = await runSyncCycle(aClient, deviceA, NOW, false);
    if (afterA.outcome !== "synced") throw new Error("expected a sync");

    // B then merges against it and must find nothing to write.
    const bClient = client({
      get: vi.fn().mockResolvedValue({ version: 2, state: afterA.state }),
    });
    const afterB = await runSyncCycle(bClient, deviceB, NOW, false);
    expect(afterB.outcome).toBe("unchanged");
    expect(bClient.put).not.toHaveBeenCalled();
  });

  it("re-merges against the document a conflict returned and writes again", async () => {
    const shared = base();
    const local = withTask(shared, "Lokal");
    const first = withTask(shared, "Entfernt 1");
    const conflicting = withTask(first, "Entfernt 2");
    const put = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, current: { version: 8, state: conflicting } })
      .mockResolvedValueOnce({ ok: true, version: 9 });
    const c = client({ get: vi.fn().mockResolvedValue({ version: 7, state: first }), put });

    const result = await runSyncCycle(c, local, NOW, false);

    expect(result.outcome).toBe("synced");
    if (result.outcome !== "synced") throw new Error("expected a sync");
    expect(result.state.tasks.map((t) => t.title).sort()).toEqual([
      "Entfernt 1",
      "Entfernt 2",
      "Lokal",
    ]);
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1]![0]).toBe(8);
  });

  it("gives up after three conflicts rather than looping forever", async () => {
    const shared = base();
    let version = 1;
    const put = vi.fn().mockImplementation(() => {
      version += 1;
      return Promise.resolve({
        ok: false,
        current: { version, state: withTask(shared, `Fremd ${version}`) },
      });
    });
    const c = client({ get: vi.fn().mockResolvedValue({ version: 1, state: shared }), put });

    const result = await runSyncCycle(c, withTask(shared, "Lokal"), NOW, false);

    expect(result).toEqual({ outcome: "conflict-exhausted" });
    expect(put).toHaveBeenCalledTimes(3);
  });

  it("propagates a failure from the server so the caller can report it", async () => {
    const c = client({ get: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    await expect(runSyncCycle(c, base(), NOW, false)).rejects.toThrow(TypeError);
  });
});
