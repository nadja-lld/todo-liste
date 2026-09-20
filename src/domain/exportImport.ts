import { migrate } from "./migrate";
import { parseAppState } from "./schema";
import type { AppState, UserNames } from "./types";

export type ImportResult =
  | { ok: true; state: AppState; listCount: number; taskCount: number }
  | { ok: false; error: string };

export function serializeState(state: AppState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function exportFileName(today: string): string {
  return `todos-${today}.json`;
}

/**
 * Backups exported before the second person existed are still valid files, so
 * they go through the same migration a stored document does.
 */
export function parseImport(text: string, names: UserNames, now: Date): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  const parsed = parseAppState(migrate(raw, names, now));
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    state: parsed.state,
    listCount: parsed.state.lists.length,
    taskCount: parsed.state.tasks.length,
  };
}
