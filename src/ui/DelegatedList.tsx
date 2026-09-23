import { formatDueDate } from "../domain/dates";
import { splitDelegated } from "../domain/sorting";
import type { Task } from "../domain/types";
import { t } from "../i18n";

interface Props {
  tasks: Task[];
  today: string;
  /** Name of the person the tasks were handed to. */
  assigneeName: string;
  showCompleted: boolean;
  onShowCompletedChange: (open: boolean) => void;
  onOpen: (taskId: string) => void;
}

interface RowProps {
  task: Task;
  today: string;
  assigneeName: string;
  onOpen: (taskId: string) => void;
}

function Row({ task, today, assigneeName, onOpen }: RowProps) {
  const isDone = task.completedAt !== undefined;
  return (
    <li class={`task-row ${isDone ? "task-row--done" : ""}`}>
      <span class={`priority-dot priority-dot--${task.priority}`} aria-hidden="true" />
      {/* No checkbox: finishing it is the other person's call. Opening it is
          not, because the wording or the date may still need fixing. */}
      <button type="button" class="task-body" onClick={() => onOpen(task.id)}>
        <span class="task-title">{task.title}</span>
        <span class="task-meta">
          <span class={`delegated-state delegated-state--${isDone ? "done" : "open"}`}>
            {isDone ? t("delegatedDone") : t("delegatedOpen")}
          </span>
          <span class="task-list-name">{assigneeName}</span>
          {task.dueDate && (
            <span class="due">
              {formatDueDate(task.dueDate, today, { today: t("today"), tomorrow: t("tomorrow") })}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * Read-only: these tasks belong to the other person now. Showing them here
 * closes the loop after handing one over without exposing their whole list.
 */
export function DelegatedList(props: Props) {
  const { open, later, done } = splitDelegated(props.tasks, props.today);

  return (
    <section class="task-list">
      {open.length === 0 ? (
        <p class="empty">{t("emptyDelegated")}</p>
      ) : (
        <ul>
          {open.map((task) => (
            <Row
              key={task.id}
              task={task}
              today={props.today}
              assigneeName={props.assigneeName}
              onOpen={props.onOpen}
            />
          ))}
        </ul>
      )}
      {later.length > 0 && (
        <details class="later">
          <summary>{t("laterSection", { count: later.length })}</summary>
          <ul>
            {later.map((task) => (
              <Row
                key={task.id}
                task={task}
                today={props.today}
                assigneeName={props.assigneeName}
                onOpen={props.onOpen}
              />
            ))}
          </ul>
        </details>
      )}
      {done.length > 0 && (
        <details
          class="completed"
          open={props.showCompleted}
          onToggle={(event) =>
            props.onShowCompletedChange((event.currentTarget as HTMLDetailsElement).open)
          }
        >
          <summary>{t("completedSection", { count: done.length })}</summary>
          <ul>
            {done.map((task) => (
              <Row
                key={task.id}
                task={task}
                today={props.today}
                assigneeName={props.assigneeName}
                onOpen={props.onOpen}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
