import type { JsonValue } from "./validation";
import { authorized, parseCreateInput } from "./validation";
import { viewer } from "./viewer";

interface Env {
  readonly DB: D1Database;
  readonly SHARES: R2Bucket;
  readonly SHARE_INGEST_TOKEN?: string;
  readonly SHARE_ADMIN_TOKEN?: string;
  readonly ALLOWED_ORIGIN?: string;
  readonly RATE_LIMIT_PER_MINUTE?: string;
  readonly RATE_LIMITER: RateLimit;
}
const json = (body: JsonValue, status = 200, origin = ""): Response =>
  Response.json(body, {
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
    status,
  });
const error = (code: string, status: number, origin: string): Response =>
  json({ error: { code, message: code.replaceAll("_", " ") } }, status, origin);
const headers = (origin: string): HeadersInit => ({
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Origin": origin,
  "Content-Security-Policy":
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});
const isValidationError = (
  value: ReturnType<typeof parseCreateInput>
): value is Exclude<ReturnType<typeof parseCreateInput>, object> => {
  switch (value) {
    case "invalid_content_type": {
      return true;
    }
    case "invalid_expiry": {
      return true;
    }
    case "invalid_id": {
      return true;
    }
    case "invalid_json": {
      return true;
    }
    case "invalid_shape": {
      return true;
    }
    case "payload_too_large": {
      return true;
    }
    default: {
      return false;
    }
  }
};

const createShare = async (
  request: Request,
  env: Env,
  origin: string
): Promise<Response> => {
  if (!(await authorized(request, env.SHARE_INGEST_TOKEN))) {
    return error("unauthorized", 401, origin);
  }
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const now = Date.now();
  const limited = await env.RATE_LIMITER.limit({ key: ip });
  if (!limited.success) {
    return error("rate_limited", 429, origin);
  }
  if (
    request.headers.get("Content-Type")?.split(";")[0] !== "application/json"
  ) {
    return error("invalid_content_type", 415, origin);
  }
  if (Number(request.headers.get("Content-Length") ?? 0) > 5_242_880) {
    return error("payload_too_large", 413, origin);
  }
  let value: JsonValue;
  try {
    // SAFETY: Request.json() only accepts JSON values at this HTTP boundary.
    value = (await request.json()) as JsonValue;
  } catch {
    return error("invalid_json", 400, origin);
  }
  const parsed = parseCreateInput(value, now, 5_242_880);
  if (isValidationError(parsed)) {
    return error(parsed, parsed === "payload_too_large" ? 413 : 400, origin);
  }
  const objectKey = `shares/${parsed.id}`;
  await env.SHARES.put(objectKey, JSON.stringify(parsed.payload), {
    httpMetadata: { contentType: "application/json" },
  });
  try {
    await env.DB.prepare(
      "INSERT INTO shares (id, object_key, expires_at, created_at, state) VALUES (?, ?, ?, ?, 'active')"
    )
      .bind(parsed.id, objectKey, parsed.expiresAt, now)
      .run();
  } catch (dbError) {
    await env.SHARES.delete(objectKey);
    throw dbError;
  }
  return json({ expiresAt: parsed.expiresAt, id: parsed.id }, 201, origin);
};

const readShare = async (
  env: Env,
  id: string,
  origin: string
): Promise<Response> => {
  const row = await env.DB.prepare(
    "SELECT object_key, expires_at, state FROM shares WHERE id = ?"
  )
    .bind(id)
    .first<{ object_key: string; expires_at: number; state: string }>();
  if (!row || row.state !== "active" || row.expires_at <= Date.now()) {
    return error("not_found", 404, origin);
  }
  const object = await env.SHARES.get(row.object_key);
  if (!object) {
    return error("not_found", 404, origin);
  }
  return new Response(await object.text(), {
    headers: {
      ...headers(origin),
      "Cache-Control": "private, max-age=60",
      "Content-Type": "application/json",
    },
  });
};

const deleteShare = async (
  request: Request,
  env: Env,
  id: string,
  origin: string
): Promise<Response> => {
  if (!authorized(request, env.SHARE_ADMIN_TOKEN)) {
    return error("unauthorized", 401, origin);
  }
  const row = await env.DB.prepare("SELECT object_key FROM shares WHERE id = ?")
    .bind(id)
    .first<{ object_key: string }>();
  if (!row) {
    return error("not_found", 404, origin);
  }
  await env.SHARES.delete(row.object_key);
  await env.DB.prepare("UPDATE shares SET state = 'deleted' WHERE id = ?")
    .bind(id)
    .run();
  return json({ deleted: true }, 200, origin);
};

/** Cloudflare Worker entrypoint for encrypted shares. */
export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const origin = env.ALLOWED_ORIGIN ?? "";
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: headers(origin), status: 204 });
    }
    const url = new URL(request.url);
    const match = /^\/api\/shares\/(?<id>[A-Za-z0-9_-]{20,96})$/u.exec(
      url.pathname
    );
    if (url.pathname === "/s/" || url.pathname.startsWith("/s/")) {
      return viewer(origin);
    }
    if (url.pathname === "/api/shares" && request.method === "POST") {
      return createShare(request, env, origin);
    }
    if (match && request.method === "GET") {
      return readShare(env, match.groups?.id ?? "", origin);
    }
    if (match && request.method === "DELETE") {
      return deleteShare(request, env, match.groups?.id ?? "", origin);
    }
    return error("not_found", 404, origin);
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const expired = await env.DB.prepare(
      "SELECT id, object_key FROM shares WHERE state = 'active' AND expires_at <= ? LIMIT 100"
    )
      .bind(Date.now())
      .all<{ id: string; object_key: string }>();
    await Promise.all(
      expired.results.map(async (row) => {
        await env.SHARES.delete(row.object_key);
        await env.DB.prepare("UPDATE shares SET state = 'expired' WHERE id = ?")
          .bind(row.id)
          .run();
      })
    );
  },
};
