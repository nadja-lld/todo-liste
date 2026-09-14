# todo-liste — AI Coding Instructions

## Project Overview

Personal, device-only to-do PWA for iPhone. No backend. State lives in `localStorage`.
Deployed to GitHub Pages from `main`.

**Live:** https://nadja-lld.github.io/todo-liste/
**Repo:** https://github.com/nadja-lld/todo-liste
**Spec:** `docs/superpowers/specs/2026-09-14-todo-pwa-design.md`

## Tech Stack

| Layer   | Technology                                     |
| ------- | ---------------------------------------------- |
| UI      | Preact 10, TypeScript 5, Vite 7                |
| PWA     | vite-plugin-pwa (prompt update strategy)       |
| Storage | localStorage, one JSON document (`todo.state`) |
| Tests   | Vitest, jsdom, @testing-library/preact         |
| Lint    | ESLint (typescript-eslint), Prettier           |
| Hosting | GitHub Pages via GitHub Actions                |

## Project Structure

```
src/domain/    pure TS, no browser APIs: types, dates, recurrence, sorting, state reducers, export/import
src/storage/   loadState/saveState around localStorage, corrupt-data backup
src/i18n/      de (default), en (fallback), t()
src/ui/        Preact components, useAppState hook, styles.css
tests/         mirrors src/
```

Dependency direction: `ui -> storage -> domain`, `ui -> domain`. Never import browser globals in `domain`.

## Code Conventions

- All state changes are pure functions in `src/domain/state.ts`: `(state, ...args) => AppState`.
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

### Change storage shape

There is no migration seam yet: `parseAppState` rejects any `schemaVersion` other than
the current one, so bumping `SCHEMA_VERSION` without more work quarantines every
existing user's data as corrupt on next load. Before bumping it, first add a migration
step in `src/storage/localStorage.ts` that upgrades older stored documents to the new
shape, with a test covering the migration, then bump `SCHEMA_VERSION` in `types.ts`.

## Deployment

Push to `main` runs `.github/workflows/deploy.yml`: build with `base=/todo-liste/`, upload `dist/`, deploy to Pages. CI (`ci.yml`) runs lint and tests on every push and PR.
