import { describe, expect, it, vi } from "vitest";
import { inboxListId } from "../../src/domain/selectors";
import { addTask, createInitialState } from "../../src/domain/state";
import type { AppState } from "../../src/domain/types";
import { createSyncClient, SyncAuthError, SyncProtocolError } from "../../src/sync/syncClient";

const NOW = new Date("2026-09-20T10:00:00.000Z");
const NAMES = { a: "Person 1", b: "Person 2" };

function sample(): AppState {
  const initial = createInitialState("Aufgaben", NAMES, NOW);
  return addTask(
    initial,
    { listId: inboxListId(initial, "a")!, title: "Milch", createdBy: "a" },
    NOW,
  );
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createSyncClient.get", () => {
  it("sends the access code as a bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(200, { version: 0, state: null }));
    await createSyncClient("https://sync.example/", "s3cret", fetchImpl).get();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://sync.example/state");
    expect(init.headers.Authorization).toBe("Bearer s3cret");
  });

  it("returns the parsed document", async () => {
    const state = sample();
    const fetchImpl = vi.fn().mockResolvedValue(respond(200, { version: 7, state }));
    const result = await createSyncClient("https://sync.example", "c", fetchImpl).get();
    expect(result).toEqual({ version: 7, state });
  });

  it("returns null when the server holds nothing yet", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(200, { version: 0, state: null }));
    expect(await createSyncClient("https://sync.example", "c", fetchImpl).get()).toBeNull();
  });

  it("returns null on 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(404, { error: "not found" }));
    expect(await createSyncClient("https://sync.example", "c", fetchImpl).get()).toBeNull();
  });

  it("throws SyncAuthError when the code is refused", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(401, { error: "unauthorised" }));
    await expect(createSyncClient("https://sync.example", "c", fetchImpl).get()).rejects.toThrow(
      SyncAuthError,
    );
  });

  it("refuses a server document that fails validation", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(respond(200, { version: 1, state: { schemaVersion: 1 } }));
    await expect(createSyncClient("https://sync.example", "c", fetchImpl).get()).rejects.toThrow(
      SyncProtocolError,
    );
  });

  it("lets a network failure through so the caller can report offline", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(createSyncClient("https://sync.example", "c", fetchImpl).get()).rejects.toThrow(
      TypeError,
    );
  });
});

describe("createSyncClient.put", () => {
  it("sends the base version and the state", async () => {
    const state = sample();
    const fetchImpl = vi.fn().mockResolvedValue(respond(200, { version: 4 }));
    const result = await createSyncClient("https://sync.example", "c", fetchImpl).put(3, state);
    expect(result).toEqual({ ok: true, version: 4 });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body);
    expect(body.baseVersion).toBe(3);
    expect(body.state.tasks).toHaveLength(1);
  });

  it("reports a conflict with the current document", async () => {
    const state = sample();
    const fetchImpl = vi.fn().mockResolvedValue(respond(409, { version: 9, state }));
    const result = await createSyncClient("https://sync.example", "c", fetchImpl).put(3, state);
    expect(result).toEqual({ ok: false, current: { version: 9, state } });
  });

  it("throws SyncAuthError when the code is refused", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(401, {}));
    await expect(
      createSyncClient("https://sync.example", "c", fetchImpl).put(0, sample()),
    ).rejects.toThrow(SyncAuthError);
  });

  it("throws on an unexpected status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(500, {}));
    await expect(
      createSyncClient("https://sync.example", "c", fetchImpl).put(0, sample()),
    ).rejects.toThrow(SyncProtocolError);
  });

  it("gives every request a deadline so a hang cannot stall syncing forever", async () => {
    // A fresh Response per call: a body can only be read once.
    const fetchImpl = vi
      .fn()
      .mockImplementation(() => Promise.resolve(respond(200, { version: 1, state: sample() })));
    const client = createSyncClient("https://sync.example", "c", fetchImpl);
    await client.get();
    await client.put(0, sample());
    for (const call of fetchImpl.mock.calls) {
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("still sets a deadline on a browser without AbortSignal.timeout", async () => {
    const original = AbortSignal.timeout;
    // Safari before 16 has AbortController but not AbortSignal.timeout.
    (AbortSignal as unknown as { timeout?: unknown }).timeout = undefined;
    try {
      const fetchImpl = vi
        .fn()
        .mockImplementation(() => Promise.resolve(respond(200, { version: 0, state: null })));
      await createSyncClient("https://sync.example", "c", fetchImpl).get();
      expect(fetchImpl.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
      expect(fetchImpl.mock.calls[0]![1].signal.aborted).toBe(false);
    } finally {
      (AbortSignal as unknown as { timeout?: unknown }).timeout = original;
    }
  });
});
