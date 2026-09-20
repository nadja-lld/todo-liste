import { newId } from "./ids";
import { SCHEMA_VERSION, type UserNames } from "./types";

interface V1List {
  id: string;
  name: string;
  position: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Upgrades a stored document to the current schema version. Anything that is not
 * a recognised older version is returned untouched, so `parseAppState` can reject
 * it and the caller can quarantine it as corrupt.
 *
 * v1 -> v2: everything that existed belonged to the only person there was, so it
 * becomes person "a". Person "b" gets an empty inbox list to delegate into.
 */
export function migrate(raw: unknown, names: UserNames, now: Date): unknown {
  if (!isRecord(raw) || raw.schemaVersion !== 1) return raw;
  const at = now.toISOString();
  const lists = Array.isArray(raw.lists) ? raw.lists : [];
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const maxPosition = lists.reduce(
    (max: number, list: unknown) =>
      isRecord(list) && typeof list.position === "number" ? Math.max(max, list.position) : max,
    -1,
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    users: [
      { id: "a", name: names.a, updatedAt: at },
      { id: "b", name: names.b, updatedAt: at },
    ],
    lists: [
      ...lists.map((list: unknown) => ({
        ...(isRecord(list) ? list : {}),
        owner: "a",
        updatedAt: at,
      })),
      {
        id: newId(),
        name: names.b,
        position: maxPosition + 1,
        owner: "b",
        updatedAt: at,
      } satisfies V1List & { owner: string; updatedAt: string },
    ],
    tasks: tasks.map((task: unknown) => {
      const record = isRecord(task) ? task : {};
      return {
        ...record,
        createdBy: "a",
        // Nothing that predates the second person can be news to anyone.
        seenAt: at,
        updatedAt: typeof record.createdAt === "string" ? record.createdAt : at,
      };
    }),
  };
}
