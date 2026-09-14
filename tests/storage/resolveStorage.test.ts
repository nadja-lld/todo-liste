import { afterEach, describe, expect, it } from "vitest";
import { resolveStorage } from "../../src/storage/resolveStorage";

function stubBlockedWindow(): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      get localStorage(): Storage {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    },
  });
}

describe("resolveStorage", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("falls back to memory storage when window.localStorage throws", () => {
    stubBlockedWindow();
    const { storage, available } = resolveStorage();
    expect(available).toBe(false);
    expect(storage.length).toBe(0);
  });

  it("round-trips values in the memory storage fallback", () => {
    stubBlockedWindow();
    const { storage } = resolveStorage();
    storage.setItem("a", "1");
    storage.setItem("b", "2");
    expect(storage.length).toBe(2);
    expect(storage.getItem("a")).toBe("1");
    expect(storage.key(0)).toBe("a");
    storage.removeItem("a");
    expect(storage.getItem("a")).toBeNull();
    expect(storage.length).toBe(1);
  });
});
