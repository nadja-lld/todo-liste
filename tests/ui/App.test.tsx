// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../src/i18n";
import { App } from "../../src/ui/App";
import { STATE_KEY } from "../../src/storage/localStorage";

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

const now = () => new Date(2026, 8, 14, 9, 0);

describe("App", () => {
  beforeEach(() => setLanguage("de"));
  afterEach(cleanup);

  it("adds a task through the bottom bar and persists it", () => {
    const storage = fakeStorage();
    render(<App storage={storage} now={now} />);
    const input = screen.getByPlaceholderText("Neue Aufgabe");
    fireEvent.input(input, { target: { value: "Milch kaufen" } });
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByText("Milch kaufen")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");
    const saved = JSON.parse(storage.getItem(STATE_KEY)!);
    expect(saved.tasks[0].title).toBe("Milch kaufen");
  });

  it("completes a task and shows it in the completed section", () => {
    render(<App storage={fakeStorage()} now={now} />);
    const input = screen.getByPlaceholderText("Neue Aufgabe");
    fireEvent.input(input, { target: { value: "Aufräumen" } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: /^Als erledigt markieren/ }));
    expect(screen.getByText("Erledigt (1)")).toBeTruthy();
    expect(screen.getByText("Keine offenen Aufgaben")).toBeTruthy();
  });

  it("shows the recovery notice when stored data was corrupt", () => {
    render(<App storage={fakeStorage({ [STATE_KEY]: "{broken" })} now={now} />);
    expect(screen.getByText(/beschädigt/)).toBeTruthy();
  });

  it("shows the today view with tasks due today across lists", () => {
    const storage = fakeStorage({
      [STATE_KEY]: JSON.stringify({
        schemaVersion: 1,
        lists: [
          { id: "a", name: "A", position: 0 },
          { id: "b", name: "B", position: 1 },
        ],
        tasks: [
          {
            id: "t1",
            listId: "a",
            title: "In A heute",
            priority: "medium",
            recurrence: "none",
            dueDate: "2026-09-14",
            createdAt: "2026-09-01T00:00:00Z",
          },
          {
            id: "t2",
            listId: "b",
            title: "In B überfällig",
            priority: "medium",
            recurrence: "none",
            dueDate: "2026-09-01",
            createdAt: "2026-09-01T00:00:00Z",
          },
          {
            id: "t3",
            listId: "b",
            title: "In B später",
            priority: "medium",
            recurrence: "none",
            dueDate: "2026-12-01",
            createdAt: "2026-09-01T00:00:00Z",
          },
        ],
      }),
    });
    render(<App storage={storage} now={now} />);
    fireEvent.click(screen.getByRole("tab", { name: "Heute" }));
    expect(screen.getByText("In A heute")).toBeTruthy();
    expect(screen.getByText("In B überfällig")).toBeTruthy();
    expect(screen.queryByText("In B später")).toBeNull();
  });

  it("keeps the completed section stable when it remounts while expanded", async () => {
    const storage = fakeStorage({
      [STATE_KEY]: JSON.stringify({
        schemaVersion: 1,
        lists: [
          { id: "a", name: "A", position: 0 },
          { id: "b", name: "B", position: 1 },
        ],
        tasks: [
          {
            id: "t1",
            listId: "a",
            title: "Erledigt in A",
            priority: "medium",
            recurrence: "none",
            createdAt: "2026-09-01T00:00:00Z",
            completedAt: "2026-09-01T00:00:00Z",
          },
        ],
      }),
    });

    let toggleCount = 0;
    const countToggle = () => {
      toggleCount += 1;
    };
    document.addEventListener("toggle", countToggle, true);

    try {
      render(<App storage={storage} now={now} />);

      // List A is the default view; expand its completed section like a user would.
      fireEvent.click(screen.getByText("Erledigt (1)"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      let details = document.querySelector("details.completed") as HTMLDetailsElement | null;
      expect(details?.open).toBe(true);

      // Switch to list B, which has no completed tasks: the <details> unmounts.
      fireEvent.click(screen.getByRole("tab", { name: "B" }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(document.querySelector("details.completed")).toBeNull();

      // Switch back to A: the <details> remounts with open=true, which used to
      // trigger an infinite toggle -> setState -> toggle loop.
      fireEvent.click(screen.getByRole("tab", { name: "A" }));
      await new Promise((resolve) => setTimeout(resolve, 150));

      details = document.querySelector("details.completed") as HTMLDetailsElement | null;
      expect(details).not.toBeNull();
      expect(details?.open).toBe(true);
      // One toggle for the manual expand, one for the remount-while-open. A
      // runaway loop fires this hundreds of times within the wait above.
      expect(toggleCount).toBeLessThanOrEqual(3);
    } finally {
      document.removeEventListener("toggle", countToggle, true);
    }
  });
});
