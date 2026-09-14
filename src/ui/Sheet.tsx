import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { t } from "../i18n";

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

export function Sheet({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header class="sheet-header">
          <h2>{title}</h2>
          <button type="button" class="sheet-close" onClick={onClose}>
            {t("close")}
          </button>
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
