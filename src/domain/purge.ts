import type { AppState, Task, TodoList } from "./types";

/** How long a deletion must be remembered before both devices can forget it. */
export const TOMBSTONE_RETENTION_DAYS = 30;
/** How long a finished task stays in the document before it is dropped. */
export const COMPLETED_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function olderThan(timestamp: string | undefined, days: number, now: Date): boolean {
  if (timestamp === undefined) return false;
  const at = Date.parse(timestamp);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at > days * DAY_MS;
}

function isExpired(task: Task, now: Date): boolean {
  return (
    olderThan(task.deletedAt, TOMBSTONE_RETENTION_DAYS, now) ||
    olderThan(task.completedAt, COMPLETED_RETENTION_DAYS, now)
  );
}

/**
 * Drops what neither device needs any more. Both sides apply the same rule to
 * the same data, so they converge without exchanging further tombstones.
 *
 * Finished tasks expire too: the completed section is a recap of the current
 * day, so anything older is invisible yet would be carried in every sync for
 * as long as the document lives.
 */
export function purgeExpired(state: AppState, now: Date): AppState {
  const lists: TodoList[] = state.lists.filter(
    (list) => !olderThan(list.deletedAt, TOMBSTONE_RETENTION_DAYS, now),
  );
  const listIds = new Set(lists.map((list) => list.id));
  const tasks = state.tasks.filter((task) => !isExpired(task, now) && listIds.has(task.listId));
  if (lists.length === state.lists.length && tasks.length === state.tasks.length) return state;
  return { ...state, lists, tasks };
}
