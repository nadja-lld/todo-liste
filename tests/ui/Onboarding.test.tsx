// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../src/i18n";
import { Onboarding } from "../../src/ui/Onboarding";

const NAMES = { a: "Nadja", b: "Chris" };

describe("Onboarding", () => {
  beforeEach(() => setLanguage("de"));
  afterEach(cleanup);

  it("offers a code field and a button per person", () => {
    render(<Onboarding names={NAMES} onDone={vi.fn()} />);
    expect(screen.getByLabelText("Zugangscode")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Nadja" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Chris" })).toBeTruthy();
  });

  it("stays disabled until both a code and a person are given", () => {
    render(<Onboarding names={NAMES} onDone={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Loslegen" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.input(screen.getByLabelText("Zugangscode"), { target: { value: "s3cret" } });
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "Chris" }));
    expect(submit.disabled).toBe(false);
  });

  it("reports the trimmed code and the chosen person", () => {
    const onDone = vi.fn();
    render(<Onboarding names={NAMES} onDone={onDone} />);
    fireEvent.input(screen.getByLabelText("Zugangscode"), { target: { value: "  s3cret  " } });
    fireEvent.click(screen.getByRole("radio", { name: "Chris" }));
    fireEvent.click(screen.getByRole("button", { name: "Loslegen" }));
    expect(onDone).toHaveBeenCalledWith("b", "s3cret");
  });

  it("marks the chosen person for screen readers", () => {
    render(<Onboarding names={NAMES} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Nadja" }));
    expect(screen.getByRole("radio", { name: "Nadja" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Chris" }).getAttribute("aria-checked")).toBe("false");
  });
});
