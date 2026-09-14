import { addDays, addMonthsClamped } from "./dates";
import type { Recurrence } from "./types";

export type ActiveRecurrence = Exclude<Recurrence, "none">;

export function nextDueDate(baseDate: string, recurrence: ActiveRecurrence): string {
  switch (recurrence) {
    case "daily":
      return addDays(baseDate, 1);
    case "weekly":
      return addDays(baseDate, 7);
    case "monthly":
      return addMonthsClamped(baseDate, 1);
  }
}
