import type { AppState, Task, TodoList, User } from "./types";

/** How long a deletion must be remembered before it is safe to forget. */
const TOMBSTONE_RETENTION_DAYS = 30;
const TOMBSTONE_RETENTION_MS = TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

interface Versioned {
  id: string;
  updatedAt: string;
}

/**
 * A stable serialization: key order must not depend on how the object was built,
 * or two devices holding equal data would compare it differently.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => (x < y ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Last write wins. Two edits carrying the exact same timestamp cannot be told
 * apart by id — the id is the same entity on both sides — so the tie falls back
 * to the entity's content. The choice is arbitrary but identical on both
 * devices, which is what convergence needs.
 */
function pick<T extends Versioned>(x: T, y: T): T {
  if (x.updatedAt !== y.updatedAt) return x.updatedAt > y.updatedAt ? x : y;
  return canonical(x) >= canonical(y) ? x : y;
}

function mergeById<T extends Versioned>(local: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of local) merged.set(item.id, item);
  for (const item of remote) {
    const existing = merged.get(item.id);
    merged.set(item.id, existing ? pick(existing, item) : item);
  }
  return [...merged.values()];
}

function isExpiredTombstone(deletedAt: string | undefined, now: Date): boolean {
  if (deletedAt === undefined) return false;
  const at = Date.parse(deletedAt);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at > TOMBSTONE_RETENTION_MS;
}

/**
 * Reconciles the document this device holds with the one the server holds.
 *
 * Resolution is per entity, not per field: if both people edited the same task
 * while offline, the later edit wins whole and the earlier one is lost. With a
 * list per person that is rare, but it is the one place data can go missing.
 */
export function mergeState(local: AppState, remote: AppState, now: Date): AppState {
  const users = mergeById<User>(local.users, remote.users);
  const lists = mergeById<TodoList>(local.lists, remote.lists).filter(
    (list) => !isExpiredTombstone(list.deletedAt, now),
  );
  const listIds = new Set(lists.map((list) => list.id));
  const tasks = mergeById<Task>(local.tasks, remote.tasks).filter(
    (task) => !isExpiredTombstone(task.deletedAt, now) && listIds.has(task.listId),
  );
  return { schemaVersion: local.schemaVersion, users, lists, tasks };
}
