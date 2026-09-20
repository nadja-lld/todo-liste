export const SCHEMA_VERSION = 2 as const;

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const USER_IDS = ["a", "b"] as const;
export type UserId = (typeof USER_IDS)[number];

export interface User {
  id: UserId;
  name: string;
  /** ISO 8601 timestamp; a rename merges like any other change */
  updatedAt: string;
}

export interface TodoList {
  id: string;
  name: string;
  position: number;
  owner: UserId;
  /** ISO 8601 timestamp */
  updatedAt: string;
  /** ISO 8601 timestamp; set means the list is a tombstone */
  deletedAt?: string;
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
  createdBy: UserId;
  /** ISO 8601 timestamp; unset means the owner has not looked at it yet */
  seenAt?: string;
  /** ISO 8601 timestamp */
  updatedAt: string;
  /** ISO 8601 timestamp; set means the task is a tombstone */
  deletedAt?: string;
}

export interface AppState {
  schemaVersion: typeof SCHEMA_VERSION;
  /** exactly two entries, ids "a" and "b" */
  users: User[];
  lists: TodoList[];
  tasks: Task[];
}

export interface UserNames {
  a: string;
  b: string;
}
