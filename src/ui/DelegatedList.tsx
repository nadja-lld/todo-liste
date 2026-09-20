import { formatDueDate } from "../domain/dates";
import type { Task } from "../domain/types";
import { t } from "../i18n";

interface Props {
  tasks: Task[];
  today: string;
  /** Name of the person the tasks were handed to. */
  assigneeName: string;
}

/**
 * Read-only: these tasks belong to the other person now. Showing them here
 * closes the loop after handing one over without exposing their whole list.
 */
export function DelegatedList({ tasks, today, assigneeName }: Props) {
  if (tasks.length === 0) {
    return (
      <section class="task-list">
        <p class="empty">{t("emptyDelegated")}</p>
      </section>
    );
  }

  const open = tasks.filter((task) => task.completedAt === undefined);
  const done = tasks.filter((task) => task.completedAt !== undefined);

  return (
    <section class="task-list">
      <ul>
        {[...open, ...done].map((task) => {
          const isDone = task.completedAt !== undefined;
          return (
            <li key={task.id} class={`task-row ${isDone ? "task-row--done" : ""}`}>
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
                      {formatDueDate(task.dueDate, today, {
                        today: t("today"),
                        tomorrow: t("tomorrow"),
                      })}
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
