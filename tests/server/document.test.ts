import { describe, expect, it } from "vitest";
import { readDocument, writeDocument, type Db } from "../../server/src/document";

const NOW = "2026-09-20T10:00:00.000Z";

/** An in-memory stand-in for the single-row D1 table. */
function fakeDb(): Db & { rows: Map<string, Record<string, unknown>> } {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    first: (sql, params) => {
      expect(sql).toContain("SELECT");
      return Promise.resolve(rows.get(String(params[0])) ?? null);
    },
    run: (sql, params) => {
      if (sql.startsWith("UPDATE")) {
        const [version, state, updatedAt, id, baseVersion] = params;
        const row = rows.get(String(id));
        if (!row || row.version !== baseVersion) return Promise.resolve({ changes: 0 });
        rows.set(String(id), { version, state, updated_at: updatedAt });
        return Promise.resolve({ changes: 1 });
      }
      const [id, version, state, updatedAt] = params;
      if (rows.has(String(id))) return Promise.reject(new Error("UNIQUE constraint failed"));
      rows.set(String(id), { version, state, updated_at: updatedAt });
      return Promise.resolve({ changes: 1 });
    },
  };
}

describe("readDocument", () => {
  it("returns null when nothing has been stored", async () => {
    expect(await readDocument(fakeDb())).toBeNull();
  });

  it("returns the parsed document", async () => {
    const db = fakeDb();
    await writeDocument(db, 0, { hello: "world" }, NOW);
    expect(await readDocument(db)).toEqual({ version: 1, state: { hello: "world" } });
  });
});

describe("writeDocument", () => {
  it("creates the first document from base version zero", async () => {
    const result = await writeDocument(fakeDb(), 0, { a: 1 }, NOW);
    expect(result).toEqual({ ok: true, version: 1 });
  });

  it("increments the version on a matching base", async () => {
    const db = fakeDb();
    await writeDocument(db, 0, { a: 1 }, NOW);
    expect(await writeDocument(db, 1, { a: 2 }, NOW)).toEqual({ ok: true, version: 2 });
  });

  it("refuses a stale base version and hands back the current document", async () => {
    const db = fakeDb();
    await writeDocument(db, 0, { a: 1 }, NOW);
    await writeDocument(db, 1, { a: 2 }, NOW);
    const result = await writeDocument(db, 1, { a: 3 }, NOW);
    expect(result).toEqual({ ok: false, current: { version: 2, state: { a: 2 } } });
  });

  it("lets only the first of two writers from the same base win", async () => {
    const db = fakeDb();
    await writeDocument(db, 0, { a: 1 }, NOW);
    const first = await writeDocument(db, 1, { who: "phone-1" }, NOW);
    const second = await writeDocument(db, 1, { who: "phone-2" }, NOW);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(await readDocument(db)).toEqual({ version: 2, state: { who: "phone-1" } });
  });

  it("reports a conflict when two devices both try to create the document", async () => {
    const db = fakeDb();
    await writeDocument(db, 0, { who: "phone-1" }, NOW);
    const second = await writeDocument(db, 0, { who: "phone-2" }, NOW);
    expect(second).toEqual({ ok: false, current: { version: 1, state: { who: "phone-1" } } });
  });
});
