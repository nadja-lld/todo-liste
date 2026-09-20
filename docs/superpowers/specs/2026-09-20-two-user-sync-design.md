# Two-User Sync – Design Spec

Date: 2026-09-20
Status: approved by Nadja (brainstorming session)
Supersedes the "no backend, no login, no sync" decision in `2026-09-14-todo-pwa-design.md`.

## 1. Goal

Give exactly two people access to the to-do tool. Each person sees only their own
lists. Either person can create a task for the other; it appears on the other
person's list and is marked as new until they have looked at it.

The app stays offline-capable: viewing, completing and creating tasks must work
without a network connection, with the two devices reconciling afterwards.

## 2. Decisions taken

| Topic          | Decision                                                            |
|----------------|---------------------------------------------------------------------|
| Privacy        | Separate views, shared document. No per-user access control.        |
| Offline        | Offline-first. Local state renders the UI; sync runs alongside.     |
| Backend        | Cloudflare Worker + D1, free tier, same repository under `server/`  |
| Auth           | One generated 32-character access code, shared by both people       |
| Identity       | Per-device choice ("who are you?"), stored outside the synced doc   |
| Conflicts      | Per-entity last-write-wins by `updatedAt`, ties broken by `id`      |
| Deletion       | Tombstones (`deletedAt`), purged after 30 days                      |
| Notification   | In-app marker only. No push notifications.                          |
| Encryption     | None at rest. Explicitly declined for this iteration.               |

### Rejected alternatives

- **Supabase** – free-tier projects pause after seven days of inactivity and must be
  woken manually, and client-side token refresh is extra code that can fail.
- **Firebase Firestore** – brings offline sync for free, but the SDK is larger than the
  whole current app and the security rules are a separate language to maintain.
- **Cloudflare KV instead of D1** – eventually consistent; a write from one phone may
  not be visible to the other for up to a minute. Wrong primitive for a sync store.

## 3. Data model

`SCHEMA_VERSION` goes from 1 to 2.

```ts
export type UserId = "a" | "b";

export interface User {
  id: UserId;
  name: string;
  /** ISO 8601 timestamp; a rename is merged like any other change */
  updatedAt: string;
}

export interface TodoList {
  id: string;
  name: string;
  position: number;
  owner: UserId;
  /** ISO 8601 timestamp */
  updatedAt: string;
  /** ISO 8601 timestamp; set means tombstone */
  deletedAt?: string;
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  note?: string;
  priority: Priority;
  dueDate?: string;        // YYYY-MM-DD
  recurrence: Recurrence;
  completedAt?: string;
  createdAt: string;
  createdBy: UserId;
  /** set when the owner has opened the task; drives the "new from X" marker */
  seenAt?: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface AppState {
  schemaVersion: 2;
  /** exactly two, ids "a" and "b" */
  users: User[];
  lists: TodoList[];
  tasks: Task[];
}
```

**Ownership hangs off the list, not the task.** A task belongs to whoever owns its
list. This keeps the existing multi-list feature intact (now per person), makes
"show me my list" a filter on `owner`, and makes reassignment identical to moving a
task between lists — logic `updateTask` already has.

**Creating a task for the other person** puts it into that person's inbox list and
records `createdBy`. The inbox list is the lowest-`position` list owned by that person
that is not tombstoned; if they have none, one is created as part of the same state
change. Their UI shows a "new from
\<name\>" marker on the row until the task is opened, which sets `seenAt`.

`parseAppState` is extended accordingly: `users` must hold exactly the ids `a` and
`b`, every list must carry a valid `owner`, and `updatedAt` must be a valid timestamp
on both lists and tasks. Tasks may reference a deleted (tombstoned) list; the UI
hides them, the merge keeps them.

## 4. Storage migration

`src/storage/localStorage.ts` gains a migration step that runs before validation.
A stored document with `schemaVersion: 1` is upgraded in place:

- `users` becomes two records with ids `a` and `b`, named from the i18n keys
  `defaultUserAName` / `defaultUserBName` and renameable in settings afterwards
- every list gets `owner: "a"` and `updatedAt` = now
- every task gets `createdBy: "a"`, `seenAt` = now and `updatedAt` = its `createdAt`
- no tombstones are introduced

Only then is `parseAppState` called. An unknown `schemaVersion` still quarantines the
document as corrupt, as today. The existing device's data therefore survives the
upgrade and becomes person A's lists.

This ordering is required by the warning in `CLAUDE.md`: the migration lands, with a
test covering a real v1 document, before `SCHEMA_VERSION` is bumped.

## 5. Sync protocol

Two endpoints, both requiring `Authorization: Bearer <access code>`:

```
GET  /state   →  200 { version, state }
PUT  /state      { baseVersion, state }
              →  200 { version }
              →  409 { version, state }     // someone else wrote first
              →  401                        // wrong or missing code
              →  413                        // body over 1 MB
```

`version` is an integer the server increments on every successful write. The write is
a single `UPDATE documents SET ... WHERE id = 'shared' AND version = ?`. If it affects
zero rows the write lost a race and the server replies 409 with the current document.
No transaction handling is needed.

Client sequence for a sync:

1. `GET /state`
2. `merged = mergeState(local, remote)`
3. if `merged` differs from `remote`, `PUT` it with `baseVersion = remote.version`
4. on 409, go to step 2 using the state returned with the conflict; at most 3 attempts
5. write `merged` to `localStorage` and to the UI state

**First sync after onboarding.** A freshly onboarded device has just run
`createInitialState`, whose lists carry ids that no other device knows. Merging that
scaffold with an existing server document would leave four inbox lists instead of two.
So the first sync on a device is an *adoption*, not a merge: if the server already
holds a document, the local scaffold is discarded and the server state is taken as-is.
Only if the server has no document yet is the local state pushed up. A device is
"fresh" until its first successful sync, recorded under `todo.adopted`.

Sync is triggered on app start, on `visibilitychange` to visible, 2 seconds after the
last local change (debounced), and every 60 seconds while the app is open. When
offline, the attempt is skipped and retried on the `online` event. The header shows a
small status: synced / offline / error.

## 6. Merge

`src/domain/merge.ts`, a pure function with no browser APIs:

```ts
export function mergeState(local: AppState, remote: AppState): AppState;
```

Rules:

- Entities are matched by `id` across `lists` and `tasks`.
- An entity present on one side only is kept.
- An entity present on both sides resolves to the one with the greater `updatedAt`.
  On an exact tie the id cannot decide — it is the same entity on both sides — so the
  tie falls back to comparing a canonical serialization of the entity. The winner is
  arbitrary but identical on both devices, which is what convergence requires.
  (Corrected during implementation; the original "ties broken by id" rule did not
  converge, and `tests/domain/merge.test.ts` now pins the corrected behaviour.)
- A tombstone is an ordinary state: deletion wins when it is later, and loses when the
  other side edited afterwards.
- `users` merges per user id by the same rule; name changes carry their own
  `updatedAt` on the `User` record.
- Tombstones older than 30 days are dropped from the result.

**Accepted limitation:** resolution is per entity, not per field. If both people edit
the same task while offline, the later edit wins whole and the earlier one is lost
rather than partially merged. With per-person lists this is rare, but it is the one
place data can be lost and it is not hidden.

## 7. Reducer changes

Every reducer in `src/domain/state.ts` must stamp `updatedAt`, so those that do not
currently receive the current time gain a `now: Date` parameter: `updateTask`,
`deleteTask`, `addList`, `renameList`, `moveList`, `deleteList`, `clearCompleted`.

`deleteTask`, `deleteList` and `clearCompleted` change from filtering entities out to
setting `deletedAt`. `deleteList` tombstones the list and its tasks rather than
dropping them. Selectors used by the UI (`sortedLists`, task queries) filter
tombstones out.

