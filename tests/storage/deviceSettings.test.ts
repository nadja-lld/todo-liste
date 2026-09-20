import { describe, expect, it } from "vitest";
import {
  ACCESS_CODE_KEY,
  ADOPTED_KEY,
  clearDeviceSettings,
  IDENTITY_KEY,
  loadDeviceSettings,
  markAdopted,
  saveAccessCode,
  saveIdentity,
} from "../../src/storage/deviceSettings";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new Error("SecurityError");
  };
  return {
    get length(): number {
      return fail();
    },
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

describe("deviceSettings", () => {
  it("reports empty defaults on a fresh device", () => {
    expect(loadDeviceSettings(fakeStorage())).toEqual({
      identity: null,
      accessCode: null,
      adopted: false,
    });
  });

  it("round-trips identity, access code and the adopted flag", () => {
    const storage = fakeStorage();
    saveIdentity(storage, "b");
    saveAccessCode(storage, "s3cret");
    markAdopted(storage);
    expect(loadDeviceSettings(storage)).toEqual({
      identity: "b",
      accessCode: "s3cret",
      adopted: true,
    });
  });

  it("treats a stored value that is not a known person as no identity", () => {
    const storage = fakeStorage({ [IDENTITY_KEY]: "z" });
    expect(loadDeviceSettings(storage).identity).toBeNull();
  });

  it("treats an empty access code as none", () => {
    const storage = fakeStorage({ [ACCESS_CODE_KEY]: "" });
    expect(loadDeviceSettings(storage).accessCode).toBeNull();
  });

  it("clears every device-local key", () => {
    const storage = fakeStorage({
      [IDENTITY_KEY]: "a",
      [ACCESS_CODE_KEY]: "x",
      [ADOPTED_KEY]: "1",
      "todo.state": "keep me",
    });
    clearDeviceSettings(storage);
    expect(loadDeviceSettings(storage)).toEqual({
      identity: null,
      accessCode: null,
      adopted: false,
    });
    expect(storage.getItem("todo.state")).toBe("keep me");
  });

  it("survives a storage that throws on every access", () => {
    const storage = throwingStorage();
    expect(() => loadDeviceSettings(storage)).not.toThrow();
    expect(loadDeviceSettings(storage)).toEqual({
      identity: null,
      accessCode: null,
      adopted: false,
    });
    expect(() => saveIdentity(storage, "a")).not.toThrow();
    expect(() => saveAccessCode(storage, "x")).not.toThrow();
    expect(() => markAdopted(storage)).not.toThrow();
    expect(() => clearDeviceSettings(storage)).not.toThrow();
  });
});
