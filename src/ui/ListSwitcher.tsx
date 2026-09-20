import type { TodoList } from "../domain/types";
import { t } from "../i18n";

export type ViewId = "today" | "tomorrow" | "delegated" | string;

interface Props {
  lists: TodoList[];
  view: ViewId;
  onSelect: (view: ViewId) => void;
}

export function ListSwitcher({ lists, view, onSelect }: Props) {
  const entries: { id: ViewId; label: string }[] = [
    { id: "today", label: t("todayView") },
    { id: "tomorrow", label: t("tomorrowView") },
    { id: "delegated", label: t("delegatedView") },
    ...lists.map((list) => ({ id: list.id, label: list.name })),
  ];
  return (
    <nav class="list-switcher" role="tablist">
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="tab"
          aria-selected={view === entry.id}
          class={`segment ${view === entry.id ? "segment--active" : ""}`}
          onClick={() => onSelect(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </nav>
  );
}
