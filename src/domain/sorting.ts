import { addDays, dueBucket, isoDateOfTimestamp, type DueBucket } from "./dates";
import type { Priority, Task } from "./types";

const BUCKET_ORDER: Record<DueBucket, number> = { overdue: 0, today: 1, future: 2, none: 3 };
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortOpenTasks(tasks: Task[], today: string): Task[] {
  return [...tasks].sort((a, b) => {
    const byBucket =
      BUCKET_ORDER[dueBucket(a.dueDate, today)] - BUCKET_ORDER[dueBucket(b.dueDate, today)];
    if (byBucket !== 0) return byBucket;
    const byDate = compareStrings(a.dueDate ?? "", b.dueDate ?? "");
    if (byDate !== 0) return byDate;
    const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (byPriority !== 0) return byPriority;
    return compareStrings(a.createdAt, b.createdAt);
  });
}

/** Completed tasks are limited to the ones finished on `today` so the section stays a daily recap. */
export function splitTasks(tasks: Task[], today: string): { open: Task[]; completed: Task[] } {
  const open: Task[] = [];
  const completed: Task[] = [];
  for (const task of tasks) {
    if (task.completedAt === undefined) open.push(task);
    else if (isoDateOfTimestamp(task.completedAt) === today) completed.push(task);
  }
  return { open, completed };
}

/** How long a finished hand-over stays worth looking at. */
export const DELEGATED_DONE_DAYS = 7;

/**
 * Splits the handed-over view. Finished items stay around longer than the daily
 * recap does — "did he do the thing I asked on Monday?" is a question you ask on
 * Wednesday — but not for the full retention period, or the view turns into a
 * graveyard that buries the open items.
 */
export function splitDelegated(tasks: Task[], today: string): { open: Task[]; done: Task[] } {
  const cutoff = addDays(today, -DELEGATED_DONE_DAYS);
  const open: Task[] = [];
  const done: Task[] = [];
  for (const task of tasks) {
    if (task.completedAt === undefined) open.push(task);
    else if (isoDateOfTimestamp(task.completedAt) >= cutoff) done.push(task);
  }
  done.sort((a, b) => compareStrings(b.completedAt ?? "", a.completedAt ?? ""));
  return { open, done };
}
