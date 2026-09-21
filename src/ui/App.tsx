import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { addDays, dueBucket } from "../domain/dates";
import {
  delegatedBy,
  inboxListId,
  listsOf,
  otherUser,
  ownerOfTask,
  tasksOf,
} from "../domain/selectors";
import { addTask, deleteTask, markTaskSeen, toggleTask, updateTask } from "../domain/state";
import type { Task, UserId } from "../domain/types";
import { t } from "../i18n";
import {
  clearDeviceSettings,
  loadDeviceSettings,
  saveAccessCode,
  saveIdentity,
  syncBaseUrl,
} from "../storage/deviceSettings";
import { resolveStorage } from "../storage/resolveStorage";
import { needsAttention, syncStatusKey } from "../sync/status";
import { AddTaskBar } from "./AddTaskBar";
import { DelegatedList } from "./DelegatedList";
import { ListSwitcher, type ViewId } from "./ListSwitcher";
import { Onboarding } from "./Onboarding";
import { SettingsSheet } from "./SettingsSheet";
import { TaskDetailSheet } from "./TaskDetailSheet";
import { TaskList } from "./TaskList";
import { userName, userNames } from "./userNames";
import { useAppState } from "./useAppState";
import { useSync } from "./useSync";
import { useToday } from "./useToday";

function isOverviewView(view: ViewId): boolean {
  return view === "today" || view === "tomorrow" || view === "delegated";
}

function emptyMessage(view: ViewId): string {
  if (view === "today") return t("emptyToday");
  if (view === "tomorrow") return t("emptyTomorrow");
  return t("emptyList");
}

export interface AppProps {
  storage?: Storage;
  now?: () => Date;
}

