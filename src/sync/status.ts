import type { MessageKey } from "../i18n";

export type SyncStatus =
  | "disabled"
  | "idle"
  | "syncing"
  | "offline"
  | "error"
  /** The access code was refused; only the user can fix this. */
  | "auth-error";

/**
 * The only states worth showing. Silence means the sync is doing its job:
 * announcing every routine success made the header flicker on each edit.
 */
export type AttentionStatus = Extract<SyncStatus, "offline" | "error" | "auth-error">;

const KEYS: Record<AttentionStatus, MessageKey> = {
  offline: "syncStatusOffline",
  error: "syncStatusError",
  "auth-error": "syncStatusError",
};

export function needsAttention(status: SyncStatus): status is AttentionStatus {
  return status === "offline" || status === "error" || status === "auth-error";
}

export function syncStatusKey(status: AttentionStatus): MessageKey {
  return KEYS[status];
}
