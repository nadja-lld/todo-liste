import { useState } from "preact/hooks";
import { t } from "../i18n";

interface Props {
  disabled: boolean;
  onAdd: (title: string) => void;
}

export function AddTaskBar({ disabled, onAdd }: Props) {
  const [title, setTitle] = useState("");
  return (
    <form
      class="add-bar"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim() === "") return;
        onAdd(title);
        setTitle("");
      }}
    >
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
