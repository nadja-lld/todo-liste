# To-Do PWA – Design Spec

Date: 2026-09-14
Status: approved by Nadja (brainstorming session)

## 1. Goal

A personal to-do tool that runs on an iPhone as an installable Progressive Web App (PWA).
Data lives only on the device (browser storage). No backend, no login, no sync.
Hosted for free on GitHub Pages; updates ship via `git push`.

## 2. Decisions taken

| Topic          | Decision                                              |
|----------------|-------------------------------------------------------|
| Storage        | Device-only, `localStorage`, one JSON document        |
| Hosting        | GitHub Pages, deployed by GitHub Actions              |
| Stack          | Vite + TypeScript + Preact, `vite-plugin-pwa`, Vitest |
| Features (v1)  | Multiple lists, due date, priority, recurring tasks   |
| Backup         | Manual JSON export/import                             |
| Notifications  | None (iOS PWAs need a push server; out of scope)      |
| Design         | Neutral, iOS-like, system font, dark mode, one accent |
| UI language    | German default via small i18n file, English fallback  |

## 3. Architecture

Single-page app, three layers with strict dependency direction `ui -> storage -> domain`
and `ui -> domain`. Nothing in `domain` imports from the browser.

```
src/
  domain/      pure TypeScript: types, recurrence, sorting, date formatting, schema validation
  storage/     load/save AppState to localStorage, schema version, corrupt-data safeguard
  ui/          Preact components; call domain functions, hold no business logic
  i18n/        de.ts (default), en.ts (fallback), t() helper
  main.tsx     bootstrap
```

Build: Vite with `base` set to the repository name. `vite-plugin-pwa` generates manifest
and service worker (prompt update strategy: the service worker waits and the app offers
"Aktualisieren"). The app shows a small "Aktualisieren" prompt when a new version is
available.

## 4. Data model

```ts
type Priority = "high" | "medium" | "low";
type Recurrence = "none" | "daily" | "weekly" | "monthly";

interface TodoList {
  id: string;
  name: string;
  position: number;
}

interface Task {
  id: string;
  listId: string;
  title: string;
  note?: string;
  priority: Priority;
  dueDate?: string;      // ISO calendar date "YYYY-MM-DD"; displayed as DD.MM.YYYY
  recurrence: Recurrence;
  completedAt?: string;  // ISO 8601 timestamp
  createdAt: string;     // ISO 8601 timestamp
}

interface AppState {
  schemaVersion: 1;
  lists: TodoList[];
  tasks: Task[];
}
```

IDs are generated with `crypto.randomUUID()`. A fresh install starts with one list
named "Aufgaben".

### Recurrence rules

- Completing a task with `recurrence !== "none"` marks it completed and creates a new
  open task with the same title, note, list, priority and recurrence.
- The next `dueDate` is computed from the previous `dueDate`, not from the completion day.
  If the task has no `dueDate`, today is used as the base.
- `daily`: +1 day. `weekly`: +7 days. `monthly`: +1 month, day clamped to the last day of
  the target month (31 Jan -> 28/29 Feb).
- Completed tasks stay visible in a collapsed "Erledigt" section and can be deleted
  individually or all at once.

### Sorting (open tasks within a list)

1. Due bucket: overdue, today, future, no date.
2. Within the same bucket: by `dueDate` ascending, then priority high > medium > low,
   then `createdAt` ascending.

## 5. UI

### Screens

- **List view** (main screen)
  - Top: segmented control to switch between lists plus a "Heute" entry that aggregates
    tasks due today or overdue across all lists.
  - Body: open tasks sorted as above, then collapsed "Erledigt" section.
  - Bottom: text input + "Hinzufügen" button; adding a task is one step. Priority defaults
    to `medium`, no due date, `recurrence: "none"`.
- **Task detail** (bottom sheet): title, note, list, priority, due date, recurrence, delete.
- **Settings** (gear icon): manage lists (create, rename, reorder, delete with confirmation
  if the list has tasks), export JSON, import JSON, clear completed tasks.

### Interaction

- Tap the circle: toggle completion. Tap the text: open detail sheet.
- No swipe gestures in v1 (conflict with Safari back-swipe).
- No drag-and-drop for tasks in v1. Lists are reordered in settings with up/down controls.

### Visual markers

- Overdue: red date label. Due today: accent-colored date label.
- Priority: small colored dot on the left (high red, medium accent, low grey).
- Date labels: "Heute", "Morgen", otherwise DD.MM.YYYY.

### Design

- System font stack (`-apple-system, system-ui, ...`), iOS-like spacing on an 8px grid.
- Dark mode follows `prefers-color-scheme`.
- One accent color (muted blue, configurable in one CSS variable).
- Accessibility: 4.5:1 contrast, visible focus styles, `aria-label`s on icon buttons,
  minimum tap target 44x44px.
- All visible strings via `t()` from the i18n module. German is default, English fallback.

## 6. Export / import

- Export: serialize `AppState` to pretty JSON, file name `todos-YYYY-MM-DD.json`, offered
  via Web Share API when available (iOS share sheet), otherwise as download.
- Import: file picker, parse, validate against schema, show preview
  "X Listen, Y Aufgaben ersetzen?", replace state only after confirmation.

## 7. Error handling

- On load, stored JSON is validated. If invalid, it is copied to a backup key
  (`todo.state.backup.<timestamp>`), the app starts with an empty state and shows a notice.
  The invalid data is never overwritten silently.
- Every change is saved immediately. If saving throws (e.g. private mode, quota), a
  persistent warning banner is shown.
- Import rejects invalid files with a clear message and leaves the current state untouched.
- Deleting a list that contains tasks requires confirmation; its tasks are deleted with it.

## 8. Testing

- Vitest for the whole `domain` layer: recurrence (incl. month-end and leap year), sorting,
  schema validation, date formatting.
- `storage` tested with a `localStorage` stub, including the corrupt-data path.
- UI: a few component tests with `@testing-library/preact` for core paths: add task,
  complete task, completing a recurring task creates the follow-up.
- No end-to-end tests in v1.
- Test naming: `test_<what>_<expectation>` style adapted to Vitest
  (`it("completes recurring task and creates next instance")`).

## 9. Tooling and deployment

- Node LTS, npm. ESLint (typescript-eslint) and Prettier.
- Makefile targets: `install`, `run`, `test`, `lint`, `format`, `check`.
- Mandatory project files: README.md, CLAUDE.md, CONTRIBUTING.md, SECURITY.md, LICENSE,
  .gitignore.
- GitHub Actions:
  - `ci.yml`: lint + test on every push and PR.
  - `deploy.yml`: build and deploy to GitHub Pages on push to `main`.
- Installation on iPhone: open the Pages URL in Safari, Share -> "Zum Home-Bildschirm".

## 10. Out of scope for v1

Notifications, sync between devices, sharing lists, subtasks, tags, swipe gestures,
drag-and-drop task ordering, cloud backup.
