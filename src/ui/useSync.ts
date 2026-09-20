import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { AppState } from "../domain/types";
import { loadDeviceSettings, markAdopted, syncBaseUrl } from "../storage/deviceSettings";
import type { SyncStatus } from "../sync/status";
import { createSyncClient, SyncAuthError } from "../sync/syncClient";
import { runSyncCycle } from "../sync/syncCycle";

/** Wait this long after the last edit before pushing, so typing does not sync per keystroke. */
const DEBOUNCE_MS = 2000;
/** Background poll while the app is open, to pick up the other person's changes. */
const POLL_MS = 60000;

export interface UseSyncArgs {
  state: AppState;
  replace: (state: AppState) => void;
  storage: Storage;
  now: () => Date;
  fetchImpl?: typeof fetch;
}

export interface SyncHandle {
  status: SyncStatus;
  syncNow: () => void;
}

export function useSync({ state, replace, storage, now, fetchImpl }: UseSyncArgs): SyncHandle {
  const baseUrl = syncBaseUrl();
  const device = loadDeviceSettings(storage);
  const enabled = baseUrl !== null && device.accessCode !== null && device.identity !== null;

  const [status, setStatus] = useState<SyncStatus>(enabled ? "syncing" : "disabled");
  // Reading state through a ref keeps the sync callback stable, so the timers
  // below are not torn down and rebuilt on every keystroke.
  const stateRef = useRef(state);
  stateRef.current = state;
  const replaceRef = useRef(replace);
  replaceRef.current = replace;
  const running = useRef(false);

  const syncNow = useCallback(() => {
    if (!enabled || baseUrl === null || device.accessCode === null) return;
    if (running.current) return;
    running.current = true;
    setStatus("syncing");

    const client = createSyncClient(baseUrl, device.accessCode, fetchImpl);
    const adopt = !loadDeviceSettings(storage).adopted;

    runSyncCycle(client, stateRef.current, now(), adopt)
      .then((result) => {
        if (result.outcome === "conflict-exhausted") {
          setStatus("error");
          return;
        }
        markAdopted(storage);
        if (result.outcome === "synced") replaceRef.current(result.state);
        setStatus("idle");
      })
      .catch((error: unknown) => {
        // A refused code needs the user; anything else is very likely the network.
        setStatus(error instanceof SyncAuthError ? "auth-error" : "offline");
      })
      .finally(() => {
        running.current = false;
      });
  }, [enabled, baseUrl, device.accessCode, fetchImpl, storage, now]);

  // On mount, and whenever the app comes back to the foreground or online.
  useEffect(() => {
    if (!enabled) return;
    syncNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", syncNow);
    const poll = window.setInterval(syncNow, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", syncNow);
      window.clearInterval(poll);
    };
  }, [enabled, syncNow]);

  // Debounced push after local edits.
  const isFirst = useRef(true);
  useEffect(() => {
    if (!enabled) return;
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const timer = window.setTimeout(syncNow, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, state, syncNow]);

  return { status, syncNow };
}
