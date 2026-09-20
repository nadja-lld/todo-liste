# Two-User Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let exactly two people use the to-do PWA, each seeing only their own lists, with either able to put a task on the other's list.

**Architecture:** The app stays offline-first — `localStorage` remains the render source. A Cloudflare Worker backed by D1 stores one shared JSON document with a version counter; the client reconciles local and remote with a pure last-write-wins merge and writes back under optimistic concurrency. Ownership hangs off `TodoList.owner`, so "my list" is a filter and delegation is a list move.

**Tech Stack:** Preact 10, TypeScript 5, Vite 7, Vitest, Cloudflare Workers + D1, wrangler.

**Spec:** `docs/superpowers/specs/2026-09-20-two-user-sync-design.md`

## Global Constraints

- Dependency direction: `ui -> sync -> domain`, `ui -> storage -> domain`. Nothing in `src/domain/` may touch browser globals.
- Every visible string goes through `t("key")`; keys are added to `src/i18n/de.ts` **and** `src/i18n/en.ts` together.
- `dueDate` is `YYYY-MM-DD`; all date maths goes through `src/domain/dates.ts`.
- Timestamps (`createdAt`, `updatedAt`, `deletedAt`, `completedAt`, `seenAt`) are ISO 8601 strings.
- Domain tests run in Node; UI tests start with `// @vitest-environment jsdom`.
- Vitest only collects `tests/**/*.test.ts(x)` — every test file lives under `tests/`.
- Commits: English imperative, why not what, trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Lint gate before every commit: `npm run lint && npm run typecheck && npm test`.
- User ids are the literals `"a"` and `"b"`. Default names come from i18n keys `defaultUserAName` ("Person 1") and `defaultUserBName` ("Person 2").
- Device-local settings live under their own keys and never enter the synced document: `todo.identity`, `todo.accessCode`, `todo.adopted`.
- Sync is enabled only when `import.meta.env.VITE_SYNC_URL` is a non-empty string. With it unset the app must behave exactly as it does today.

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/domain/types.ts` | v2 shape: `User`, `owner`, `updatedAt`, `deletedAt`, `createdBy`, `seenAt` |
| `src/domain/schema.ts` | validation of the v2 document |
| `src/domain/state.ts` | reducers, now timestamp-stamping and tombstoning |
| `src/domain/selectors.ts` *(new)* | live (non-tombstoned) views over state, ownership filters, inbox lookup |
| `src/domain/merge.ts` *(new)* | pure `mergeState(local, remote)` |
| `src/storage/localStorage.ts` | v1 → v2 migration ahead of validation |
| `src/storage/deviceSettings.ts` *(new)* | identity, access code, adopted flag |
| `src/sync/syncClient.ts` *(new)* | the two HTTP calls, no UI concerns |
| `src/sync/syncCycle.ts` *(new)* | fetch → merge → push → conflict retry, pure of timers |
| `src/ui/useSync.ts` *(new)* | triggers, status, wiring into app state |
| `src/ui/Onboarding.tsx` *(new)* | access code entry and identity choice |
| `src/ui/*.tsx` | ownership filtering, delegation toggle, "new from X" marker, status |
| `server/src/document.ts` *(new)* | read/write with version check, pure over a D1-ish binding |
| `server/src/index.ts` *(new)* | routing, bearer check, CORS, size limit |

---

### Task 1: Domain model v2

Types, validation and reducers move to the v2 shape together, because the added
required fields break compilation until every reducer stamps them.

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/schema.ts`
- Modify: `src/domain/state.ts`
- Create: `src/domain/selectors.ts`
- Test: `tests/domain/schema.test.ts`, `tests/domain/state.test.ts`, `tests/domain/selectors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type UserId = "a" | "b";
  export interface User { id: UserId; name: string; updatedAt: string }
  export interface TodoList { id: string; name: string; position: number; owner: UserId; updatedAt: string; deletedAt?: string }
  export interface Task { /* existing fields */ createdBy: UserId; seenAt?: string; updatedAt: string; deletedAt?: string }
  export interface AppState { schemaVersion: 2; users: User[]; lists: TodoList[]; tasks: Task[] }

  export function createInitialState(defaultListName: string, names: { a: string; b: string }, now: Date): AppState;
  export function addTask(state: AppState, input: { listId: string; title: string; createdBy: UserId }, now: Date): AppState;
  export function updateTask(state: AppState, taskId: string, patch: TaskPatch, now: Date): AppState;
  export function toggleTask(state: AppState, taskId: string, now: Date): AppState;
  export function markTaskSeen(state: AppState, taskId: string, now: Date): AppState;
  export function deleteTask(state: AppState, taskId: string, now: Date): AppState;
  export function clearCompleted(state: AppState, owner: UserId, now: Date): AppState;
  export function addList(state: AppState, name: string, owner: UserId, now: Date): AppState;
  export function renameList(state: AppState, listId: string, name: string, now: Date): AppState;
  export function moveList(state: AppState, listId: string, direction: "up" | "down", now: Date): AppState;
  export function deleteList(state: AppState, listId: string, now: Date): AppState;
  export function renameUser(state: AppState, userId: UserId, name: string, now: Date): AppState;

  // selectors.ts
  export function liveLists(state: AppState): TodoList[];            // tombstones dropped, position-sorted
  export function liveTasks(state: AppState): Task[];
  export function listsOf(state: AppState, owner: UserId): TodoList[];
  export function tasksOf(state: AppState, owner: UserId): Task[];
  export function inboxListId(state: AppState, owner: UserId): string | null;
  export function userName(state: AppState, userId: UserId): string;
  ```

- [ ] **Step 1: Write the failing tests**

`tests/domain/selectors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addList, createInitialState, deleteList } from "../../src/domain/state";
import { inboxListId, listsOf, liveLists } from "../../src/domain/selectors";

