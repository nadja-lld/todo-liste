import { USER_IDS, type UserId } from "../domain/types";

export const IDENTITY_KEY = "todo.identity";
export const ACCESS_CODE_KEY = "todo.accessCode";
export const ADOPTED_KEY = "todo.adopted";

export interface DeviceSettings {
  identity: UserId | null;
  accessCode: string | null;
  /** False until this device has completed its first sync. */
  adopted: boolean;
}

/**
 * Every access is guarded: touching localStorage throws outright in some browser
 * configurations (iOS Safari with "Block All Cookies"), and a settings read must
 * never be the reason the app fails to render.
 */
function read(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // A device that cannot remember its identity asks again next launch.
  }
}

function isUserId(value: string | null): value is UserId {
  return value !== null && (USER_IDS as readonly string[]).includes(value);
}

export function loadDeviceSettings(storage: Storage): DeviceSettings {
  const identity = read(storage, IDENTITY_KEY);
  const accessCode = read(storage, ACCESS_CODE_KEY);
  return {
    identity: isUserId(identity) ? identity : null,
    accessCode: accessCode === null || accessCode === "" ? null : accessCode,
    adopted: read(storage, ADOPTED_KEY) === "1",
  };
}

export function saveIdentity(storage: Storage, identity: UserId): void {
  write(storage, IDENTITY_KEY, identity);
}

export function saveAccessCode(storage: Storage, code: string): void {
  write(storage, ACCESS_CODE_KEY, code);
}

export function markAdopted(storage: Storage): void {
  write(storage, ADOPTED_KEY, "1");
}

export function clearDeviceSettings(storage: Storage): void {
  for (const key of [IDENTITY_KEY, ACCESS_CODE_KEY, ADOPTED_KEY]) {
    try {
      storage.removeItem(key);
    } catch {
      // Nothing to do: the setting was unreachable to begin with.
    }
  }
}

/** The sync endpoint baked in at build time. Empty means sync is switched off. */
export function syncBaseUrl(): string | null {
  const url: unknown = import.meta.env.VITE_SYNC_URL;
  return typeof url === "string" && url.trim() !== "" ? url.trim() : null;
}
