import { useState } from "preact/hooks";
import { USER_IDS, type UserId, type UserNames } from "../domain/types";
import { t } from "../i18n";

interface Props {
  names: UserNames;
  /** Shown when the screen reappears because the code was rejected. */
  notice?: string;
  onDone: (identity: UserId, accessCode: string) => void;
}

/**
 * Shown once per device. Until both the shared code and the person are known the
 * app cannot tell whose list to render, so this blocks everything else.
 */
export function Onboarding({ names, notice, onDone }: Props) {
  const [code, setCode] = useState("");
  const [identity, setIdentity] = useState<UserId | null>(null);
  const ready = code.trim() !== "" && identity !== null;

  return (
    <div class="app onboarding">
      <header class="app-header">
        <h1>{t("onboardingTitle")}</h1>
      </header>
      <form
        class="onboarding-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || identity === null) return;
          onDone(identity, code.trim());
        }}
      >
        {notice !== undefined && <p class="banner banner--error">{notice}</p>}
        <p class="onboarding-intro">{t("onboardingIntro")}</p>

        <label class="field">
          <span>{t("accessCode")}</span>
          <input
            type="password"
            value={code}
            autocomplete="one-time-code"
            autocapitalize="off"
            autocorrect="off"
            spellcheck={false}
            enterKeyHint="done"
            onInput={(event) => setCode((event.target as HTMLInputElement).value)}
          />
        </label>

        <fieldset class="field">
          <legend>{t("whoAreYou")}</legend>
          <div class="list-switcher" role="radiogroup" aria-label={t("whoAreYou")}>
            {USER_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={identity === id}
                class={`segment ${identity === id ? "segment--active" : ""}`}
                onClick={() => setIdentity(id)}
              >
                {names[id]}
              </button>
            ))}
          </div>
        </fieldset>

        <button type="submit" class="primary-button" disabled={!ready}>
          {t("startUsing")}
        </button>
      </form>
    </div>
  );
}
