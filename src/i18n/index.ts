import { de } from "./de";
import { en } from "./en";

export type MessageKey = keyof typeof de;
export type Language = "de" | "en";

const tables: Record<Language, Record<MessageKey, string>> = { de, en };
let currentLanguage: Language = "de";

export function detectLanguage(navigatorLanguage: string | undefined): Language {
  return navigatorLanguage?.toLowerCase().startsWith("de") ? "de" : "en";
}

export function setLanguage(language: Language): void {
  currentLanguage = language;
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = tables[currentLanguage][key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
