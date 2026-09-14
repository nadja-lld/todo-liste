import { dueBucket, formatDueDate } from "../domain/dates";
import type { Task } from "../domain/types";
import { t } from "../i18n";

interface Props {
  task: Task;
  today: string;
  listName?: string;
  onToggle: (taskId: string) => void;
  onOpen: (taskId: string) => void;
}

export function TaskRow({ task, today, listName, onToggle, onOpen }: Props) {
  const done = task.completedAt !== undefined;
  const bucket = dueBucket(task.dueDate, today);
  return (
    <li class={`task-row ${done ? "task-row--done" : ""}`}>
      <button
        type="button"
        class={`check ${done ? "check--done" : ""}`}
        aria-label={`${done ? t("markOpen") : t("markDone")}: ${task.title}`}
        onClick={() => onToggle(task.id)}
      />
      <span class={`priority-dot priority-dot--${task.priority}`} aria-hidden="true" />
      <button type="button" class="task-body" onClick={() => onOpen(task.id)}>
        <span class="task-title">{task.title}</span>
        <span class="task-meta">
          {task.dueDate && (
            <span class={`due due--${bucket}`}>
              {formatDueDate(task.dueDate, today, { today: t("today"), tomorrow: t("tomorrow") })}
            </span>
          )}
          {listName && <span class="task-list-name">{listName}</span>}
        </span>
      </button>
    </li>
  );
}
