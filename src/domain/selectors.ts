import type { AppState, Task, TodoList, UserId } from "./types";

/** Lists that are not tombstoned, in display order. */
export function liveLists(state: AppState): TodoList[] {
  return state.lists
    .filter((list) => list.deletedAt === undefined)
    .sort((a, b) => a.position - b.position);
}

/** Tasks that are not tombstoned and whose list still exists. */
export function liveTasks(state: AppState): Task[] {
  const listIds = new Set(liveLists(state).map((list) => list.id));
  return state.tasks.filter((task) => task.deletedAt === undefined && listIds.has(task.listId));
}

export function listsOf(state: AppState, owner: UserId): TodoList[] {
  return liveLists(state).filter((list) => list.owner === owner);
}

export function tasksOf(state: AppState, owner: UserId): Task[] {
  const ownedIds = new Set(listsOf(state, owner).map((list) => list.id));
  return liveTasks(state).filter((task) => ownedIds.has(task.listId));
}

/** The list a delegated task lands in: the owner's first live list. */
export function inboxListId(state: AppState, owner: UserId): string | null {
  return listsOf(state, owner)[0]?.id ?? null;
}

export function userName(state: AppState, userId: UserId): string {
  return state.users.find((user) => user.id === userId)?.name ?? userId;
}

export function otherUser(userId: UserId): UserId {
  return userId === "a" ? "b" : "a";
}

/** The person a task belongs to, derived from its list. */
export function ownerOfTask(state: AppState, task: Task): UserId | null {
  return state.lists.find((list) => list.id === task.listId)?.owner ?? null;
}
