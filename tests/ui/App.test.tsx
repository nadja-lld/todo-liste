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

  it("creates the follow-up when a recurring task is completed", () => {
    const storage = fakeStorage({
      [STATE_KEY]: JSON.stringify({
        schemaVersion: 1,
        lists: [{ id: "a", name: "A", position: 0 }],
        tasks: [
          {
            id: "t1",
            listId: "a",
            title: "Müll rausbringen",
            priority: "medium",
            recurrence: "weekly",
            dueDate: "2026-09-10",
            createdAt: "2026-09-01T00:00:00Z",
          },
        ],
      }),
    });
    render(<App storage={storage} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: /^Als erledigt markieren/ }));
    expect(screen.getAllByText("Müll rausbringen")).toHaveLength(2);
    expect(screen.getByText("Erledigt (1)")).toBeTruthy();
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
            completedAt: new Date(2026, 8, 14, 8, 0).toISOString(),
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
  it("shows only tasks completed today in the completed section", () => {
    const storage = fakeStorage({
      [STATE_KEY]: JSON.stringify({
        schemaVersion: 1,
        lists: [{ id: "a", name: "A", position: 0 }],
        tasks: [
          {
            id: "t1",
            listId: "a",
            title: "Heute erledigt",
            priority: "medium",
            recurrence: "none",
            createdAt: "2026-09-01T00:00:00Z",
            completedAt: new Date(2026, 8, 14, 8, 0).toISOString(),
          },
          {
            id: "t2",
            listId: "a",
            title: "Gestern erledigt",
            priority: "medium",
            recurrence: "none",
            createdAt: "2026-09-01T00:00:00Z",
            completedAt: new Date(2026, 8, 13, 20, 0).toISOString(),
          },
        ],
      }),
    });
    render(<App storage={storage} now={now} />);
    expect(screen.getByText("Erledigt (1)")).toBeTruthy();
    expect(screen.getByText("Heute erledigt")).toBeTruthy();
    expect(screen.queryByText("Gestern erledigt")).toBeNull();
  });

  it("shows the tomorrow view with tasks due tomorrow across lists", () => {
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
            title: "In A morgen",
            priority: "medium",
            recurrence: "none",
            dueDate: "2026-09-15",
            createdAt: "2026-09-01T00:00:00Z",
          },
          {
            id: "t2",
            listId: "b",
            title: "In B heute",
            priority: "medium",
            recurrence: "none",
            dueDate: "2026-09-14",
            createdAt: "2026-09-01T00:00:00Z",
          },
          {
            id: "t3",
            listId: "b",
            title: "In B überfällig",
            priority: "medium",
            recurrence: "none",
            dueDate: "2026-09-01",
            createdAt: "2026-09-01T00:00:00Z",
          },
        ],
      }),
    });
    render(<App storage={storage} now={now} />);
    fireEvent.click(screen.getByRole("tab", { name: "Morgen" }));
    expect(screen.getByText("In A morgen")).toBeTruthy();
    expect(screen.queryByText("In B heute")).toBeNull();
    expect(screen.queryByText("In B überfällig")).toBeNull();
  });

  it("says nothing is due when the tomorrow view is empty", () => {
    render(<App storage={fakeStorage()} now={now} />);
    fireEvent.click(screen.getByRole("tab", { name: "Morgen" }));
    expect(screen.getByText("Morgen ist nichts fällig")).toBeTruthy();
  });
});

