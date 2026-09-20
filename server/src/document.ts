export interface StoredDocument {
  version: number;
  state: unknown;
}

/**
 * The slice of D1 this module needs. Keeping it to two methods is what lets the
 * version logic be tested without a Workers runtime.
 */
export interface Db {
  first(sql: string, params: unknown[]): Promise<Record<string, unknown> | null>;
  run(sql: string, params: unknown[]): Promise<{ changes: number }>;
}

export const DOCUMENT_ID = "shared";

export type WriteResult =
  { ok: true; version: number } | { ok: false; current: StoredDocument | null };

export async function readDocument(db: Db): Promise<StoredDocument | null> {
  const row = await db.first("SELECT version, state FROM documents WHERE id = ?", [DOCUMENT_ID]);
  if (row === null) return null;
  return { version: Number(row.version), state: JSON.parse(String(row.state)) };
}

/**
 * Writes only if the document still carries `baseVersion`. A caller that lost
 * the race gets the current document back instead of overwriting it.
 */
export async function writeDocument(
  db: Db,
  baseVersion: number,
  state: unknown,
  nowIso: string,
): Promise<WriteResult> {
  const payload = JSON.stringify(state);
  const nextVersion = baseVersion + 1;

  const updated = await db.run(
    "UPDATE documents SET version = ?, state = ?, updated_at = ? WHERE id = ? AND version = ?",
    [nextVersion, payload, nowIso, DOCUMENT_ID, baseVersion],
  );
  if (updated.changes > 0) return { ok: true, version: nextVersion };

  if (baseVersion === 0) {
    // No row yet: the first device to sync creates it. A second one racing here
    // hits the primary key and is told to merge instead.
    try {
      const inserted = await db.run(
        "INSERT INTO documents (id, version, state, updated_at) VALUES (?, ?, ?, ?)",
        [DOCUMENT_ID, nextVersion, payload, nowIso],
      );
      if (inserted.changes > 0) return { ok: true, version: nextVersion };
    } catch {
      // fall through to reporting the conflict
    }
  }

  return { ok: false, current: await readDocument(db) };
}
