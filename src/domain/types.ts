export const SCHEMA_VERSION = 1 as const;

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export interface TodoList {
  id: string;
  name: string;
  position: number;
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  note?: string;
  priority: Priority;
  /** ISO calendar date YYYY-MM-DD */
  dueDate?: string;
  recurrence: Recurrence;
  /** ISO 8601 timestamp */
  completedAt?: string;
  /** ISO 8601 timestamp */
  createdAt: string;
}

export interface AppState {
  schemaVersion: typeof SCHEMA_VERSION;
  lists: TodoList[];
  tasks: Task[];
}
