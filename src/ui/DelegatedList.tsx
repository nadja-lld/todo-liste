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
}

function Row({ task, today, assigneeName }: { task: Task; today: string; assigneeName: string }) {
  const isDone = task.completedAt !== undefined;
  return (
    <li class={`task-row ${isDone ? "task-row--done" : ""}`}>
      <span class={`priority-dot priority-dot--${task.priority}`} aria-hidden="true" />
      <div class="task-body task-body--static">
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
      </div>
    </li>
  );
}

/**
 * Read-only: these tasks belong to the other person now. Showing them here
 * closes the loop after handing one over without exposing their whole list.
 */
export function DelegatedList(props: Props) {
  const { open, done } = splitDelegated(props.tasks, props.today);

  return (
    <section class="task-list">
      {open.length === 0 ? (
        <p class="empty">{t("emptyDelegated")}</p>
      ) : (
        <ul>
          {open.map((task) => (
            <Row key={task.id} task={task} today={props.today} assigneeName={props.assigneeName} />
          ))}
        </ul>
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
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
