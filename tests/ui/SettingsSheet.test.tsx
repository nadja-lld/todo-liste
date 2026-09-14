// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addTask, createInitialState, toggleTask } from "../../src/domain/state";
import type { AppState } from "../../src/domain/types";
import { setLanguage } from "../../src/i18n";
import { SettingsSheet } from "../../src/ui/SettingsSheet";

const now = new Date(2026, 8, 14, 9, 0);

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
    const h = harness(createInitialState("Aufgaben"));
    fireEvent.input(screen.getByPlaceholderText("Neue Liste"), { target: { value: "Einkauf" } });
    fireEvent.click(screen.getByRole("button", { name: "Liste anlegen" }));
    expect(h.state.lists.map((l) => l.name)).toEqual(["Aufgaben", "Einkauf"]);
  });

  it("renames a list via prompt", () => {
    const h = harness(createInitialState("Aufgaben"), { prompt: () => "Privat" });
    fireEvent.click(screen.getByRole("button", { name: "Umbenennen: Aufgaben" }));
    expect(h.state.lists[0]?.name).toBe("Privat");
  });

  it("deletes a list with its tasks after confirmation", () => {
    let state = createInitialState("A");
    state = { ...state, lists: [...state.lists, { id: "b", name: "B", position: 1 }] };
    state = addTask(state, { listId: "b", title: "In B" }, now);
    const h = harness(state);
    fireEvent.click(screen.getByRole("button", { name: "Liste löschen: B" }));
    expect(h.state.lists.map((l) => l.name)).toEqual(["A"]);
    expect(h.state.tasks).toEqual([]);
  });

  it("clears completed tasks after confirmation", () => {
    let state = createInitialState("A");
    state = addTask(state, { listId: state.lists[0]!.id, title: "Done" }, now);
    state = toggleTask(state, state.tasks[0]!.id, now);
    const h = harness(state);
    fireEvent.click(screen.getByRole("button", { name: "Erledigte Aufgaben löschen" }));
    expect(h.state.tasks).toEqual([]);
  });

  it("exports the state as a dated JSON file", async () => {
    const exportFile = vi.fn().mockResolvedValue(undefined);
    harness(createInitialState("A"), { exportFile });
    fireEvent.click(screen.getByRole("button", { name: "Als JSON exportieren" }));
    await waitFor(() => expect(exportFile).toHaveBeenCalled());
    const [fileName, content] = exportFile.mock.calls[0]!;
    expect(fileName).toBe("todos-2026-09-14.json");
    expect(JSON.parse(content).lists[0].name).toBe("A");
  });

  it("imports a valid file after confirmation", async () => {
    const imported = createInitialState("Importiert");
    const h = harness(createInitialState("A"));
    const file = new File([JSON.stringify(imported)], "todos.json", { type: "application/json" });
    const input = screen.getByLabelText("JSON importieren") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() => expect(h.state.lists[0]?.name).toBe("Importiert"));
  });

  it("rejects an invalid file and keeps the state", async () => {
    const notify = vi.fn();
    const h = harness(createInitialState("A"), { notify });
    const file = new File(["{broken"], "todos.json", { type: "application/json" });
    const input = screen.getByLabelText("JSON importieren") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("invalid JSON")),
    );
    expect(h.state.lists[0]?.name).toBe("A");
  });
});
