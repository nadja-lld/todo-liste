import {
  PRIORITIES,
  RECURRENCES,
  SCHEMA_VERSION,
  type AppState,
  type Priority,
  type Recurrence,
  type Task,
  type TodoList,
} from "./types";

export type ParseResult = { ok: true; state: AppState } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class ValidationError extends Error {}

function fail(message: string): never {
  throw new ValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string") fail(`${path} must be a string`);
  if (!allowEmpty && value.trim() === "") fail(`${path} must not be empty`);
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, path, true);
}

function requireIsoDate(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  const text = requireString(value, path);
  if (!ISO_DATE.test(text)) {
    fail(`${path} must be an ISO date YYYY-MM-DD`);
  }

  // Parse and validate the date components to reject impossible calendar dates
  const [yearStr, monthStr, dayStr] = text.split("-");
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);
  const day = parseInt(dayStr!, 10);

  // Create a UTC date and verify round-trip to detect normalization
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    fail(`${path} must be an ISO date YYYY-MM-DD`);
  }

  return text;
}

function requireTimestamp(value: unknown, path: string): string {
  const text = requireString(value, path);
  if (Number.isNaN(Date.parse(text))) fail(`${path} must be an ISO 8601 timestamp`);
  return text;
}

function optionalTimestamp(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return requireTimestamp(value, path);
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail(`${path} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function parseList(raw: unknown, path: string): TodoList {
  if (!isRecord(raw)) fail(`${path} must be an object`);
  if (typeof raw.position !== "number" || !Number.isInteger(raw.position)) {
    fail(`${path}.position must be an integer`);
  }
  return {
    id: requireString(raw.id, `${path}.id`),
    name: requireString(raw.name, `${path}.name`),
    position: raw.position,
  };
}

function parseTask(raw: unknown, path: string, listIds: Set<string>): Task {
  if (!isRecord(raw)) fail(`${path} must be an object`);
  const listId = requireString(raw.listId, `${path}.listId`);
  if (!listIds.has(listId)) fail(`${path}.listId references unknown list ${listId}`);
  const task: Task = {
    id: requireString(raw.id, `${path}.id`),
    listId,
    title: requireString(raw.title, `${path}.title`),
    priority: requireOneOf<Priority>(raw.priority, PRIORITIES, `${path}.priority`),
    recurrence: requireOneOf<Recurrence>(raw.recurrence, RECURRENCES, `${path}.recurrence`),
    createdAt: requireTimestamp(raw.createdAt, `${path}.createdAt`),
  };
  const note = optionalString(raw.note, `${path}.note`);
  if (note !== undefined) task.note = note;
  const dueDate = requireIsoDate(raw.dueDate, `${path}.dueDate`);
  if (dueDate !== undefined) task.dueDate = dueDate;
  const completedAt = optionalTimestamp(raw.completedAt, `${path}.completedAt`);
  if (completedAt !== undefined) task.completedAt = completedAt;
  return task;
}

function requireUniqueIds(items: { id: string }[], path: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) fail(`${path} contains duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

export function parseAppState(input: unknown): ParseResult {
  try {
    if (!isRecord(input)) fail("state must be an object");
    if (input.schemaVersion !== SCHEMA_VERSION) {
      fail(`unsupported schemaVersion: ${String(input.schemaVersion)}`);
    }
    if (!Array.isArray(input.lists)) fail("lists must be an array");
    if (!Array.isArray(input.tasks)) fail("tasks must be an array");
    const lists = input.lists.map((raw, index) => parseList(raw, `lists[${index}]`));
    requireUniqueIds(lists, "lists");
    const listIds = new Set(lists.map((list) => list.id));
    const tasks = input.tasks.map((raw, index) => parseTask(raw, `tasks[${index}]`, listIds));
    requireUniqueIds(tasks, "tasks");
    return { ok: true, state: { schemaVersion: SCHEMA_VERSION, lists, tasks } };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
