import { useEffect, useState } from "preact/hooks";
import { dueBucket, todayIso } from "../domain/dates";
import { addTask, deleteTask, sortedLists, toggleTask, updateTask } from "../domain/state";
import { t } from "../i18n";
import { AddTaskBar } from "./AddTaskBar";
import { ListSwitcher, type ViewId } from "./ListSwitcher";
import { SettingsSheet } from "./SettingsSheet";
import { TaskDetailSheet } from "./TaskDetailSheet";
import { TaskList } from "./TaskList";
import { useAppState } from "./useAppState";

export interface AppProps {
  storage?: Storage;
  now?: () => Date;
}

export function App({ storage = window.localStorage, now = () => new Date() }: AppProps) {
  const app = useAppState(storage, now);
  const lists = sortedLists(app.state);
  const [view, setView] = useState<ViewId>(lists[0]?.id ?? "today");
  useEffect(() => {
    if (view !== "today" && !lists.some((list) => list.id === view)) {
      setView(lists[0]?.id ?? "today");
    }
  }, [view, lists]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const today = todayIso(now());

  const activeListId = view !== "today" && lists.some((l) => l.id === view) ? view : null;
  const visibleTasks =
    view === "today"
      ? app.state.tasks.filter((task) => {
          const bucket = dueBucket(task.dueDate, today);
          return bucket === "today" || bucket === "overdue";
        })
      : app.state.tasks.filter((task) => task.listId === activeListId);
  const selectedTask = app.state.tasks.find((task) => task.id === selectedTaskId) ?? null;

  return (
    <div class="app">
      <header class="app-header">
        <h1>{t("appTitle")}</h1>
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
      {app.saveFailed && <p class="banner banner--error">{t("saveFailed")}</p>}

      <ListSwitcher lists={lists} view={view} onSelect={setView} />

      <TaskList
        tasks={visibleTasks}
        lists={lists}
        today={today}
        showListName={view === "today"}
        emptyMessage={view === "today" ? t("emptyToday") : t("emptyList")}
        showCompleted={showCompleted}
        onToggleShowCompleted={() => setShowCompleted((value) => !value)}
        onToggle={(taskId) => app.update((state) => toggleTask(state, taskId, now()))}
        onOpen={setSelectedTaskId}
      />

      <AddTaskBar
        disabled={activeListId === null}
        onAdd={(title) =>
          activeListId &&
          app.update((state) => addTask(state, { listId: activeListId, title }, now()))
        }
      />

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          lists={lists}
          onPatch={(taskId, patch) => app.update((state) => updateTask(state, taskId, patch))}
          onDelete={(taskId) => app.update((state) => deleteTask(state, taskId))}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
      {settingsOpen && (
        <SettingsSheet
          state={app.state}
          today={today}
          onUpdate={app.update}
          onReplace={(next) => {
            app.replace(next);
            setView(sortedLists(next)[0]?.id ?? "today");
            setSelectedTaskId(null);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
