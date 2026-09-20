// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inboxListId } from "../../src/domain/selectors";
import { addTask, createInitialState } from "../../src/domain/state";
import type { AppState } from "../../src/domain/types";
import { ADOPTED_KEY } from "../../src/storage/deviceSettings";
import type { SyncStatus } from "../../src/sync/status";
import { useSync } from "../../src/ui/useSync";

const NOW = new Date("2026-09-20T10:00:00.000Z");
const NAMES = { a: "Person 1", b: "Person 2" };

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

function configured(extra: Record<string, string> = {}): Storage {
  return fakeStorage({ "todo.identity": "a", "todo.accessCode": "s3cret", ...extra });
}

function base(): AppState {
  return createInitialState("Aufgaben", NAMES, NOW);
}

function withTask(state: AppState, title: string): AppState {
  return addTask(state, { listId: inboxListId(state, "a")!, title, createdBy: "a" }, NOW);
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface ProbeProps {
  storage: Storage;
  state: AppState;
  replace: (state: AppState) => void;
  fetchImpl: typeof fetch;
  onStatus: (status: SyncStatus) => void;
}

function Probe({ storage, state, replace, fetchImpl, onStatus }: ProbeProps) {
  const sync = useSync({ state, replace, storage, now: () => NOW, fetchImpl });
  onStatus(sync.status);
  return <span data-testid="status">{sync.status}</span>;
}

describe("useSync", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SYNC_URL", "https://sync.example");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("stays disabled and issues no request when no endpoint is configured", async () => {
    vi.stubEnv("VITE_SYNC_URL", "");
    const fetchImpl = vi.fn();
    const view = render(
      <Probe
        storage={configured()}
        state={base()}
        replace={vi.fn()}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onStatus={vi.fn()}
      />,
    );
    expect(view.getByTestId("status").textContent).toBe("disabled");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stays disabled until the device has an access code", () => {
    const fetchImpl = vi.fn();
    const view = render(
      <Probe
        storage={fakeStorage()}
        state={base()}
        replace={vi.fn()}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onStatus={vi.fn()}
      />,
    );
    expect(view.getByTestId("status").textContent).toBe("disabled");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("adopts the server document on a device that has never synced", async () => {
    const server = withTask(base(), "Vom Server");
    const fetchImpl = vi.fn().mockResolvedValue(respond(200, { version: 3, state: server }));
    const replace = vi.fn();
    const storage = configured();

    const view = render(
      <Probe
        storage={storage}
        state={base()}
        replace={replace}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onStatus={vi.fn()}
      />,
    );

    await waitFor(() => expect(view.getByTestId("status").textContent).toBe("idle"));
    expect(replace).toHaveBeenCalledWith(server);
    expect(storage.getItem(ADOPTED_KEY)).toBe("1");
  });

  it("reports auth-error when the access code is refused", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(401, { error: "unauthorised" }));
    const view = render(
      <Probe
        storage={configured()}
        state={base()}
        replace={vi.fn()}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onStatus={vi.fn()}
      />,
    );
    await waitFor(() => expect(view.getByTestId("status").textContent).toBe("auth-error"));
  });

  it("reports offline on a network failure and keeps the local state", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const replace = vi.fn();
    const view = render(
      <Probe
        storage={configured()}
        state={withTask(base(), "Lokal")}
        replace={replace}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onStatus={vi.fn()}
      />,
    );
    await waitFor(() => expect(view.getByTestId("status").textContent).toBe("offline"));
    expect(replace).not.toHaveBeenCalled();
  });

  it("pushes the local document when the server holds nothing yet", async () => {
    const local = withTask(base(), "Erste");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond(200, { version: 0, state: null }))
      .mockResolvedValueOnce(respond(200, { version: 1 }));
    const view = render(
      <Probe
        storage={configured()}
        state={local}
        replace={vi.fn()}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onStatus={vi.fn()}
      />,
    );
    await waitFor(() => expect(view.getByTestId("status").textContent).toBe("idle"));
    const put = fetchImpl.mock.calls[1]![1];
    expect(put.method).toBe("PUT");
    expect(JSON.parse(put.body).baseVersion).toBe(0);
  });

  it("does not start a second cycle while one is still running", async () => {
    let release: ((value: Response) => void) | null = null;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValue(respond(200, { version: 1 }));
    const storage = configured({ [ADOPTED_KEY]: "1" });

    const view = render(
      <Probe
        storage={storage}
        state={base()}
        replace={vi.fn()}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onStatus={vi.fn()}
      />,
    );
    // A foreground event while the first request is in flight must not pile on.
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    release!(respond(200, { version: 0, state: null }));
    await waitFor(() => expect(view.getByTestId("status").textContent).toBe("idle"));
  });
});
