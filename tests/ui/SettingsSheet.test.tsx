// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inboxListId, listsOf, liveTasks } from "../../src/domain/selectors";
import { addList, addTask, createInitialState, toggleTask } from "../../src/domain/state";
import type { AppState } from "../../src/domain/types";
import { setLanguage } from "../../src/i18n";
import { SettingsSheet } from "../../src/ui/SettingsSheet";

const now = new Date(2026, 8, 14, 9, 0);
const NAMES = { a: "Person 1", b: "Person 2" };

function fakeStorage(): Storage {
  const data = new Map<string, string>();
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

function initial(listName: string) {
  return createInitialState(listName, NAMES, now);
}

/** The lists the person holding the device can see. */
function ownListNames(state: AppState) {
  return listsOf(state, "a").map((l) => l.name);
}

function harness(initial: AppState, overrides: Partial<Parameters<typeof SettingsSheet>[0]> = {}) {
  let current = initial;
  const onUpdate = (fn: (s: AppState) => AppState) => {
    current = fn(current);
    rerender();
  };
  const onReplace = (s: AppState) => {
    current = s;
    rerender();
  };
  const props = () => ({
    state: current,
    identity: "a" as const,
    storage: fakeStorage(),
    syncStatus: "idle" as const,
    now: () => now,
    today: "2026-09-14",
    onUpdate,
    onReplace,
    onClose: vi.fn(),
    confirm: () => true,
    prompt: () => null,
    notify: vi.fn(),
    exportFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });
  const view = render(<SettingsSheet {...props()} />);
  const rerender = () => view.rerender(<SettingsSheet {...props()} />);
  return {
    get state() {
      return current;
    },
    props,
  };
}

describe("SettingsSheet", () => {
  beforeEach(() => setLanguage("de"));
  afterEach(cleanup);

  it("adds a list", () => {
    const h = harness(initial("Aufgaben"));
    fireEvent.input(screen.getByPlaceholderText("Neue Liste"), { target: { value: "Einkauf" } });
    fireEvent.click(screen.getByRole("button", { name: "Liste anlegen" }));
    expect(ownListNames(h.state)).toEqual(["Aufgaben", "Einkauf"]);
  });

  it("renames a list via prompt", () => {
    const h = harness(initial("Aufgaben"), { prompt: () => "Privat" });
    fireEvent.click(screen.getByRole("button", { name: "Umbenennen: Aufgaben" }));
    expect(ownListNames(h.state)).toEqual(["Privat"]);
  });

  it("deletes a list with its tasks after confirmation", () => {
    let state = addList(initial("A"), "B", "a", now);
    const listB = listsOf(state, "a")[1]!.id;
    state = addTask(state, { listId: listB, title: "In B", createdBy: "a" }, now);
    const h = harness(state);
    fireEvent.click(screen.getByRole("button", { name: "Liste löschen: B" }));
    expect(ownListNames(h.state)).toEqual(["A"]);
    expect(liveTasks(h.state)).toEqual([]);
  });

  it("clears completed tasks after confirmation", () => {
    let state = initial("A");
    state = addTask(
      state,
      { listId: inboxListId(state, "a")!, title: "Done", createdBy: "a" },
      now,
    );
    state = toggleTask(state, state.tasks[0]!.id, now);
    const h = harness(state);
    fireEvent.click(screen.getByRole("button", { name: "Erledigte Aufgaben löschen" }));
    expect(liveTasks(h.state)).toEqual([]);
  });

  it("exports the state as a dated JSON file", async () => {
    const exportFile = vi.fn().mockResolvedValue(undefined);
    harness(initial("A"), { exportFile });
    fireEvent.click(screen.getByRole("button", { name: "Als JSON exportieren" }));
    await waitFor(() => expect(exportFile).toHaveBeenCalled());
    const [fileName, content] = exportFile.mock.calls[0]!;
    expect(fileName).toBe("todos-2026-09-14.json");
    expect(JSON.parse(content).lists[0].name).toBe("A");
  });

  it("imports a valid file after confirmation", async () => {
    const imported = initial("Importiert");
    const h = harness(initial("A"));
    const file = new File([JSON.stringify(imported)], "todos.json", { type: "application/json" });
    const input = screen.getByLabelText("JSON importieren") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() => expect(ownListNames(h.state)).toEqual(["Importiert"]));
  });

  it("rejects an invalid file and keeps the state", async () => {
    const notify = vi.fn();
    const h = harness(initial("A"), { notify });
    const file = new File(["{broken"], "todos.json", { type: "application/json" });
    const input = screen.getByLabelText("JSON importieren") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("invalid JSON")),
    );
    expect(ownListNames(h.state)).toEqual(["A"]);
  });

  it("notifies and keeps the state when the file cannot be read", async () => {
    const notify = vi.fn();
    const h = harness(initial("A"), { notify });
    const unreadableFile = { text: () => Promise.reject(new Error("unreadable")) };
    const input = screen.getByLabelText("JSON importieren") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [unreadableFile] });
    fireEvent.change(input);
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining("unreadable")));
    expect(ownListNames(h.state)).toEqual(["A"]);
  });

  it("renames a person", () => {
    const h = harness(initial("A"));
    const input = screen.getByLabelText("Name von Person 2") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Chris" } });
    expect(h.state.users.find((u) => u.id === "b")!.name).toBe("Chris");
  });

  it("shows the sync status", () => {
    harness(initial("A"), { syncStatus: "offline" as const });
    expect(screen.getByText("Offline — wird nachgeholt")).toBeTruthy();
  });

  it("clears the device settings after confirmation", () => {
    const storage = fakeStorage();
    storage.setItem("todo.identity", "a");
    storage.setItem("todo.accessCode", "s3cret");
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });
    harness(initial("A"), { storage, confirm: () => true });
    fireEvent.click(screen.getByRole("button", { name: "Gerät zurücksetzen" }));
    expect(storage.getItem("todo.accessCode")).toBeNull();
    expect(storage.getItem("todo.identity")).toBeNull();
    expect(reload).toHaveBeenCalled();
  });

  it("keeps the device settings when the reset is declined", () => {
    const storage = fakeStorage();
    storage.setItem("todo.accessCode", "s3cret");
    harness(initial("A"), { storage, confirm: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Gerät zurücksetzen" }));
    expect(storage.getItem("todo.accessCode")).toBe("s3cret");
  });

  it("deletes an empty list without asking for confirmation", () => {
    const state = addList(initial("A"), "B", "a", now);
    const confirm = vi.fn(() => true);
    const h = harness(state, { confirm });
    fireEvent.click(screen.getByRole("button", { name: "Liste löschen: B" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(ownListNames(h.state)).toEqual(["A"]);
  });
});
