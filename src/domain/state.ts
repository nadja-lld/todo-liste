import { todayIso } from "./dates";
import { newId } from "./ids";
import { nextDueDate } from "./recurrence";
import { SCHEMA_VERSION, type AppState, type Task, type TodoList } from "./types";

export interface NewTaskInput {
  listId: string;
  title: string;
}

export type TaskPatch = Partial<
  Pick<Task, "title" | "note" | "listId" | "priority" | "dueDate" | "recurrence">
>;

export function createInitialState(defaultListName: string): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    lists: [{ id: newId(), name: defaultListName, position: 0 }],
    tasks: [],
  };
}

export function sortedLists(state: AppState): TodoList[] {
  return [...state.lists].sort((a, b) => a.position - b.position);
}

function replaceTask(state: AppState, updated: Task): AppState {
  return { ...state, tasks: state.tasks.map((task) => (task.id === updated.id ? updated : task)) };
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function addTask(state: AppState, input: NewTaskInput, now: Date): AppState {
  const title = input.title.trim();
  if (title === "") return state;
  const task: Task = {
    id: newId(),
    listId: input.listId,
    title,
    priority: "medium",
    recurrence: "none",
    createdAt: now.toISOString(),
  };
  return { ...state, tasks: [...state.tasks, task] };
}

export function updateTask(state: AppState, taskId: string, patch: TaskPatch): AppState {
  const existing = state.tasks.find((task) => task.id === taskId);
  if (!existing) return state;
  const merged: Task = withoutUndefined({ ...existing, ...patch });
  if (patch.title !== undefined && patch.title.trim() === "") merged.title = existing.title;
  return replaceTask(state, merged);
}

export function toggleTask(state: AppState, taskId: string, now: Date): AppState {
  const existing = state.tasks.find((task) => task.id === taskId);
  if (!existing) return state;

  if (existing.completedAt !== undefined) {
    const { completedAt: _completedAt, ...reopened } = existing;
    return replaceTask(state, reopened);
  }

  const completed: Task = { ...existing, completedAt: now.toISOString() };
  const nextState = replaceTask(state, completed);
  if (existing.recurrence === "none") return nextState;

  const baseDate = existing.dueDate ?? todayIso(now);
  const followUp: Task = withoutUndefined({
    id: newId(),
    listId: existing.listId,
    title: existing.title,
    note: existing.note,
    priority: existing.priority,
    recurrence: existing.recurrence,
    dueDate: nextDueDate(baseDate, existing.recurrence),
    createdAt: now.toISOString(),
  });
  return { ...nextState, tasks: [...nextState.tasks, followUp] };
}

export function deleteTask(state: AppState, taskId: string): AppState {
  return { ...state, tasks: state.tasks.filter((task) => task.id !== taskId) };
}

export function clearCompleted(state: AppState): AppState {
  return { ...state, tasks: state.tasks.filter((task) => task.completedAt === undefined) };
}

export function addList(state: AppState, name: string): AppState {
  const trimmed = name.trim();
  if (trimmed === "") return state;
  const position = state.lists.reduce((max, list) => Math.max(max, list.position), -1) + 1;
  return { ...state, lists: [...state.lists, { id: newId(), name: trimmed, position }] };
}

export function renameList(state: AppState, listId: string, name: string): AppState {
  const trimmed = name.trim();
  if (trimmed === "") return state;
  return {
    ...state,
    lists: state.lists.map((list) => (list.id === listId ? { ...list, name: trimmed } : list)),
  };
}

export function moveList(state: AppState, listId: string, direction: "up" | "down"): AppState {
  const ordered = sortedLists(state);
  const index = ordered.findIndex((list) => list.id === listId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= ordered.length) return state;
  const reordered = [...ordered];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex]!, reordered[index]!];
  return { ...state, lists: reordered.map((list, position) => ({ ...list, position })) };
}

export function deleteList(state: AppState, listId: string): AppState {
  if (state.lists.length <= 1) return state;
  if (!state.lists.some((list) => list.id === listId)) return state;
  const remaining = sortedLists(state)
    .filter((list) => list.id !== listId)
    .map((list, position) => ({ ...list, position }));
  return {
    ...state,
    lists: remaining,
    tasks: state.tasks.filter((task) => task.listId !== listId),
  };
}
