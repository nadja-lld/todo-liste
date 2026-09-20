# todo-liste — AI Coding Instructions

## Project Overview

To-do PWA for iPhone, built for exactly two people. Each person sees only their own
lists and can put a task on the other's. Offline-first: `localStorage` is what the UI
renders from, and a Cloudflare Worker holds one shared document that both devices
reconcile against. Without `VITE_SYNC_URL` the app runs device-only, as it originally did.

Deployed to GitHub Pages from `main`; the worker deploys separately from `server/`.

**Live:** https://nadja-lld.github.io/todo-liste/
**Repo:** https://github.com/nadja-lld/todo-liste
**Specs:** `docs/superpowers/specs/2026-09-14-todo-pwa-design.md` (original),
`docs/superpowers/specs/2026-09-20-two-user-sync-design.md` (two users)
**Sync setup:** `docs/SETUP-SYNC.md`

## Tech Stack

| Layer   | Technology                                     |
| ------- | ---------------------------------------------- |
| UI      | Preact 10, TypeScript 5, Vite 7                |
| PWA     | vite-plugin-pwa (prompt update strategy)       |
| Storage | localStorage, one JSON document (`todo.state`) |
| Sync    | Cloudflare Worker + D1, shared bearer token    |
| Tests   | Vitest, jsdom, @testing-library/preact         |
| Lint    | ESLint (typescript-eslint), Prettier           |
| Hosting | GitHub Pages via GitHub Actions                |

## Project Structure

```
src/domain/    pure TS, no browser APIs: types, dates, recurrence, sorting, state
               reducers, selectors, merge, schema migration, export/import
src/storage/   loadState/saveState around localStorage, corrupt-data backup,
               device-local settings (identity, access code)
src/sync/      HTTP client and one fetch-merge-push cycle; no timers, no UI
src/i18n/      de (default), en (fallback), t()
src/ui/        Preact components, useAppState and useSync hooks, styles.css
server/        the Cloudflare Worker: routing and the versioned document
tests/         mirrors src/ and server/
```

Dependency direction: `ui -> sync -> domain`, `ui -> storage -> domain`, `ui -> domain`.
Never import browser globals in `domain`. Keep scheduling out of `sync/` — timers and
event listeners belong in `useSync`, which is what keeps the conflict path testable.

## Code Conventions

- All state changes are pure functions in `src/domain/state.ts`: `(state, ..., now) => AppState`.
  Every reducer stamps `updatedAt`; without it the change loses the next merge.
- Deletions are tombstones (`deletedAt`), never removals. Read through the selectors in
  `src/domain/selectors.ts` (`liveLists`, `tasksOf`, …) so tombstones stay out of the UI.
- A task belongs to whoever owns its list. There is no owner field on `Task`.
  Handing one over means moving it to the other person's inbox; that is what the
  "assignee" field in `TaskDetailSheet` does. New tasks are always the creator's.
- Components receive state and callbacks as props; only `App.tsx` owns state via `useAppState`.
- Every visible string goes through `t("key")`. Add keys to `de.ts` and `en.ts` together.
- Dates: `dueDate` is `YYYY-MM-DD`; use helpers in `src/domain/dates.ts`, never `new Date(dueDate)` directly.
- Tests: domain tests in Node; UI tests start with `// @vitest-environment jsdom`.
- Commits: English imperative, why not what, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Common Tasks

### Add a task field

1. Extend `Task` in `src/domain/types.ts` and the validator in `src/domain/schema.ts` (with test).
2. Add reducer changes in `src/domain/state.ts` (with test).
3. Show/edit it in `src/ui/TaskDetailSheet.tsx`, add i18n keys.

### Add a person

Don't. The model is fixed at two (`USER_IDS`), and the delegation UI, the onboarding
choice and the inbox lookup all assume it. A third person is a redesign, not a field.

### Change storage shape

`src/domain/migrate.ts` is the migration seam. `migrate` runs ahead of `parseAppState`
in both `loadState` and `parseImport`, and returns anything it does not recognise
untouched so it is still quarantined as corrupt. To change the shape: add a step to
`migrate` that upgrades the previous version, add a test over a realistic old document
in `tests/domain/migrate.test.ts`, then bump `SCHEMA_VERSION` in `types.ts`.

## Deployment

Push to `main` runs `.github/workflows/deploy.yml`: build with `base=/todo-liste/` and
`VITE_SYNC_URL` from the repository variable `SYNC_URL`, upload `dist/`, deploy to Pages.
Changes under `server/` additionally run `deploy-worker.yml`, which deploys the worker.
CI (`ci.yml`) runs lint and tests on every push and PR.

`ACCESS_CODE` is a Worker secret and must never appear in the repository or the bundle.