const NOW = new Date("2026-09-20T10:00:00.000Z");
const NAMES = { a: "Person 1", b: "Person 2" };

describe("selectors", () => {
  it("hides tombstoned lists", () => {
    let state = createInitialState("Aufgaben", NAMES, NOW);
    state = addList(state, "Einkauf", "a", NOW);
    const target = listsOf(state, "a")[1]!;
    state = deleteList(state, target.id, NOW);
    expect(liveLists(state).map((l) => l.name)).not.toContain("Einkauf");
    expect(state.lists).toHaveLength(2); // tombstone retained in the document
  });

  it("gives each user their own inbox", () => {
    const state = createInitialState("Aufgaben", NAMES, NOW);
    expect(inboxListId(state, "a")).not.toBeNull();
    expect(inboxListId(state, "b")).not.toBeNull();
    expect(inboxListId(state, "a")).not.toEqual(inboxListId(state, "b"));
  });

  it("returns the lowest-position live list as inbox", () => {
    let state = createInitialState("Aufgaben", NAMES, NOW);
    state = addList(state, "Zweitliste", "a", NOW);
    const first = listsOf(state, "a")[0]!;
    expect(inboxListId(state, "a")).toEqual(first.id);
  });
});
```

Extend `tests/domain/state.test.ts` with:

```ts
it("stamps updatedAt when a task is edited", () => {
  const created = new Date("2026-09-20T10:00:00.000Z");
  const edited = new Date("2026-09-20T11:00:00.000Z");
  let state = createInitialState("Aufgaben", NAMES, created);
  state = addTask(state, { listId: inboxListId(state, "a")!, title: "Milch", createdBy: "a" }, created);
  const id = state.tasks[0]!.id;
  state = updateTask(state, id, { title: "Brot" }, edited);
  expect(state.tasks[0]!.updatedAt).toEqual(edited.toISOString());
});

it("tombstones instead of dropping a deleted task", () => {
  const now = new Date("2026-09-20T10:00:00.000Z");
  let state = createInitialState("Aufgaben", NAMES, now);
  state = addTask(state, { listId: inboxListId(state, "a")!, title: "Milch", createdBy: "a" }, now);
  const id = state.tasks[0]!.id;
  state = deleteTask(state, id, now);
  expect(state.tasks).toHaveLength(1);
  expect(state.tasks[0]!.deletedAt).toEqual(now.toISOString());
  expect(liveTasks(state)).toHaveLength(0);
});

it("tombstones a list together with its tasks", () => {
  const now = new Date("2026-09-20T10:00:00.000Z");
  let state = createInitialState("Aufgaben", NAMES, now);
  state = addList(state, "Einkauf", "a", now);
  const listId = listsOf(state, "a")[1]!.id;
  state = addTask(state, { listId, title: "Milch", createdBy: "a" }, now);
  state = deleteList(state, listId, now);
  expect(state.tasks[0]!.deletedAt).toEqual(now.toISOString());
});

