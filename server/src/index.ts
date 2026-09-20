import { readDocument, writeDocument, type Db } from "./document";

/**
 * The slice of the D1 binding this worker uses. Declared locally so the worker
 * needs no extra type dependency and stays checked by the project's tsconfig.
 */
interface D1Result {
  meta?: { changes?: number };
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface Env {
  DB: D1Database;
  /** Shared secret both phones send as a bearer token. */
  ACCESS_CODE: string;
  /** Exact origin allowed to call this worker, e.g. https://nadja-lld.github.io */
  ALLOWED_ORIGIN: string;
}

const MAX_BODY_BYTES = 1024 * 1024;

function bindD1(db: D1Database): Db {
  return {
    first: (sql, params) =>
      db
        .prepare(sql)
        .bind(...params)
        .first(),
    run: async (sql, params) => {
      const result = await db
        .prepare(sql)
        .bind(...params)
        .run();
      return { changes: result.meta?.changes ?? 0 };
    },
  };
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

/**
 * Comparison that does not leak how much of the code was right through timing.
 */
function secretsMatch(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < given.length; i += 1) {
    difference |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}

function isAuthorised(request: Request, env: Env): boolean {
  const header = request.headers.get("Authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const code = env.ACCESS_CODE ?? "";
  if (code === "") return false;
  return secretsMatch(header.slice(prefix.length), code);
}

function tooLarge(request: Request): boolean {
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  return Number.isFinite(declared) && declared > MAX_BODY_BYTES;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    if (url.pathname !== "/state") {
      return json({ error: "not found" }, 404, env);
    }
    if (!isAuthorised(request, env)) {
      return json({ error: "unauthorised" }, 401, env);
    }

    const db = bindD1(env.DB);

    if (request.method === "GET") {
      const document = await readDocument(db);
      if (document === null) return json({ version: 0, state: null }, 200, env);
      return json(document, 200, env);
    }

    if (request.method === "PUT") {
      if (tooLarge(request)) return json({ error: "payload too large" }, 413, env);

      let body: { baseVersion?: unknown; state?: unknown };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: "invalid JSON" }, 400, env);
      }
      if (typeof body.baseVersion !== "number" || !Number.isInteger(body.baseVersion)) {
        return json({ error: "baseVersion must be an integer" }, 400, env);
      }
      if (body.state === undefined || body.state === null) {
        return json({ error: "state is required" }, 400, env);
      }

      const result = await writeDocument(
        db,
        body.baseVersion,
        body.state,
        new Date().toISOString(),
      );
      if (result.ok) return json({ version: result.version }, 200, env);
      return json(result.current ?? { version: 0, state: null }, 409, env);
    }

    return json({ error: "method not allowed" }, 405, env);
  },
};
