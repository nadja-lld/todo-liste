import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { addDays, dueBucket, todayIso } from "../domain/dates";
import { inboxListId, listsOf, otherUser, tasksOf, userName } from "../domain/selectors";
import { addTask, deleteTask, markTaskSeen, toggleTask, updateTask } from "../domain/state";
import type { Task, UserId } from "../domain/types";
import { t } from "../i18n";
import {
  loadDeviceSettings,
  saveAccessCode,
  saveIdentity,
  syncBaseUrl,
} from "../storage/deviceSettings";
import { resolveStorage } from "../storage/resolveStorage";
import { syncStatusKey } from "../sync/status";
import { AddTaskBar } from "./AddTaskBar";
import { ListSwitcher, type ViewId } from "./ListSwitcher";
import { Onboarding } from "./Onboarding";
import { SettingsSheet } from "./SettingsSheet";
import { TaskDetailSheet } from "./TaskDetailSheet";
import { TaskList } from "./TaskList";
import { useAppState } from "./useAppState";
import { useSync } from "./useSync";

function isOverviewView(view: ViewId): boolean {
  return view === "today" || view === "tomorrow";
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
  const other = otherUser(identity);
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
  const today = todayIso(now());
  const tomorrow = addDays(today, 1);

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
        names={{ a: userName(app.state, "a"), b: userName(app.state, "b") }}
        onDone={completeOnboarding}
      />
    );
  }

  const ownTasks = tasksOf(app.state, identity);
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
  const selectedTask = ownTasks.find((task) => task.id === selectedTaskId) ?? null;

  const newFromName = (task: Task): string | undefined =>
    task.createdBy !== identity && task.seenAt === undefined
      ? userName(app.state, task.createdBy)
      : undefined;

  const openTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    app.update((state) => markTaskSeen(state, taskId, now()));
  };

  return (
    <div class="app">
      <header class="app-header">
        <h1>{t("appTitle")}</h1>
        {sync.status !== "disabled" && (
          <span class={`sync-status sync-status--${sync.status}`} aria-live="polite">
            {t(syncStatusKey(sync.status))}
          </span>
        )}
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
      {sync.status === "auth-error" && <p class="banner banner--error">{t("syncAuthFailed")}</p>}

      <ListSwitcher lists={lists} view={view} onSelect={setView} />

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

      <AddTaskBar
        canAddForSelf={activeListId !== null}
        identity={identity}
        otherId={other}
        otherName={userName(app.state, other)}
        onAdd={(title, assignTo) =>
          app.update((state) => {
            // My own tasks go into the list I am looking at; a delegated task
            // goes to the other person's inbox, because I do not see their lists.
            const listId = assignTo === identity ? activeListId : inboxListId(state, assignTo);
            if (listId === null) return state;
            return addTask(state, { listId, title, createdBy: identity }, now());
          })
        }
      />

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          lists={lists}
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
          storage={effectiveStorage}
          syncStatus={sync.status}
          now={now}
          today={today}
          onUpdate={app.update}
          onReplace={(next) => {
            app.replace(next);
            setView(listsOf(next, identity)[0]?.id ?? "today");
            setSelectedTaskId(null);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
