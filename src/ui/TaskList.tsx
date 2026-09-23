import { sortOpenTasks, splitTasks } from "../domain/sorting";
import type { Task, TodoList } from "../domain/types";
import { t } from "../i18n";
import { TaskRow } from "./TaskRow";

interface Props {
  tasks: Task[];
  lists: TodoList[];
  today: string;
  showListName: boolean;
  emptyMessage: string;
  showCompleted: boolean;
  onShowCompletedChange: (open: boolean) => void;
  onToggle: (taskId: string) => void;
  onOpen: (taskId: string) => void;
  /** Returns the name to show as "new from X", or undefined for no marker. */
  newFromName: (task: Task) => string | undefined;
}

export function TaskList(props: Props) {
  const { open, later, completed } = splitTasks(props.tasks, props.today);
  const sortedOpen = sortOpenTasks(open, props.today);
  const sortedLater = sortOpenTasks(later, props.today);
  const listName = (task: Task) =>
    props.showListName ? props.lists.find((list) => list.id === task.listId)?.name : undefined;

  return (
    <section class="task-list">
      {sortedOpen.length === 0 ? (
        <p class="empty">{props.emptyMessage}</p>
      ) : (
        <ul>
          {sortedOpen.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={props.today}
              listName={listName(task)}
              newFromName={props.newFromName(task)}
              onToggle={props.onToggle}
              onOpen={props.onOpen}
            />
          ))}
        </ul>
      )}
      {/* Uncontrolled on purpose: it starts closed every time the list is shown,
          which is the point of hiding these in the first place. */}
      {sortedLater.length > 0 && (
        <details class="later">
          <summary>{t("laterSection", { count: sortedLater.length })}</summary>
          <ul>
            {sortedLater.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={props.today}
                listName={listName(task)}
                newFromName={props.newFromName(task)}
                onToggle={props.onToggle}
                onOpen={props.onOpen}
              />
            ))}
          </ul>
        </details>
      )}
      {completed.length > 0 && (
        <details
          class="completed"
          open={props.showCompleted}
          onToggle={(event) =>
            props.onShowCompletedChange((event.currentTarget as HTMLDetailsElement).open)
          }
        >
          <summary>{t("completedSection", { count: completed.length })}</summary>
          <ul>
            {completed.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={props.today}
                listName={listName(task)}
                newFromName={props.newFromName(task)}
                onToggle={props.onToggle}
                onOpen={props.onOpen}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
