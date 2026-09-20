// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TodoList } from "../../src/domain/types";
import { setLanguage } from "../../src/i18n";
import { TaskDetailSheet } from "../../src/ui/TaskDetailSheet";

const AT = "2026-09-01T00:00:00.000Z";
const lists: TodoList[] = [
  { id: "a", name: "A", position: 0, owner: "a", updatedAt: AT },
  { id: "b", name: "B", position: 1, owner: "a", updatedAt: AT },
];
const task: Task = {
  id: "t1",
  listId: "a",
  title: "Miete",
  priority: "medium",
  recurrence: "none",
  createdAt: AT,
  createdBy: "a",
  updatedAt: AT,
};

describe("TaskDetailSheet", () => {
  beforeEach(() => setLanguage("de"));
  afterEach(cleanup);

  it("patches the title on blur", () => {
    const onPatch = vi.fn();
    render(
      <TaskDetailSheet
        task={task}
        lists={lists}
        onPatch={onPatch}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Titel") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "Miete überweisen" } });
    fireEvent.blur(input);
    expect(onPatch).toHaveBeenCalledWith("t1", { title: "Miete überweisen" });
  });

  it("patches priority, recurrence, list and due date immediately", () => {
    const onPatch = vi.fn();
    render(
      <TaskDetailSheet
        task={task}
        lists={lists}
        onPatch={onPatch}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Priorität"), { target: { value: "high" } });
    expect(onPatch).toHaveBeenCalledWith("t1", { priority: "high" });
    fireEvent.change(screen.getByLabelText("Wiederholung"), { target: { value: "weekly" } });
    expect(onPatch).toHaveBeenCalledWith("t1", { recurrence: "weekly" });
    fireEvent.change(screen.getByLabelText("Liste"), { target: { value: "b" } });
    expect(onPatch).toHaveBeenCalledWith("t1", { listId: "b" });
    fireEvent.change(screen.getByLabelText("Fällig am"), { target: { value: "2026-10-01" } });
    expect(onPatch).toHaveBeenCalledWith("t1", { dueDate: "2026-10-01" });
  });

  it("clears the due date", () => {
    const onPatch = vi.fn();
    render(
      <TaskDetailSheet
        task={{ ...task, dueDate: "2026-10-01" }}
        lists={lists}
        onPatch={onPatch}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Datum entfernen" }));
    expect(onPatch).toHaveBeenCalledWith("t1", { dueDate: undefined });
  });

  it("deletes after confirmation and closes", () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(
      <TaskDetailSheet
        task={task}
        lists={lists}
        onPatch={vi.fn()}
        onDelete={onDelete}
        onClose={onClose}
        confirm={() => true}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aufgabe löschen" }));
    expect(onDelete).toHaveBeenCalledWith("t1");
    expect(onClose).toHaveBeenCalled();
  });

  it("does not delete when confirmation is declined", () => {
    const onDelete = vi.fn();
    render(
      <TaskDetailSheet
        task={task}
        lists={lists}
        onPatch={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
        confirm={() => false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aufgabe löschen" }));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
