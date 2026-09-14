import { useState } from "preact/hooks";
import { exportFileName, parseImport, serializeState } from "../domain/exportImport";
import {
  addList,
  clearCompleted,
  deleteList,
  moveList,
  renameList,
  sortedLists,
} from "../domain/state";
import type { AppState } from "../domain/types";
import { t } from "../i18n";
import { Sheet } from "./Sheet";
import { shareOrDownloadFile } from "./share";

// jsdom (as used by the test environment) does not implement File.prototype.text,
// and `new Response(file).text()` does not read the file's Blob contents there
// either (it stringifies the File instance instead). Feature-detect the native
// method for real browsers, falling back to FileReader everywhere else.
function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

interface Props {
  state: AppState;
  today: string;
  onUpdate: (fn: (state: AppState) => AppState) => void;
  onReplace: (state: AppState) => void;
  onClose: () => void;
  confirm?: (message: string) => boolean;
  prompt?: (message: string, defaultValue: string) => string | null;
  notify?: (message: string) => void;
  exportFile?: (fileName: string, content: string) => Promise<void>;
}

export function SettingsSheet({
  state,
  today,
  onUpdate,
  onReplace,
  onClose,
  confirm = (message) => window.confirm(message),
  prompt = (message, defaultValue) => window.prompt(message, defaultValue),
  notify = (message) => window.alert(message),
  exportFile = (fileName, content) => shareOrDownloadFile(fileName, content, "application/json"),
}: Props) {
  const [newListName, setNewListName] = useState("");
  const lists = sortedLists(state);
  const completedCount = state.tasks.filter((task) => task.completedAt !== undefined).length;
  const taskCount = (listId: string) => state.tasks.filter((task) => task.listId === listId).length;

  const handleImport = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const result = parseImport(await readFileText(file));
    if (!result.ok) {
      notify(t("importInvalid", { error: result.error }));
      return;
    }
    if (confirm(t("importPreview", { lists: result.listCount, tasks: result.taskCount }))) {
      onReplace(result.state);
      notify(t("importDone"));
    }
  };

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
              onClick={() => onUpdate((s) => moveList(s, list.id, "up"))}
            >
              ↑
            </button>
            <button
              type="button"
              class="icon-button"
              aria-label={`${t("moveListDown")}: ${list.name}`}
              disabled={index === lists.length - 1}
              onClick={() => onUpdate((s) => moveList(s, list.id, "down"))}
            >
              ↓
            </button>
            <button
              type="button"
              class="icon-button"
              aria-label={`${t("renameList")}: ${list.name}`}
              onClick={() => {
                const name = prompt(t("renameList"), list.name);
                if (name !== null) onUpdate((s) => renameList(s, list.id, name));
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
                if (confirm(t("confirmDeleteList", { name: list.name, count }))) {
                  onUpdate((s) => deleteList(s, list.id));
                }
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
          onUpdate((s) => addList(s, newListName));
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

      <h3 class="section-title">{t("data")}</h3>
      <button
        type="button"
        class="secondary-button"
        onClick={() => void exportFile(exportFileName(today), serializeState(state))}
      >
        {t("exportData")}
      </button>
      <label class="secondary-button file-button">
        {t("importData")}
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => void handleImport(e.target as HTMLInputElement)}
        />
      </label>
      <button
        type="button"
        class="secondary-button"
        disabled={completedCount === 0}
        onClick={() => {
          if (confirm(t("confirmClearCompleted"))) onUpdate(clearCompleted);
        }}
      >
        {t("clearCompleted")}
      </button>
    </Sheet>
  );
}