`createInitialState` creates two users and one inbox list per user.

## 8. Server

New top-level folder, deployed independently of the app:

```
server/
  src/index.ts      routing, bearer check, CORS, body size limit
  src/document.ts   read/write with version check (pure, testable)
  schema.sql        D1 table
  wrangler.toml
```

```sql
CREATE TABLE documents (
  id         TEXT    PRIMARY KEY,
  version    INTEGER NOT NULL,
  state      TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
```

One row, `id = 'shared'`.

`document.ts` holds the logic and is tested with plain Vitest against a stub D1
binding — no additional test framework.

## 9. Security

- The access code is **generated**, 32 characters, not user-chosen. The endpoint is
  publicly reachable and this single code unlocks everything, so a memorable
  passphrase would be the weak point.
- It lives as a Worker secret (`wrangler secret put`), never in the repository and
  never in the built bundle. On each phone it is entered once and kept in
  `localStorage`.
- The Worker compares it in constant time, allows CORS only for
  `https://nadja-lld.github.io`, and rejects bodies over 1 MB.
- Data is stored unencrypted in D1. End-to-end encryption was considered and
  explicitly declined for this iteration.

## 10. UI

| File | Change |
|------|--------|
| `src/ui/Onboarding.tsx` *(new)* | enter code, pick identity; blocks the app until both are set |
| `src/ui/AddTaskBar.tsx` | "for me / for \<name\>" toggle |
| `src/ui/ListSwitcher.tsx` | shows only the current person's lists |
| `src/ui/TaskRow.tsx` | "new from \<name\>" marker until `seenAt` is set |
| `src/ui/TaskDetailSheet.tsx` | sets `seenAt` when opened by the owner |
| `src/ui/SettingsSheet.tsx` | edit both names, sync status, reset access code |
| `src/ui/App.tsx` | sync status in the header |
| `src/ui/useSync.ts` *(new)* | sync loop, triggers, retries |
| `src/sync/syncClient.ts` *(new)* | the two HTTP calls, no UI concerns |

Identity and access code are per-device settings stored under their own
`localStorage` keys (`todo.identity`, `todo.accessCode`), never inside the synced
document.

Dependency direction stays `ui -> sync -> domain` and `ui -> storage -> domain`.
All new strings go through `t()` and are added to `de.ts` and `en.ts` together.

## 11. Deployment

- The existing Pages workflow is unchanged apart from a new build-time variable
  `VITE_SYNC_URL` holding the Worker address.
- A new `.github/workflows/deploy-worker.yml` runs `wrangler deploy` on pushes that
  touch `server/`, using a Cloudflare API token from repository secrets.
- Pushing workflow files requires a GitHub token with `workflow` scope; this must be
  in place before the branch is pushed.
- The PWA manifest description in `vite.config.ts` still says "Daten nur auf dem
  Gerät" and must be corrected, as must the matching claim in `README.md`.

## 12. Tests

Written in this order, test first:

1. `tests/domain/merge.test.ts` – case table: concurrent edits of one task, delete
   versus complete, a device two weeks offline, tombstone purging, tie-break by id
2. `tests/storage/localStorage.test.ts` – v1 to v2 migration over a realistic v1 document
3. `tests/domain/state.test.ts` – extended for `updatedAt` stamping and tombstones
4. `tests/server/document.test.ts` – version mismatch yields a conflict. The test lives
   under `tests/` because `vite.config.ts` includes only `tests/**`; it imports from
   `server/src/document.ts`
5. `tests/sync/syncClient.test.ts` – 409 triggers re-merge and retry; network error retries
6. `tests/ui/` – onboarding, assigning to the other person, the new-task marker

## 13. Out of scope

Deliberately excluded, each addable later without reworking the above: push
notifications, more than two people, end-to-end encryption, live updates over
WebSocket, viewing the other person's lists.
