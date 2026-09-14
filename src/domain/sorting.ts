import { dueBucket, type DueBucket } from "./dates";
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

export function splitTasks(tasks: Task[]): { open: Task[]; completed: Task[] } {
  const open: Task[] = [];
  const completed: Task[] = [];
  for (const task of tasks) {
    (task.completedAt === undefined ? open : completed).push(task);
  }
  return { open, completed };
}
