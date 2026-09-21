// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToday } from "../../src/ui/useToday";

function Probe({ now }: { now: () => Date }) {
  return <span data-testid="today">{useToday(now)}</span>;
}

describe("useToday", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("reports the current date", () => {
    const view = render(<Probe now={() => new Date(2026, 8, 14, 9, 0)} />);
    expect(view.getByTestId("today").textContent).toBe("2026-09-14");
  });

  it("turns over at midnight without anything else happening", () => {
    vi.useFakeTimers();
    let clock = new Date(2026, 8, 14, 23, 59, 30);
    const view = render(<Probe now={() => clock} />);
    expect(view.getByTestId("today").textContent).toBe("2026-09-14");

    // Nothing in the app changes overnight; only the clock moves.
    clock = new Date(2026, 8, 15, 0, 0, 5);
    act(() => {
      vi.advanceTimersByTime(40_000);
    });

    expect(view.getByTestId("today").textContent).toBe("2026-09-15");
  });

  it("does not fire before midnight", () => {
    vi.useFakeTimers();
    const clock = new Date(2026, 8, 14, 12, 0, 0);
    const view = render(<Probe now={() => clock} />);
    act(() => {
      vi.advanceTimersByTime(11 * 60 * 60 * 1000);
    });
    expect(view.getByTestId("today").textContent).toBe("2026-09-14");
  });

  it("survives a caller that hands over a fresh function on every render", () => {
    vi.useFakeTimers();
    let clock = new Date(2026, 8, 14, 23, 59, 30);
    const view = render(<Probe now={() => clock} />);
    view.rerender(<Probe now={() => clock} />);
    view.rerender(<Probe now={() => clock} />);
    clock = new Date(2026, 8, 15, 0, 0, 5);
    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(view.getByTestId("today").textContent).toBe("2026-09-15");
  });
});