it("only clears completed tasks of the given owner", () => {
  const now = new Date("2026-09-20T10:00:00.000Z");
  let state = createInitialState("Aufgaben", NAMES, now);
  const aList = inboxListId(state, "a")!;
  const bList = inboxListId(state, "b")!;
  state = addTask(state, { listId: aList, title: "A", createdBy: "a" }, now);
  state = addTask(state, { listId: bList, title: "B", createdBy: "a" }, now);
  state = toggleTask(state, state.tasks[0]!.id, now);
  state = toggleTask(state, state.tasks[1]!.id, now);
  state = clearCompleted(state, "a", now);
  expect(state.tasks[0]!.deletedAt).toBeDefined();
  expect(state.tasks[1]!.deletedAt).toBeUndefined();
});

it("marks a task as seen once", () => {
  const now = new Date("2026-09-20T10:00:00.000Z");
  const later = new Date("2026-09-20T12:00:00.000Z");
  let state = createInitialState("Aufgaben", NAMES, now);
  state = addTask(state, { listId: inboxListId(state, "b")!, title: "Für dich", createdBy: "a" }, now);
  const id = state.tasks[0]!.id;
  expect(state.tasks[0]!.seenAt).toBeUndefined();
  state = markTaskSeen(state, id, later);
  expect(state.tasks[0]!.seenAt).toEqual(later.toISOString());
  state = markTaskSeen(state, id, new Date("2026-09-20T13:00:00.000Z"));
  expect(state.tasks[0]!.seenAt).toEqual(later.toISOString()); // not re-stamped
});
```

Extend `tests/domain/schema.test.ts` with:

```ts
it("rejects a document without exactly two users", () => {
  const state = createInitialState("Aufgaben", NAMES, NOW);
  const broken = { ...state, users: [state.users[0]] };
  const parsed = parseAppState(JSON.parse(JSON.stringify(broken)));
  expect(parsed.ok).toBe(false);
});

it("rejects a list with an unknown owner", () => {
  const state = createInitialState("Aufgaben", NAMES, NOW);
  const broken = JSON.parse(JSON.stringify(state));
  broken.lists[0].owner = "c";
  expect(parseAppState(broken).ok).toBe(false);
});

