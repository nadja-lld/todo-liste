import { beforeEach, describe, expect, it } from "vitest";
import { de } from "../../src/i18n/de";
import { en } from "../../src/i18n/en";
import { detectLanguage, setLanguage, t } from "../../src/i18n/index";

describe("message tables", () => {
  it("define the same keys in de and en", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });
});

describe("t", () => {
  beforeEach(() => setLanguage("de"));

  it("returns German by default", () => {
    expect(t("addTask")).toBe("Hinzufügen");
  });

  it("switches to English", () => {
    setLanguage("en");
    expect(t("addTask")).toBe("Add");
  });

  it("replaces placeholders", () => {
    expect(t("importPreview", { lists: 2, tasks: 5 })).toBe("2 Listen und 5 Aufgaben ersetzen?");
  });
});

describe("detectLanguage", () => {
  it("picks de for de-DE and de-AT", () => {
    expect(detectLanguage("de-DE")).toBe("de");
    expect(detectLanguage("de-AT")).toBe("de");
  });
  it("falls back to en for anything else or undefined", () => {
    expect(detectLanguage("fr-FR")).toBe("en");
    expect(detectLanguage(undefined)).toBe("en");
  });
});