export function App({ storage, now = () => new Date() }: AppProps) {
  const resolved = useRef<ReturnType<typeof resolveStorage> | null>(null);
  if (resolved.current === null) {
    resolved.current = storage ? { storage, available: true } : resolveStorage();
  }
  const effectiveStorage = storage ?? resolved.current.storage;
  const storageAvailable = resolved.current.available;

  const syncUrl = syncBaseUrl();
  const [device, setDevice] = useState(() => loadDeviceSettings(effectiveStorage));
  // Without a sync endpoint there is only ever one person, so no one is asked.
  const identity: UserId = device.identity ?? "a";

  const app = useAppState(effectiveStorage, now);
  const sync = useSync({
    state: app.state,
    replace: app.replace,
    storage: effectiveStorage,
    now,
  });
  const lists = listsOf(app.state, identity);
  const [view, setView] = useState<ViewId>(() => listsOf(app.state, identity)[0]?.id ?? "today");
  useEffect(() => {
    if (!isOverviewView(view) && !lists.some((list) => list.id === view)) {
      setView(lists[0]?.id ?? "today");
    }
  }, [view, lists]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showDelegatedCompleted, setShowDelegatedCompleted] = useState(false);
  const today = useToday(now);
  const tomorrow = addDays(today, 1);

  const codeRejected = sync.status === "auth-error";
  useEffect(() => {
    if (!codeRejected) return;
    clearDeviceSettings(effectiveStorage);
    setDevice(loadDeviceSettings(effectiveStorage));
  }, [codeRejected, effectiveStorage]);

  const completeOnboarding = useCallback(
    (chosen: UserId, accessCode: string) => {
      saveIdentity(effectiveStorage, chosen);
      saveAccessCode(effectiveStorage, accessCode);
      setDevice(loadDeviceSettings(effectiveStorage));
    },
    [effectiveStorage],
  );

  if (syncUrl !== null && device.identity === null) {
    return (
      <Onboarding
        names={userNames()}
        notice={codeRejected ? t("syncAuthFailed") : undefined}
        onDone={completeOnboarding}
      />
    );
  }

  const ownTasks = tasksOf(app.state, identity);
  const other = otherUser(identity);
  const activeListId = !isOverviewView(view) && lists.some((l) => l.id === view) ? view : null;
  const visibleTasks =
    view === "today"
      ? ownTasks.filter((task) => {
          const bucket = dueBucket(task.dueDate, today);
          return bucket === "today" || bucket === "overdue";
        })
      : view === "tomorrow"
        ? ownTasks.filter((task) => task.dueDate === tomorrow)
        : ownTasks.filter((task) => task.listId === activeListId);
  const delegated = delegatedBy(app.state, identity);
  // Tasks I handed over are editable too, so the sheet may show one of those.
  const selectedTask =
    ownTasks.find((task) => task.id === selectedTaskId) ??
    delegated.find((task) => task.id === selectedTaskId) ??
    null;
  const selectedOwner = selectedTask
    ? (ownerOfTask(app.state, selectedTask) ?? identity)
    : identity;

  const newFromName = (task: Task): string | undefined =>
    task.createdBy !== identity && task.seenAt === undefined ? userName(task.createdBy) : undefined;

  const openTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    app.update((state) => {
      const task = state.tasks.find((candidate) => candidate.id === taskId);
      // Only the owner looking at it clears the marker. Opening a task I handed
      // over must not rob the other person of their "new from" badge.
      if (!task || ownerOfTask(state, task) !== identity) return state;
      return markTaskSeen(state, taskId, now());
    });
  };

  return (
    <div class="app">
      <header class="app-header">
        <h1>{t("appTitle")}</h1>
        {/* Silence means everything is fine: announcing each routine success
            made the header flicker on every edit and every poll. */}
        <span class="sync-status" aria-live="polite">
          {needsAttention(sync.status) && (
            <span class={`sync-status__problem sync-status--${sync.status}`}>
              {t(syncStatusKey(sync.status))}
            </span>
          )}
        </span>
        <button
          type="button"
          class="icon-button"
          aria-label={t("openSettings")}
          onClick={() => setSettingsOpen(true)}
        >
          ⚙︎
        </button>
      </header>

      {app.recoveredFromCorrupt && (
        <p class="banner banner--warning">{t("recoveredFromCorrupt")}</p>
      )}
      {(app.saveFailed || !storageAvailable) && (
        <p class="banner banner--error">{t("saveFailed")}</p>
      )}

      <ListSwitcher lists={lists} view={view} onSelect={setView} />

      {view === "delegated" ? (
        <DelegatedList
          tasks={delegated}
          today={today}
          assigneeName={userName(other)}
          showCompleted={showDelegatedCompleted}
          onShowCompletedChange={setShowDelegatedCompleted}
          onOpen={openTask}
        />
      ) : (
        <TaskList
          tasks={visibleTasks}
          lists={lists}
          today={today}
          showListName={isOverviewView(view)}
          emptyMessage={emptyMessage(view)}
          showCompleted={showCompleted}
          onShowCompletedChange={setShowCompleted}
          newFromName={newFromName}
          onToggle={(taskId) => app.update((state) => toggleTask(state, taskId, now()))}
          onOpen={openTask}
        />
      )}

      <AddTaskBar
        disabled={lists.length === 0 || view === "delegated"}
        onAdd={(title) =>
          app.update((state) => {
            // A new task is always mine. The dated overviews have no list of
            // their own, so it lands in my inbox and carries the day it was
            // created for — otherwise it would vanish the moment it is added.
            const listId = activeListId ?? inboxListId(state, identity);
            if (listId === null) return state;
            const dueDate = view === "today" ? today : view === "tomorrow" ? tomorrow : undefined;
            return addTask(state, { listId, title, createdBy: identity, dueDate }, now());
          })
        }
      />

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          lists={lists}
          userNames={userNames()}
          assignedTo={selectedOwner}
          onAssign={(taskId, userId) => {
            if (userId === selectedOwner) return;
            // Moving a task between people means moving it to that person's
            // inbox, the only list of theirs this device can address. Either
            // way it leaves the view it was opened from, so the sheet closes.
            app.update((state) => {
              const target = inboxListId(state, userId);
              return target === null ? state : updateTask(state, taskId, { listId: target }, now());
            });
            setSelectedTaskId(null);
          }}
          onPatch={(taskId, patch) =>
            app.update((state) => updateTask(state, taskId, patch, now()))
          }
          onDelete={(taskId) => app.update((state) => deleteTask(state, taskId, now()))}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
      {settingsOpen && (
        <SettingsSheet
          state={app.state}
          identity={identity}
          now={now}
          onUpdate={app.update}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