it("accepts a task referencing a tombstoned list", () => {
  let state = createInitialState("Aufgaben", NAMES, NOW);
  state = addTask(state, { listId: inboxListId(state, "a")!, title: "Milch", createdBy: "a" }, NOW);
  state = deleteList(state, state.lists[0]!.id, NOW);
  expect(parseAppState(JSON.parse(JSON.stringify(state))).ok).toBe(true);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/domain`
Expected: FAIL — `createInitialState` takes one argument, `selectors` does not exist.

- [ ] **Step 3: Implement the v2 types**

`src/domain/types.ts` gains `SCHEMA_VERSION = 2`, `UserId`, `User`, and the new fields
on `TodoList` and `Task` exactly as in the Interfaces block above.

- [ ] **Step 4: Implement selectors**

`src/domain/selectors.ts`: `liveLists` filters `deletedAt === undefined` and sorts by
`position`; `liveTasks` filters tombstones; `listsOf`/`tasksOf` filter by owner (a task's
owner is the owner of its list); `inboxListId` returns the first entry of `listsOf`;
`userName` looks the id up in `state.users`.

- [ ] **Step 5: Update the reducers**

Every reducer takes `now: Date` and sets `updatedAt = now.toISOString()` on each entity
it changes. `deleteTask`, `deleteList` and `clearCompleted` set `deletedAt` instead of
filtering. `deleteList` tombstones the list and every task whose `listId` matches, and
drops the "cannot delete the last list" guard in favour of "cannot delete the owner's
last live list". `addTask` records `createdBy` and leaves `seenAt` unset. `toggleTask`'s
recurrence follow-up inherits `createdBy` from the original and is stamped `seenAt = now`
so a self-generated task never shows the "new from" marker. `markTaskSeen` sets `seenAt`
only when it is still unset. `renameUser` updates one entry of `users`.

- [ ] **Step 6: Update the validator**

`parseAppState` requires `schemaVersion === 2`, `users` to be exactly the ids `a` and `b`
with a name and `updatedAt`, `owner` on every list to be `a` or `b`, `updatedAt` on every
list and task, and optional `deletedAt`/`seenAt` timestamps. The check that a task's
`listId` references a known list stays, but tombstoned lists count as known.

- [ ] **Step 7: Run the domain tests**

Run: `npx vitest run tests/domain`
Expected: PASS.

- [ ] **Step 8: Fix the call sites so the tree compiles**

`src/ui/*` and `src/storage/*` still call the old signatures. Thread `now()` through and
pass the current identity where an owner is required; a placeholder `"a"` is acceptable
here because Task 7 introduces the real identity. Run `npm run typecheck` until clean.

- [ ] **Step 9: Commit**

```bash
git add src/domain tests/domain src/ui src/storage
git commit -m "Model per-person ownership and tombstones in the domain layer

Two people share one document, so entities need an owner and deletions
must survive a merge instead of vanishing from one side.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Storage migration v1 → v2

**Files:**
- Modify: `src/storage/localStorage.ts`
- Create: `src/storage/migrate.ts`
- Test: `tests/storage/migrate.test.ts`, `tests/storage/localStorage.test.ts`

**Interfaces:**
- Consumes: `AppState`, `SCHEMA_VERSION` from Task 1.
- Produces: `export function migrate(raw: unknown, names: { a: string; b: string }, now: Date): unknown;`

- [ ] **Step 1: Write the failing test**

```ts
// tests/storage/migrate.test.ts
import { describe, expect, it } from "vitest";
import { migrate } from "../../src/storage/migrate";
import { parseAppState } from "../../src/domain/schema";

const NOW = new Date("2026-09-20T10:00:00.000Z");
const NAMES = { a: "Person 1", b: "Person 2" };

const V1 = {
  schemaVersion: 1,
  lists: [{ id: "l1", name: "Aufgaben", position: 0 }],
  tasks: [
    {
      id: "t1",
      listId: "l1",
      title: "Milch",
      priority: "medium",
      recurrence: "none",
      createdAt: "2026-09-14T08:00:00.000Z",
    },
  ],
};

describe("migrate", () => {
  it("upgrades a v1 document into a valid v2 document", () => {
    const parsed = parseAppState(migrate(structuredClone(V1), NAMES, NOW));
    expect(parsed.ok).toBe(true);
  });

  it("keeps existing data as person a", () => {
    const parsed = parseAppState(migrate(structuredClone(V1), NAMES, NOW));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.lists[0]!.owner).toEqual("a");
    expect(parsed.state.tasks[0]!.createdBy).toEqual("a");
    expect(parsed.state.tasks[0]!.updatedAt).toEqual("2026-09-14T08:00:00.000Z");
    expect(parsed.state.tasks[0]!.seenAt).toEqual(NOW.toISOString());
    expect(parsed.state.users.map((u) => u.id)).toEqual(["a", "b"]);
  });

  it("gives person b an inbox list so tasks can be delegated to them", () => {
    const parsed = parseAppState(migrate(structuredClone(V1), NAMES, NOW));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.lists.some((l) => l.owner === "b")).toBe(true);
  });

  it("passes a v2 document through untouched", () => {
    const v2 = migrate(structuredClone(V1), NAMES, NOW);
    expect(migrate(structuredClone(v2), NAMES, NOW)).toEqual(v2);
  });

  it("leaves an unknown version alone so it is quarantined as corrupt", () => {
    const future = { schemaVersion: 99 };
    expect(migrate(future, NAMES, NOW)).toEqual(future);
  });
});
```

Extend `tests/storage/localStorage.test.ts`:

```ts
it("loads a stored v1 document by migrating it", () => {
  const storage = createMemoryStorage();
  storage.setItem(STATE_KEY, JSON.stringify(V1));
  const result = loadState(storage, "Aufgaben", NAMES, NOW);
  expect(result.recoveredFromCorrupt).toBe(false);
  expect(result.state.lists[0]!.owner).toEqual("a");
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/storage`
Expected: FAIL — `src/storage/migrate.ts` does not exist.

- [ ] **Step 3: Implement the migration**

`migrate` returns its input unchanged unless `schemaVersion === 1`. For v1 it builds the
`users` array, sets `owner: "a"` and `updatedAt: now` on every list, sets
`createdBy: "a"`, `seenAt: now` and `updatedAt: task.createdAt` on every task, appends an
inbox list owned by `"b"`, and sets `schemaVersion: 2`.

- [ ] **Step 4: Call it from loadState**

`loadState(storage, defaultListName, names, now)` runs `JSON.parse`, then `migrate`, then
`parseAppState`. A parse or validation failure still backs the payload up under
`todo.state.backup.<iso>` and starts fresh.

- [ ] **Step 5: Migrate on import too**

`parseImport` in `src/domain/exportImport.ts` currently hands raw JSON to `parseAppState`,
so a JSON backup exported before this change would be rejected as invalid. It must run the
same migration first. Because `src/domain/` may not know the current time or the default
names, `parseImport(text, names, now)` takes them as arguments and `SettingsSheet` supplies
them. Test in `tests/domain/exportImport.test.ts`: a v1 export file imports successfully
and its lists come back owned by `"a"`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/storage tests/domain/exportImport.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/storage tests/storage src/domain/exportImport.ts tests/domain/exportImport.test.ts
git commit -m "Migrate stored v1 documents instead of quarantining them

Bumping the schema without a migration would have flagged every
existing device's data as corrupt on the next load.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Merge

**Files:**
- Create: `src/domain/merge.ts`
- Test: `tests/domain/merge.test.ts`

**Interfaces:**
- Consumes: `AppState` from Task 1.
- Produces: `export function mergeState(local: AppState, remote: AppState, now: Date): AppState;`
  (`now` drives the 30-day tombstone purge.)

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/merge.test.ts covers, with explicit fixtures:
// - an entity only on one side is kept (both directions)
// - the greater updatedAt wins for a task edited on both sides
// - an exact updatedAt tie resolves by the higher id, identically in both argument orders
// - a later delete beats an earlier complete
// - a later complete beats an earlier delete (the task comes back, undeleted)
// - list renames merge independently of their tasks
// - user renames merge by updatedAt
// - tombstones older than 30 days are dropped, younger ones kept
// - merge is commutative: mergeState(a, b, now) equals mergeState(b, a, now)
```

Write each of those as a named `it(...)` with concrete fixtures; the commutativity test
asserts deep equality after sorting `lists`, `tasks` and `users` by id.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/domain/merge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
function pick<T extends { id: string; updatedAt: string }>(x: T, y: T): T {
  if (x.updatedAt !== y.updatedAt) return x.updatedAt > y.updatedAt ? x : y;
  return x.id > y.id ? x : y;
}
```

Merge each collection by id with `pick`, then drop entries whose `deletedAt` is more
than 30 days before `now`. `schemaVersion` comes from either side (they are equal).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/domain/merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/merge.ts tests/domain/merge.test.ts
git commit -m "Reconcile two devices with per-entity last-write-wins

Offline edits on both phones must converge to the same document
regardless of which side syncs first.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Worker and D1

**Files:**
- Create: `server/src/document.ts`, `server/src/index.ts`, `server/schema.sql`, `server/wrangler.toml`, `server/README.md`
- Test: `tests/server/document.test.ts`

**Interfaces:**
- Consumes: nothing from the client.
- Produces:
  ```ts
  export interface StoredDocument { version: number; state: unknown }
  export interface Db {
    first(sql: string, params: unknown[]): Promise<Record<string, unknown> | null>;
    run(sql: string, params: unknown[]): Promise<{ changes: number }>;
  }
  export function readDocument(db: Db): Promise<StoredDocument | null>;
  export type WriteResult = { ok: true; version: number } | { ok: false; current: StoredDocument };
  export function writeDocument(db: Db, baseVersion: number, state: unknown, nowIso: string): Promise<WriteResult>;
  ```

- [ ] **Step 1: Write the failing test**

`tests/server/document.test.ts` builds an in-memory `Db` stub holding one row and asserts:
creating the first document from `baseVersion: 0`; a matching `baseVersion` increments the
version; a stale `baseVersion` returns `{ ok: false }` with the current document; two
sequential writes from the same base — the second loses.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/server`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `document.ts`**

`readDocument` selects the single row `id = 'shared'` and JSON-parses `state`.
`writeDocument` runs `UPDATE documents SET version = ?, state = ?, updated_at = ? WHERE id = 'shared' AND version = ?`;
when `changes === 0` it either inserts (no row yet and `baseVersion === 0`) or re-reads
and returns the conflict.

- [ ] **Step 4: Implement `index.ts`**

Routes `GET /state` and `PUT /state`. Rejects a missing or wrong bearer token with 401
after a constant-time comparison against `env.ACCESS_CODE`. Rejects bodies over 1 MB with
413. Answers `OPTIONS` and sets `Access-Control-Allow-Origin` only for the configured
`env.ALLOWED_ORIGIN`. Wraps the D1 binding into the `Db` interface above.

- [ ] **Step 5: Write `schema.sql` and `wrangler.toml`**

```sql
CREATE TABLE IF NOT EXISTS documents (
  id         TEXT    PRIMARY KEY,
  version    INTEGER NOT NULL,
  state      TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
```

`wrangler.toml` declares `name = "todo-sync"`, a `compatibility_date`, the `DB` D1 binding
and `ALLOWED_ORIGIN` as a plain var. `ACCESS_CODE` is a secret and never appears here.

- [ ] **Step 6: Write `server/README.md`**

The exact commands to create the database, apply the schema, set the secret and deploy.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/server`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server tests/server
git commit -m "Add a versioned sync endpoint on Cloudflare Workers

A shared store is the smallest thing that lets two phones exchange
tasks; the version counter keeps one write from silently overwriting
the other.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Sync client and cycle

**Files:**
- Create: `src/sync/syncClient.ts`, `src/sync/syncCycle.ts`
- Test: `tests/sync/syncClient.test.ts`, `tests/sync/syncCycle.test.ts`

**Interfaces:**
- Consumes: `mergeState` (Task 3), `parseAppState` (Task 1).
- Produces:
  ```ts
  export interface RemoteDocument { version: number; state: AppState }
  export interface SyncClient {
    get(): Promise<RemoteDocument | null>;                    // null = server has no document yet
    put(baseVersion: number, state: AppState): Promise<{ ok: true; version: number } | { ok: false; current: RemoteDocument }>;
  }
  export function createSyncClient(baseUrl: string, accessCode: string, fetchImpl?: typeof fetch): SyncClient;
  export class SyncAuthError extends Error {}

  export type CycleResult =
    | { outcome: "synced"; state: AppState; version: number }
    | { outcome: "unchanged"; version: number }
    | { outcome: "conflict-exhausted" };
  export function runSyncCycle(client: SyncClient, local: AppState, now: Date, adopt: boolean): Promise<CycleResult>;
  ```

- [ ] **Step 1: Write the failing tests**

`syncClient.test.ts` drives a stub `fetch`: a 200 returns the document; a 404 or an empty
document yields `null`; a 401 throws `SyncAuthError`; a 409 resolves to
`{ ok: false, current }`; a malformed body is rejected via `parseAppState`.

`syncCycle.test.ts` drives a stub `SyncClient`:
- with `adopt: true` and a document on the server, the result is the server state verbatim
  and no `put` happens
- with `adopt: true` and no document, the local state is pushed
- with `adopt: false`, local and remote are merged and the merge is pushed
- a `put` answering 409 causes a re-merge against the returned document and a second `put`
- three consecutive conflicts yield `{ outcome: "conflict-exhausted" }`
- when the merge equals the remote state, no `put` happens and the outcome is `unchanged`

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/sync`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `syncClient.ts`**

Plain `fetch` with `Authorization: Bearer <accessCode>` and `Content-Type: application/json`.
Every response body passes through `parseAppState` before it is handed on, so a corrupt
server document cannot poison the device.

- [ ] **Step 4: Implement `syncCycle.ts`**

No timers, no browser APIs beyond the injected client — the retry loop is a plain `for`
over at most three attempts.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/sync`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sync tests/sync
git commit -m "Drive one sync attempt as testable, timer-free logic

Keeping the fetch-merge-push cycle separate from scheduling is what
makes the conflict retry path testable at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Device settings

**Files:**
- Create: `src/storage/deviceSettings.ts`
- Test: `tests/storage/deviceSettings.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DeviceSettings { identity: UserId | null; accessCode: string | null; adopted: boolean }
  export function loadDeviceSettings(storage: Storage): DeviceSettings;
  export function saveIdentity(storage: Storage, identity: UserId): void;
  export function saveAccessCode(storage: Storage, code: string): void;
  export function markAdopted(storage: Storage): void;
  export function clearDeviceSettings(storage: Storage): void;
  export function syncBaseUrl(): string | null;   // reads import.meta.env.VITE_SYNC_URL, null when unset/empty
  ```

- [ ] **Step 1: Write the failing test**

Round-trip each setter through an in-memory `Storage`; assert an unknown identity value in
storage reads back as `null`; assert every accessor swallows a throwing `Storage`
(iOS "Block All Cookies") and reports the empty default rather than propagating.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/storage/deviceSettings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement, wrapping every access in try/catch**

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/storage/deviceSettings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/deviceSettings.ts tests/storage/deviceSettings.test.ts
git commit -m "Keep identity and access code out of the synced document

Who this device is and how it authenticates are per-device facts;
syncing them would overwrite the other phone's identity.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Onboarding and identity in the UI

**Files:**
- Create: `src/ui/Onboarding.tsx`
- Modify: `src/ui/App.tsx`, `src/i18n/de.ts`, `src/i18n/en.ts`
- Test: `tests/ui/Onboarding.test.tsx`, `tests/ui/App.test.tsx`

**Interfaces:**
- Consumes: `loadDeviceSettings`, `saveIdentity`, `saveAccessCode`, `syncBaseUrl` (Task 6); `userName` (Task 1).
- Produces: `export function Onboarding(props: { names: { a: string; b: string }; onDone: (identity: UserId, accessCode: string) => void }): VNode;`

- [ ] **Step 1: Write the failing tests**

```
// tests/ui/Onboarding.test.tsx — // @vitest-environment jsdom
// - renders a code field and two identity buttons labelled with the two names
// - the submit button stays disabled until a code is entered and an identity picked
// - submitting calls onDone with the trimmed code and the chosen identity

// tests/ui/App.test.tsx additions
// - with VITE_SYNC_URL unset, no onboarding is shown and the app renders the list (today's behaviour)
// - with sync configured and no stored identity, onboarding is shown instead of the list
// - with sync configured and a stored identity, the list is shown
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/ui`
Expected: FAIL.

- [ ] **Step 3: Implement `Onboarding.tsx`**

A `Sheet`-free full-screen panel: one password-type input for the code, two buttons for
the identity, one submit. New i18n keys: `onboardingTitle`, `onboardingIntro`,
`accessCode`, `whoAreYou`, `startUsing`, `defaultUserAName`, `defaultUserBName`.

- [ ] **Step 4: Wire it into `App.tsx`**

Read device settings once. When `syncBaseUrl()` is non-null and `identity` is null,
render `<Onboarding>` and nothing else. Otherwise the identity defaults to `"a"` so an
unconfigured build behaves exactly as today.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui tests/ui src/i18n
git commit -m "Ask once per device who is using it

Identity cannot be inferred and must not be guessed wrong, so the
first launch blocks until the code and the person are known.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Ownership and delegation in the UI

**Files:**
- Modify: `src/ui/App.tsx`, `src/ui/AddTaskBar.tsx`, `src/ui/TaskRow.tsx`, `src/ui/TaskList.tsx`, `src/ui/TaskDetailSheet.tsx`, `src/i18n/de.ts`, `src/i18n/en.ts`
- Test: `tests/ui/App.test.tsx`, `tests/ui/AddTaskBar.test.tsx`, `tests/ui/TaskDetailSheet.test.tsx`

**Interfaces:**
- Consumes: `listsOf`, `tasksOf`, `inboxListId`, `userName` (Task 1); `markTaskSeen` (Task 1).
- Produces: `AddTaskBar` gains `props.assignTo: UserId`, `props.otherName: string`, `props.onAssignToChange: (id: UserId) => void`, and `onAdd(title: string, assignTo: UserId)`.

- [ ] **Step 1: Write the failing tests**

```
// - the list switcher offers only the current identity's lists
// - the today view shows only the current identity's tasks
// - toggling "for <other name>" and adding a task puts it on the other person's inbox
//   with createdBy set to the current identity, and it does NOT appear in my view
// - a task created by the other person and not yet seen renders the "new from X" marker
// - opening that task clears the marker
// - a task I created for myself never shows the marker
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/ui`
Expected: FAIL.

- [ ] **Step 3: Implement**

`App.tsx` derives `lists = listsOf(state, identity)` and filters every view through
`tasksOf(state, identity)`. `AddTaskBar` renders a two-way segmented control ("for me" / "for
\<other name\>") that resets to "for me" after every submit. `TaskRow` takes a new
`newFromName?: string` prop and renders a `task-row__badge` span with
`t("newFrom", { name })` when it is set; `App.tsx` supplies it for tasks where
`task.createdBy !== identity && task.seenAt === undefined`.
`TaskDetailSheet` calls `onSeen(task.id)` on mount. New i18n keys: `forMe`, `forOther`,
`newFrom`.

- [ ] **Step 4: Style the badge**

Add a `.task-row__badge` rule to `src/ui/styles.css` using the existing accent variable;
it must meet the 4.5:1 contrast requirement in both colour schemes.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui tests/ui src/i18n
git commit -m "Show each person only their own lists and let them delegate

Separate views are the whole point of the second user; delegation
reuses list ownership rather than introducing a second concept.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Settings

**Files:**
- Modify: `src/ui/SettingsSheet.tsx`, `src/i18n/de.ts`, `src/i18n/en.ts`
- Test: `tests/ui/SettingsSheet.test.tsx`

**Interfaces:**
- Consumes: `renameUser` (Task 1), `clearDeviceSettings` (Task 6), `listsOf` (Task 1).

- [ ] **Step 1: Write the failing tests**

```
// - list management acts on the current identity's lists only
// - a new list is created with the current identity as owner
// - renaming a person updates users and the change is visible immediately
// - "clear completed" only affects the current identity
// - the reset button clears the device settings after confirmation
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/ui/SettingsSheet.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add a "people" section with two text inputs bound to `renameUser`, a read-only sync status
line, and a danger-styled reset button guarded by `confirm`. New i18n keys: `people`,
`syncStatus`, `syncStatusSynced`, `syncStatusOffline`, `syncStatusError`,
`syncStatusDisabled`, `resetDevice`, `confirmResetDevice`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui tests/ui src/i18n
git commit -m "Scope settings to the person using the device

Managing the other person's lists from here would contradict the
separate-views model the rest of the app now follows.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Wire sync into the running app

**Files:**
- Create: `src/ui/useSync.ts`
- Modify: `src/ui/App.tsx`, `src/ui/useAppState.ts`, `src/i18n/de.ts`, `src/i18n/en.ts`
- Test: `tests/ui/useSync.test.tsx`

**Interfaces:**
- Consumes: `runSyncCycle`, `createSyncClient` (Task 5); `markAdopted`, `loadDeviceSettings` (Task 6).
- Produces: `export type SyncStatus = "disabled" | "idle" | "syncing" | "offline" | "error" | "auth-error";`
  `export function useSync(args: { state: AppState; replace: (s: AppState) => void; storage: Storage; now: () => Date }): { status: SyncStatus; syncNow: () => void };`

- [ ] **Step 1: Write the failing tests**

```
// - with sync disabled the status is "disabled" and no fetch is issued
// - a successful cycle replaces app state and reports "idle"
// - a rejected code reports "auth-error"
// - a network failure reports "offline" and does not lose local state
// - a local change triggers exactly one cycle after the debounce, not one per keystroke
```

Drive time with `vi.useFakeTimers()`.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/ui/useSync.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the hook**

Triggers: on mount, on `visibilitychange` to visible, on `online`, 2 s debounced after
`state` changes, and a 60 s interval. Guard against overlapping cycles with a ref. On the
first successful cycle call `markAdopted`. Never throw into render — every failure maps to
a status.

- [ ] **Step 4: Show the status in `App.tsx`**

A small element in the header with an `aria-live="polite"` region, plus an error banner
for `auth-error` pointing at the reset button. New i18n key: `syncAuthFailed`.

- [ ] **Step 5: Run the whole suite**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui tests/ui src/i18n
git commit -m "Sync in the background without blocking the interface

The app must stay usable while a sync is in flight or failing, so
every outcome resolves to a status rather than an exception.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Deployment and documentation

**Files:**
- Create: `.github/workflows/deploy-worker.yml`
- Modify: `.github/workflows/deploy.yml`, `vite.config.ts`, `README.md`, `CLAUDE.md`, `SECURITY.md`
- Test: none (configuration); verified by `npm run build`

- [ ] **Step 1: Add the worker workflow**

Triggered on pushes to `main` touching `server/**`, running `wrangler deploy` with
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from repository secrets.

- [ ] **Step 2: Pass the sync URL into the build**

`deploy.yml` sets `VITE_SYNC_URL: ${{ vars.SYNC_URL }}` on the build step. An unset
variable produces an empty string, which disables sync — a build without the variable must
still work.

- [ ] **Step 3: Correct the claims that are no longer true**

The PWA manifest description in `vite.config.ts` ("Daten nur auf dem Gerät"), the matching
sentence in `README.md`, and the storage description in `SECURITY.md`.

- [ ] **Step 4: Update `CLAUDE.md`**

Replace the "no backend" framing, describe the new `src/sync/` and `server/` directories,
the `ui -> sync -> domain` rule, and replace the "Change storage shape" section with the
migration seam that now exists.

- [ ] **Step 5: Add the setup guide**

`docs/SETUP-SYNC.md`: generating the access code, creating the D1 database, applying the
schema, setting the secret, the two repository secrets and the `SYNC_URL` variable, and
entering the code on both phones.

- [ ] **Step 6: Verify the build both ways**

```bash
npm run build
VITE_SYNC_URL=https://example.invalid npm run build
```
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add .github vite.config.ts README.md CLAUDE.md SECURITY.md docs/SETUP-SYNC.md
git commit -m "Ship the worker separately and correct the device-only claims

The app is no longer device-only; leaving that in the manifest and
the security notes would be a false statement to users.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Verification

After Task 11: `npm run lint && npm run typecheck && npm test && npm run build` all pass,
and a build with `VITE_SYNC_URL` unset behaves exactly as the current app does.
