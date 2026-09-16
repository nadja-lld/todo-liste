export type DueBucket = "overdue" | "today" | "future" | "none";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayIso(now: Date): string {
  return toIsoDate(now);
}

/** Local calendar date of an ISO 8601 timestamp, or "" if it cannot be parsed. */
export function isoDateOfTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : toIsoDate(date);
}

function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return { year, month, day };
}

function fromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function addDays(isoDate: string, days: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  return fromUtc(new Date(Date.UTC(year, month - 1, day + days)));
}

export function addMonthsClamped(isoDate: string, months: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  // Day 0 of the month after the target month = last day of the target month.
  const lastDayOfTarget = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTarget);
  return fromUtc(new Date(Date.UTC(year, month - 1 + months, clampedDay)));
}

export function dueBucket(dueDate: string | undefined, today: string): DueBucket {
  if (dueDate === undefined) return "none";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return "future";
}

export function formatDueDate(
  dueDate: string,
  today: string,
  labels: { today: string; tomorrow: string },
): string {
  if (dueDate === today) return labels.today;
  if (dueDate === addDays(today, 1)) return labels.tomorrow;
  const { year, month, day } = parseIsoDate(dueDate);
  return `${pad2(day)}.${pad2(month)}.${year}`;
}
