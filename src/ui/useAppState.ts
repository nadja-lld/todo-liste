import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { AppState } from "../domain/types";
import { t } from "../i18n";
import { loadState, saveState } from "../storage/localStorage";

export interface AppStateHandle {
  state: AppState;
  update: (fn: (state: AppState) => AppState) => void;
  replace: (state: AppState) => void;
  saveFailed: boolean;
  recoveredFromCorrupt: boolean;
}

export function useAppState(storage: Storage, now: () => Date): AppStateHandle {
  const initial = useRef<ReturnType<typeof loadState> | null>(null);
  if (initial.current === null) {
    initial.current = loadState(storage, t("defaultListName"), now());
  }
  const [state, setState] = useState<AppState>(initial.current.state);
  const [saveFailed, setSaveFailed] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setSaveFailed(!saveState(storage, state));
  }, [storage, state]);

  const update = useCallback((fn: (state: AppState) => AppState) => setState(fn), []);
  const replace = useCallback((next: AppState) => setState(next), []);

  return {
    state,
    update,
    replace,
    saveFailed,
    recoveredFromCorrupt: initial.current.recoveredFromCorrupt,
  };
}
