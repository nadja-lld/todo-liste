import { useState } from "preact/hooks";
import type { TaskPatch } from "../domain/state";
import {
  PRIORITIES,
  RECURRENCES,
  type Priority,
  type Recurrence,
  type Task,
  type TodoList,
} from "../domain/types";
import { t, type MessageKey } from "../i18n";
import { Sheet } from "./Sheet";

interface Props {
  task: Task;
  lists: TodoList[];
  onPatch: (taskId: string, patch: TaskPatch) => void;
  onDelete: (taskId: string) => void;
  onClose: () => void;
  confirm?: (message: string) => boolean;
}

const PRIORITY_KEYS: Record<Priority, MessageKey> = {
  high: "priorityHigh",
  medium: "priorityMedium",
  low: "priorityLow",
};
const RECURRENCE_KEYS: Record<Recurrence, MessageKey> = {
  none: "recurrenceNone",
  daily: "recurrenceDaily",
  weekly: "recurrenceWeekly",
  monthly: "recurrenceMonthly",
};

export function TaskDetailSheet({
  task,
  lists,
  onPatch,
  onDelete,
  onClose,
  confirm = (message) => window.confirm(message),
}: Props) {
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");

  const commitTitle = () => {
    if (title.trim() !== "" && title !== task.title) onPatch(task.id, { title });
  };
  const commitNote = () => {
    const trimmed = note.trim();
    if (trimmed !== (task.note ?? ""))
      onPatch(task.id, { note: trimmed === "" ? undefined : trimmed });
  };

  return (
    <Sheet title={t("taskDetail")} onClose={onClose}>
      <label class="field">
        <span>{t("title")}</span>
        <input
          type="text"
          value={title}
          onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
          onBlur={commitTitle}
        />
      </label>

      <label class="field">
        <span>{t("note")}</span>
        <textarea
          rows={3}
          value={note}
          onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
          onBlur={commitNote}
        />
      </label>

      <label class="field">
        <span>{t("list")}</span>
        <select
          value={task.listId}
          onChange={(e) => onPatch(task.id, { listId: (e.target as HTMLSelectElement).value })}
        >
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
      </label>

      <label class="field">
        <span>{t("priority")}</span>
        <select
          value={task.priority}
          onChange={(e) =>
            onPatch(task.id, { priority: (e.target as HTMLSelectElement).value as Priority })
          }
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {t(PRIORITY_KEYS[priority])}
            </option>
          ))}
        </select>
      </label>

      <div class="field field--row">
        <label class="field">
          <span>{t("dueDate")}</span>
          <input
            type="date"
            value={task.dueDate ?? ""}
            onChange={(e) => {
              const value = (e.target as HTMLInputElement).value;
              onPatch(task.id, { dueDate: value === "" ? undefined : value });
            }}
          />
        </label>
        {task.dueDate && (
          <button
            type="button"
            class="text-button"
            onClick={() => onPatch(task.id, { dueDate: undefined })}
          >
            {t("clearDueDate")}
          </button>
        )}
      </div>

      <label class="field">
        <span>{t("recurrence")}</span>
        <select
          value={task.recurrence}
          onChange={(e) =>
            onPatch(task.id, { recurrence: (e.target as HTMLSelectElement).value as Recurrence })
          }
        >
          {RECURRENCES.map((recurrence) => (
            <option key={recurrence} value={recurrence}>
              {t(RECURRENCE_KEYS[recurrence])}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        class="danger-button"
        onClick={() => {
          if (confirm(t("confirmDeleteTask"))) {
            onDelete(task.id);
            onClose();
          }
        }}
      >
        {t("deleteTask")}
      </button>
    </Sheet>
  );
}
