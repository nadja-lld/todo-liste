import { parseAppState } from "../domain/schema";
import type { AppState } from "../domain/types";

export interface RemoteDocument {
  version: number;
  state: AppState;
}

/** The access code was refused. Retrying will not help; the user must act. */
export class SyncAuthError extends Error {
  constructor() {
    super("access code rejected");
    this.name = "SyncAuthError";
  }
}

/** The server answered, but not with something we can use. */
export class SyncProtocolError extends Error {
  constructor(detail: string) {
    super(`unexpected sync response: ${detail}`);
    this.name = "SyncProtocolError";
  }
}

export type PutResult =
  { ok: true; version: number } | { ok: false; current: RemoteDocument | null };

export interface SyncClient {
  /** null when the server holds no document yet. */
  get(): Promise<RemoteDocument | null>;
  put(baseVersion: number, state: AppState): Promise<PutResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Turns a response body into a document. A corrupt or stale server document must
 * not be allowed onto the device, so it goes through the same validator as
 * anything read from storage.
 */
function toDocument(body: unknown): RemoteDocument | null {
  if (!isRecord(body)) throw new SyncProtocolError("body is not an object");
  if (typeof body.version !== "number") throw new SyncProtocolError("version is missing");
  if (body.state === null || body.state === undefined) return null;
  const parsed = parseAppState(body.state);
  if (!parsed.ok) throw new SyncProtocolError(parsed.error);
  return { version: body.version, state: parsed.state };
}

export function createSyncClient(
  baseUrl: string,
  accessCode: string,
  fetchImpl: typeof fetch = fetch,
): SyncClient {
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/state`;
  const headers = {
    Authorization: `Bearer ${accessCode}`,
    "Content-Type": "application/json",
  };

  return {
    async get(): Promise<RemoteDocument | null> {
      const response = await fetchImpl(endpoint, { method: "GET", headers });
      if (response.status === 401) throw new SyncAuthError();
      if (response.status === 404) return null;
      if (!response.ok) throw new SyncProtocolError(`status ${response.status}`);
      return toDocument(await response.json());
    },

    async put(baseVersion: number, state: AppState): Promise<PutResult> {
      const response = await fetchImpl(endpoint, {
        method: "PUT",
        headers,
        body: JSON.stringify({ baseVersion, state }),
      });
      if (response.status === 401) throw new SyncAuthError();
      if (response.status === 409) return { ok: false, current: toDocument(await response.json()) };
      if (!response.ok) throw new SyncProtocolError(`status ${response.status}`);
      const body: unknown = await response.json();
      if (!isRecord(body) || typeof body.version !== "number") {
        throw new SyncProtocolError("version is missing");
      }
      return { ok: true, version: body.version };
    },
  };
}
