import { parseAppState } from "../domain/schema";
import { createInitialState } from "../domain/state";
import type { AppState, UserNames } from "../domain/types";
import { migrate } from "../domain/migrate";

export const STATE_KEY = "todo.state";
export const BACKUP_KEY_PREFIX = "todo.state.backup.";

export interface LoadResult {
  state: AppState;
  recoveredFromCorrupt: boolean;
}

function tryParse(text: string, names: UserNames, now: Date): AppState | null {
  try {
    const parsed = parseAppState(migrate(JSON.parse(text), names, now));
    return parsed.ok ? parsed.state : null;
  } catch {
    return null;
  }
}

function tryBackup(storage: Storage, payload: string, now: Date): boolean {
  try {
    storage.setItem(`${BACKUP_KEY_PREFIX}${now.toISOString()}`, payload);
    return true;
  } catch {
    return false;
  }
}

export function loadState(
  storage: Storage,
  defaultListName: string,
  names: UserNames,
  now: Date,
): LoadResult {
  const stored = storage.getItem(STATE_KEY);
  if (stored === null) {
    return { state: createInitialState(defaultListName, names, now), recoveredFromCorrupt: false };
  }
  const state = tryParse(stored, names, now);
  if (state) return { state, recoveredFromCorrupt: false };

  const backedUp = tryBackup(storage, stored, now);
  if (backedUp) storage.removeItem(STATE_KEY);
  return { state: createInitialState(defaultListName, names, now), recoveredFromCorrupt: true };
}

export function saveState(storage: Storage, state: AppState): boolean {
  try {
    storage.setItem(STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
