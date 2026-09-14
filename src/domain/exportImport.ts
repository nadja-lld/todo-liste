import { parseAppState } from "./schema";
import type { AppState } from "./types";

export type ImportResult =
  | { ok: true; state: AppState; listCount: number; taskCount: number }
  | { ok: false; error: string };

export function serializeState(state: AppState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function exportFileName(today: string): string {
  return `todos-${today}.json`;
}

export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  const parsed = parseAppState(raw);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    state: parsed.state,
    listCount: parsed.state.lists.length,
    taskCount: parsed.state.tasks.length,
  };
}
