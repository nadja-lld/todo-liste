import { useState } from "preact/hooks";
import type { UserId } from "../domain/types";
import { t } from "../i18n";

interface Props {
  /** False while no own list is selected, e.g. in the Today overview. */
  canAddForSelf: boolean;
  /** The person holding the device. */
  identity: UserId;
  otherId: UserId;
  otherName: string;
  onAdd: (title: string, assignTo: UserId) => void;
}

export function AddTaskBar({ canAddForSelf, identity, otherId, otherName, onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [assignTo, setAssignTo] = useState<UserId>(identity);
  // Delegating always has a target (the other person's inbox), so it stays
  // available even from an overview where no own list is selected.
  const disabled = assignTo === identity && !canAddForSelf;

  return (
    <form
      class="add-bar"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim() === "") return;
        onAdd(title, assignTo);
        setTitle("");
        // Delegating is the exception, so the next task is mine again unless asked.
        setAssignTo(identity);
      }}
    >
      <div class="list-switcher add-bar__target" role="radiogroup" aria-label={t("whoAreYou")}>
        <button
          type="button"
          role="radio"
          aria-checked={assignTo === identity}
          class={`segment ${assignTo === identity ? "segment--active" : ""}`}
          onClick={() => setAssignTo(identity)}
        >
          {t("forMe")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={assignTo === otherId}
          class={`segment ${assignTo === otherId ? "segment--active" : ""}`}
          onClick={() => setAssignTo(otherId)}
        >
          {t("forOther", { name: otherName })}
        </button>
      </div>
      <div class="add-bar__row">
        <input
          type="text"
          value={title}
          placeholder={t("newTaskPlaceholder")}
          aria-label={t("newTaskPlaceholder")}
          disabled={disabled}
          enterKeyHint="done"
          autocomplete="off"
          onInput={(event) => setTitle((event.target as HTMLInputElement).value)}
        />
        <button type="submit" disabled={disabled || title.trim() === ""}>
          {t("addTask")}
        </button>
      </div>
    </form>
  );
}
