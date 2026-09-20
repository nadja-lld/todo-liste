import type { MessageKey } from "../i18n";

export type SyncStatus =
  | "disabled"
  | "idle"
  | "syncing"
  | "offline"
  | "error"
  /** The access code was refused; only the user can fix this. */
  | "auth-error";

const KEYS: Record<SyncStatus, MessageKey> = {
  disabled: "syncStatusDisabled",
  idle: "syncStatusSynced",
  syncing: "syncStatusSyncing",
  offline: "syncStatusOffline",
  error: "syncStatusError",
  "auth-error": "syncStatusError",
};

export function syncStatusKey(status: SyncStatus): MessageKey {
  return KEYS[status];
}
