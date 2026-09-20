import { useState } from "preact/hooks";
import { listsOf, tasksOf } from "../domain/selectors";
import { addList, clearCompleted, deleteList, moveList, renameList } from "../domain/state";
import type { AppState, UserId } from "../domain/types";
import { t } from "../i18n";
import { Sheet } from "./Sheet";

interface Props {
  state: AppState;
  identity: UserId;
  now: () => Date;
  onUpdate: (fn: (state: AppState) => AppState) => void;
  onClose: () => void;
  confirm?: (message: string) => boolean;
  prompt?: (message: string, defaultValue: string) => string | null;
  notify?: (message: string) => void;
}

export function SettingsSheet({
  state,
  identity,
  now,
  onUpdate,
  onClose,
  confirm = (message) => window.confirm(message),
  prompt = (message, defaultValue) => window.prompt(message, defaultValue),
  notify = (message) => window.alert(message),
}: Props) {
  const [newListName, setNewListName] = useState("");
  const lists = listsOf(state, identity);
  const ownTasks = tasksOf(state, identity);
  const completedCount = ownTasks.filter((task) => task.completedAt !== undefined).length;
  const taskCount = (listId: string) => ownTasks.filter((task) => task.listId === listId).length;

  return (
    <Sheet title={t("settings")} onClose={onClose}>
      <h3 class="section-title">{t("lists")}</h3>
      <ul class="settings-lists">
        {lists.map((list, index) => (
          <li key={list.id} class="settings-list-row">
            <span class="settings-list-name">{list.name}</span>
            <button
              type="button"
              class="icon-button"
              aria-label={`${t("moveListUp")}: ${list.name}`}
              disabled={index === 0}
              onClick={() => onUpdate((s) => moveList(s, list.id, "up", now()))}
            >
              ↑
            </button>
            <button
              type="button"
              class="icon-button"
              aria-label={`${t("moveListDown")}: ${list.name}`}
              disabled={index === lists.length - 1}
              onClick={() => onUpdate((s) => moveList(s, list.id, "down", now()))}
            >
              ↓
            </button>
            <button
              type="button"
              class="icon-button"
              aria-label={`${t("renameList")}: ${list.name}`}
              onClick={() => {
                const name = prompt(t("renameList"), list.name);
                if (name !== null) onUpdate((s) => renameList(s, list.id, name, now()));
              }}
            >
              ✎
            </button>
            <button
              type="button"
              class="icon-button icon-button--danger"
              aria-label={`${t("deleteList")}: ${list.name}`}
              onClick={() => {
                if (lists.length <= 1) {
                  notify(t("cannotDeleteLastList"));
                  return;
                }
                const count = taskCount(list.id);
                if (count > 0 && !confirm(t("confirmDeleteList", { name: list.name, count }))) {
                  return;
                }
                onUpdate((s) => deleteList(s, list.id, now()));
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        class="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (newListName.trim() === "") return;
          onUpdate((s) => addList(s, newListName, identity, now()));
          setNewListName("");
        }}
      >
        <input
          type="text"
          value={newListName}
          placeholder={t("newListPlaceholder")}
          aria-label={t("newListPlaceholder")}
          onInput={(e) => setNewListName((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="primary-button">
          {t("addList")}
        </button>
      </form>

      <button
        type="button"
        class="secondary-button"
        disabled={completedCount === 0}
        onClick={() => {
          if (confirm(t("confirmClearCompleted")))
            onUpdate((s) => clearCompleted(s, identity, now()));
        }}
      >
        {t("clearCompleted")}
      </button>
    </Sheet>
  );
}
