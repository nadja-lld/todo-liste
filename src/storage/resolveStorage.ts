const PROBE_KEY = "todo.probe";

export interface ResolvedStorage {
  storage: Storage;
  available: boolean;
}

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear(): void {
      data.clear();
    },
    getItem(key: string): string | null {
      return data.get(key) ?? null;
    },
    key(index: number): string | null {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    setItem(key: string, value: string): void {
      data.set(key, value);
    },
  };
}

/**
 * Resolves the Storage to use for the app. Touching `window.localStorage` (or
 * writing to it) can throw a SecurityError in some browser configurations
 * (e.g. iOS Safari with "Block All Cookies"). In that case fall back to an
 * in-memory Storage so the app still renders instead of showing a white
 * screen, and report that persistence is unavailable.
 */
export function resolveStorage(): ResolvedStorage {
  try {
    const storage = window.localStorage;
    storage.setItem(PROBE_KEY, "1");
    storage.removeItem(PROBE_KEY);
    return { storage, available: true };
  } catch {
    return { storage: createMemoryStorage(), available: false };
  }
}
