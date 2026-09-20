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
  // Everything the callback reads goes through a ref, so `syncNow` keeps a
  // stable identity. Callers hand us fresh closures on every render — App's
  // `now` is a default parameter — and if any of them reached the dependency
  // array, the effect below would re-run per render and sync in a loop.
  // A state this hook produced is held here until it comes back through props.
  // Re-renders in between (a status change is one) would otherwise reset the
  // ref below to the state the component still shows, which right after an
  // adoption is this device's throwaway scaffold.
  const pendingRef = useRef<AppState | null>(null);
  const lastPropRef = useRef(state);
  if (lastPropRef.current !== state) {
    lastPropRef.current = state;
    pendingRef.current = null;
  }
  const stateRef = useRef(state);
  stateRef.current = pendingRef.current ?? state;
  const replaceRef = useRef(replace);
  replaceRef.current = replace;
  const nowRef = useRef(now);
  nowRef.current = now;
  const fetchRef = useRef(fetchImpl);
  fetchRef.current = fetchImpl;
  const running = useRef(false);

  const syncNow = useCallback(() => {
    if (!enabled || baseUrl === null || device.accessCode === null) return;
    if (running.current) return;
    running.current = true;
    setStatus("syncing");

    const client = createSyncClient(baseUrl, device.accessCode, fetchRef.current);
    const adopt = !loadDeviceSettings(storage).adopted;

    runSyncCycle(client, stateRef.current, nowRef.current(), adopt)
      .then((result) => {
        if (result.outcome === "conflict-exhausted") {
          setStatus("error");
          return;
        }
        markAdopted(storage);
        if (result.outcome === "synced") {
          // Adopt into the ref before handing the state to the component. The
          // re-render that carries it arrives later, and a cycle starting in
          // between would otherwise still see this device's initial scaffold,
          // no longer count as fresh, and merge those throwaway lists back in.
          pendingRef.current = result.state;
          stateRef.current = result.state;
          replaceRef.current(result.state);
        }
        setStatus("idle");
      })
      .catch((error: unknown) => {
        // A refused code needs the user; anything else is very likely the network.
        setStatus(error instanceof SyncAuthError ? "auth-error" : "offline");
      })
      .finally(() => {
        running.current = false;
      });
  }, [enabled, baseUrl, device.accessCode, storage]);

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