describe("App with two people", () => {
  beforeEach(() => setLanguage("de"));
  afterEach(cleanup);

  /** A stored document where each person owns one named list. */
  function twoPersonState() {
    const at = "2026-09-14T07:00:00.000Z";
    return {
      schemaVersion: 2,
      users: [
        { id: "a", name: "Nadja", updatedAt: at },
        { id: "b", name: "Chris", updatedAt: at },
      ],
      lists: [
        { id: "la", name: "Nadjas Liste", position: 0, owner: "a", updatedAt: at },
        { id: "lb", name: "Chris' Liste", position: 1, owner: "b", updatedAt: at },
      ],
      tasks: [
        {
          id: "t-a",
          listId: "la",
          title: "Meine Aufgabe",
          priority: "medium",
          recurrence: "none",
          createdAt: at,
          createdBy: "a",
          seenAt: at,
          updatedAt: at,
        },
        {
          id: "t-b",
          listId: "lb",
          title: "Fremde Aufgabe",
          priority: "medium",
          recurrence: "none",
          createdAt: at,
          createdBy: "b",
          seenAt: at,
          updatedAt: at,
        },
      ],
    };
  }

  function storedAs(identity: "a" | "b") {
    return fakeStorage({
      [STATE_KEY]: JSON.stringify(twoPersonState()),
      "todo.identity": identity,
      "todo.accessCode": "s3cret",
    });
  }

  it("shows only my own lists in the switcher", () => {
    render(<App storage={storedAs("a")} now={now} />);
    expect(screen.getByRole("tab", { name: "Nadjas Liste" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Chris' Liste" })).toBeNull();
  });

  it("shows only my own tasks", () => {
    render(<App storage={storedAs("a")} now={now} />);
    expect(screen.getByText("Meine Aufgabe")).toBeTruthy();
    expect(screen.queryByText("Fremde Aufgabe")).toBeNull();
  });

  it("shows the other person's view when this device belongs to them", () => {
    render(<App storage={storedAs("b")} now={now} />);
    expect(screen.getByText("Fremde Aufgabe")).toBeTruthy();
    expect(screen.queryByText("Meine Aufgabe")).toBeNull();
  });

  it("has no target switcher in the add bar any more", () => {
    render(<App storage={storedAs("a")} now={now} />);
    expect(screen.queryByRole("radio", { name: /^Für/ })).toBeNull();
  });

  it("puts a new task on my own list by default", () => {
    const storage = storedAs("a");
    render(<App storage={storage} now={now} />);
    const input = screen.getByPlaceholderText("Neue Aufgabe");
    fireEvent.input(input, { target: { value: "Selbst" } });
    fireEvent.submit(input.closest("form")!);

    expect(screen.getByText("Selbst")).toBeTruthy();
    const saved = JSON.parse(storage.getItem(STATE_KEY)!);
    const created = saved.tasks.find((t: { title: string }) => t.title === "Selbst");
    expect(created.listId).toBe("la");
  });

  it("dates a task created in the Heute view so it stays visible there", () => {
    const storage = storedAs("a");
    render(<App storage={storage} now={now} />);
    fireEvent.click(screen.getByRole("tab", { name: "Heute" }));
    const input = screen.getByPlaceholderText("Neue Aufgabe");
    fireEvent.input(input, { target: { value: "Heute faellig" } });
    fireEvent.submit(input.closest("form")!);

    expect(screen.getByText("Heute faellig")).toBeTruthy();
    const saved = JSON.parse(storage.getItem(STATE_KEY)!);
    const created = saved.tasks.find((t: { title: string }) => t.title === "Heute faellig");
    expect(created.dueDate).toBe("2026-09-14");
    expect(created.listId).toBe("la");
  });

  it("dates a task created in the Morgen view for tomorrow", () => {
    const storage = storedAs("a");
    render(<App storage={storage} now={now} />);
    fireEvent.click(screen.getByRole("tab", { name: "Morgen" }));
    const input = screen.getByPlaceholderText("Neue Aufgabe");
    fireEvent.input(input, { target: { value: "Morgen faellig" } });
    fireEvent.submit(input.closest("form")!);

    expect(screen.getByText("Morgen faellig")).toBeTruthy();
    const saved = JSON.parse(storage.getItem(STATE_KEY)!);
    const created = saved.tasks.find((t: { title: string }) => t.title === "Morgen faellig");
    expect(created.dueDate).toBe("2026-09-15");
  });

  it("hands a task over through the detail sheet and closes it", () => {
    const storage = storedAs("a");
    render(<App storage={storage} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: /^Meine Aufgabe/ }));
    fireEvent.change(screen.getByLabelText("Zu erledigen von"), { target: { value: "b" } });

    // Gone from my view, and the sheet cannot stay open on a task I no longer own.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Meine Aufgabe")).toBeNull();
    const saved = JSON.parse(storage.getItem(STATE_KEY)!);
    expect(saved.tasks.find((t: { id: string }) => t.id === "t-a").listId).toBe("lb");
  });

  it("marks a task the other person delegated to me and clears it once opened", () => {
    const state = twoPersonState();
    state.tasks.push({
      id: "t-new",
      listId: "la",
      title: "Von Chris",
      priority: "medium",
      recurrence: "none",
      createdAt: "2026-09-14T07:30:00.000Z",
      createdBy: "b",
      updatedAt: "2026-09-14T07:30:00.000Z",
    } as (typeof state.tasks)[number]);
    const storage = fakeStorage({
      [STATE_KEY]: JSON.stringify(state),
      "todo.identity": "a",
      "todo.accessCode": "s3cret",
    });
    render(<App storage={storage} now={now} />);

    expect(screen.getByText("Neu von Gerald")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Von Chris/ }));
    expect(screen.queryByText("Neu von Gerald")).toBeNull();
  });

  it("never marks a task I created for myself", () => {
    render(<App storage={storedAs("a")} now={now} />);
    const input = screen.getByPlaceholderText("Neue Aufgabe");
    fireEvent.input(input, { target: { value: "Selbst angelegt" } });
    fireEvent.submit(input.closest("form")!);
    expect(screen.queryByText(/^Neu von/)).toBeNull();
  });

  it("offers a Vergeben tab that shows what I handed over, with its status", () => {
    const state = twoPersonState();
    state.tasks.push({
      id: "t-weg",
      listId: "lb",
      title: "Müll rausbringen",
      priority: "medium",
      recurrence: "none",
      createdAt: "2026-09-14T07:30:00.000Z",
      createdBy: "a",
      updatedAt: "2026-09-14T07:30:00.000Z",
    } as (typeof state.tasks)[number]);
    render(
      <App
        storage={fakeStorage({
          [STATE_KEY]: JSON.stringify(state),
          "todo.identity": "a",
          "todo.accessCode": "s3cret",
        })}
        now={now}
      />,
    );

    // Not in my own views ...
    expect(screen.queryByText("Müll rausbringen")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Vergeben" }));
    // ... but visible here, with who has it and whether it is done.
    expect(screen.getByText("Müll rausbringen")).toBeTruthy();
    expect(screen.getByText("Offen")).toBeTruthy();
    expect(screen.getByText("Gerald")).toBeTruthy();
  });

  it("does not show the other person's own tasks in the Vergeben tab", () => {
    render(<App storage={storedAs("a")} now={now} />);
    fireEvent.click(screen.getByRole("tab", { name: "Vergeben" }));
    expect(screen.queryByText("Fremde Aufgabe")).toBeNull();
    expect(screen.getByText("Du hast nichts abgegeben")).toBeTruthy();
  });

  it("cannot add tasks from the Vergeben tab", () => {
    render(<App storage={storedAs("a")} now={now} />);
    fireEvent.click(screen.getByRole("tab", { name: "Vergeben" }));
    expect((screen.getByPlaceholderText("Neue Aufgabe") as HTMLInputElement).disabled).toBe(true);
  });

  it("names the creator in the task detail", () => {
    render(<App storage={storedAs("a")} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: /^Meine Aufgabe/ }));
    // "Nadja" is also an option in the assignee select, so scope to the line.
    const line = screen.getByText("Angelegt von").closest("p");
    expect(line?.textContent).toContain("Nadja");
  });
});
