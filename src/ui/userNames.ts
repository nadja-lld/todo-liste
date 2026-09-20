import type { UserId, UserNames } from "../domain/types";
import { t } from "../i18n";

/**
 * The two people are fixed, and so are their names: keeping them in the synced
 * document only created a way for the devices to disagree about them.
 */
export function userNames(): UserNames {
  return { a: t("userAName"), b: t("userBName") };
}

export function userName(userId: UserId): string {
  return userNames()[userId];
}
