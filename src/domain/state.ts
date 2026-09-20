import { todayIso } from "./dates";
import { newId } from "./ids";
import { nextDueDate } from "./recurrence";
import { listsOf, liveLists, ownerOfTask } from "./selectors";
import {
  SCHEMA_VERSION,
  type AppState,
  type Task,
  type TodoList,
  type UserId,
  type UserNames,
} from "./types";

export interface NewTaskInput {
  listId: string;
  title: string;
  createdBy: UserId;
}

export type TaskPatch = Partial<
  Pick<Task, "title" | "note" | "listId" | "priority" | "dueDate" | "recurrence">
>;

function stamp(now: Date): string {
  return now.toISOString();
}

export function createInitialState(defaultListName: string, names: UserNames, now: Date): AppState {
  const at = stamp(now);
  return {
    schemaVersion: SCHEMA_VERSION,
    users: [
      { id: "a", name: names.a, updatedAt: at },
      { id: "b", name: names.b, updatedAt: at },
    ],
    lists: [
      { id: newId(), name: defaultListName, position: 0, owner: "a", updatedAt: at },
      { id: newId(), name: defaultListName, position: 1, owner: "b", updatedAt: at },
    ],
    tasks: [],
  };
}

/** Live lists across both people, in display order. Ownership filtering lives in selectors. */
export function sortedLists(state: AppState): TodoList[] {
  return liveLists(state);
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
  const at = stamp(now);
  const owner = state.lists.find((list) => list.id === input.listId)?.owner;
  const task: Task = withoutUndefined({
    id: newId(),
    listId: input.listId,
    title,
    priority: "medium",
    recurrence: "none",
    createdAt: at,
    createdBy: input.createdBy,
    // A task you put on your own list is not news to you.
    seenAt: owner === input.createdBy ? at : undefined,
    updatedAt: at,
  });
  return { ...state, tasks: [...state.tasks, task] };
}

export function updateTask(state: AppState, taskId: string, patch: TaskPatch, now: Date): AppState {
  const existing = state.tasks.find((task) => task.id === taskId);
  if (!existing) return state;
  const merged: Task = { ...existing };
  if (patch.title !== undefined && patch.title.trim() !== "") merged.title = patch.title.trim();
  if (patch.listId !== undefined) merged.listId = patch.listId;
  if (patch.priority !== undefined) merged.priority = patch.priority;
  if (patch.recurrence !== undefined) merged.recurrence = patch.recurrence;
  if ("note" in patch) {
    const note = patch.note?.trim();
    if (note === undefined || note === "") delete merged.note;
    else merged.note = note;
  }
  if ("dueDate" in patch) {
    if (patch.dueDate === undefined) delete merged.dueDate;
    else merged.dueDate = patch.dueDate;
  }
  merged.updatedAt = stamp(now);
  return replaceTask(state, merged);
}

/** Records that the owner has looked at a delegated task. Only ever set once. */
export function markTaskSeen(state: AppState, taskId: string, now: Date): AppState {
  const existing = state.tasks.find((task) => task.id === taskId);
  if (!existing || existing.seenAt !== undefined) return state;
  return replaceTask(state, { ...existing, seenAt: stamp(now), updatedAt: stamp(now) });
}

export function toggleTask(state: AppState, taskId: string, now: Date): AppState {
  const existing = state.tasks.find((task) => task.id === taskId);
  if (!existing) return state;
  const at = stamp(now);

  if (existing.completedAt !== undefined) {
    const { completedAt: _completedAt, ...reopened } = existing;
    return replaceTask(state, { ...reopened, updatedAt: at });
  }

  const completed: Task = { ...existing, completedAt: at, updatedAt: at };
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
    createdAt: at,
    createdBy: existing.createdBy,
    // The follow-up is generated, not delegated, so it never reads as new.
    seenAt: at,
    updatedAt: at,
  });
  return { ...nextState, tasks: [...nextState.tasks, followUp] };
}

export function deleteTask(state: AppState, taskId: string, now: Date): AppState {
  const existing = state.tasks.find((task) => task.id === taskId);
  if (!existing || existing.deletedAt !== undefined) return state;
  const at = stamp(now);
  return replaceTask(state, { ...existing, deletedAt: at, updatedAt: at });
}

/** Tombstones the completed tasks belonging to one person. */
export function clearCompleted(state: AppState, owner: UserId, now: Date): AppState {
  const at = stamp(now);
  let changed = false;
  const tasks = state.tasks.map((task) => {
    if (task.completedAt === undefined || task.deletedAt !== undefined) return task;
    if (ownerOfTask(state, task) !== owner) return task;
    changed = true;
    return { ...task, deletedAt: at, updatedAt: at };
  });
  return changed ? { ...state, tasks } : state;
}

export function addList(state: AppState, name: string, owner: UserId, now: Date): AppState {
  const trimmed = name.trim();
  if (trimmed === "") return state;
  const at = stamp(now);
  const position = state.lists.reduce((max, list) => Math.max(max, list.position), -1) + 1;
  return {
    ...state,
    lists: [...state.lists, { id: newId(), name: trimmed, position, owner, updatedAt: at }],
  };
}

export function renameList(state: AppState, listId: string, name: string, now: Date): AppState {
  const trimmed = name.trim();
  if (trimmed === "") return state;
  if (!state.lists.some((list) => list.id === listId)) return state;
  const at = stamp(now);
  return {
    ...state,
    lists: state.lists.map((list) =>
      list.id === listId ? { ...list, name: trimmed, updatedAt: at } : list,
    ),
  };
}

export function moveList(
  state: AppState,
  listId: string,
  direction: "up" | "down",
  now: Date,
): AppState {
  const target = state.lists.find((list) => list.id === listId);
  if (!target || target.deletedAt !== undefined) return state;
  // Reordering happens within one person's lists; the other person's order is untouched.
  const ordered = listsOf(state, target.owner);
  const index = ordered.findIndex((list) => list.id === listId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= ordered.length) return state;
  const at = stamp(now);
  const a = ordered[index]!;
  const b = ordered[targetIndex]!;
  return {
    ...state,
    lists: state.lists.map((list) => {
      if (list.id === a.id) return { ...list, position: b.position, updatedAt: at };
      if (list.id === b.id) return { ...list, position: a.position, updatedAt: at };
      return list;
    }),
  };
}

/** Tombstones a list and everything on it. The owner's last live list is kept. */
export function deleteList(state: AppState, listId: string, now: Date): AppState {
  const target = state.lists.find((list) => list.id === listId);
  if (!target || target.deletedAt !== undefined) return state;
  if (listsOf(state, target.owner).length <= 1) return state;
  const at = stamp(now);
  return {
    ...state,
    lists: state.lists.map((list) =>
      list.id === listId ? { ...list, deletedAt: at, updatedAt: at } : list,
    ),
    tasks: state.tasks.map((task) =>
      task.listId === listId && task.deletedAt === undefined
        ? { ...task, deletedAt: at, updatedAt: at }
        : task,
    ),
  };
}

export function renameUser(state: AppState, userId: UserId, name: string, now: Date): AppState {
  const trimmed = name.trim();
  if (trimmed === "") return state;
  const at = stamp(now);
  return {
    ...state,
    users: state.users.map((user) =>
      user.id === userId ? { ...user, name: trimmed, updatedAt: at } : user,
    ),
  };
}
