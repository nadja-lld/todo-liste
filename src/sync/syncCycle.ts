import { mergeState } from "../domain/merge";
import type { AppState } from "../domain/types";
import type { SyncClient } from "./syncClient";

/** How often a conflicting write is re-merged before the cycle gives up. */
const MAX_ATTEMPTS = 3;

export type CycleResult =
  | { outcome: "synced"; state: AppState; version: number }
  | { outcome: "unchanged"; state: AppState; version: number }
  | { outcome: "conflict-exhausted" };

function sameDocument(x: AppState, y: AppState): boolean {
  return JSON.stringify(x) === JSON.stringify(y);
}

/**
 * One fetch-merge-push round trip. Deliberately free of timers and browser APIs
 * so the conflict path can be tested directly.
 *
 * `adopt` marks a device that has never synced. Its local state is the scaffold
 * `createInitialState` just produced, whose list ids no other device knows;
 * merging it would leave two inboxes per person. Such a device takes the server
 * document as-is instead.
 */
export async function runSyncCycle(
  client: SyncClient,
  local: AppState,
  now: Date,
  adopt: boolean,
): Promise<CycleResult> {
  let remote = await client.get();

  if (adopt && remote !== null) {
    return { outcome: "synced", state: remote.state, version: remote.version };
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const baseVersion = remote?.version ?? 0;
    const merged = remote === null ? local : mergeState(local, remote.state, now);

    if (remote !== null && sameDocument(merged, remote.state)) {
      return { outcome: "unchanged", state: merged, version: remote.version };
    }

    const result = await client.put(baseVersion, merged);
    if (result.ok) return { outcome: "synced", state: merged, version: result.version };

    remote = result.current;
    local = merged;
  }

  return { outcome: "conflict-exhausted" };
}
