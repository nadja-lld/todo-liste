import { useRegisterSW } from "virtual:pwa-register/preact";
import { t } from "../i18n";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div class="banner banner--info update-prompt" role="status">
      <span>{t("updateAvailable")}</span>
      <button type="button" class="text-button" onClick={() => void updateServiceWorker(true)}>
        {t("updateNow")}
      </button>
    </div>
  );
}
