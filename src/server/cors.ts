// TERAGON AI BUSINESS OS — CORS allowlist + security headers (Wave 5, W5-B).
// Same-origin requests carry no Origin (or the site's own) — always fine.
// Cross-origin: ONLY the local dev origins below are allowed; anything else
// gets NO Access-Control-Allow-Origin header (browser blocks the read).
import { CORRELATION_ID_HEADER } from "./correlation";

/** local dev ports: vite dev (5173), vite preview (4173), netlify dev (8888) */
export const DEV_ALLOWED_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8888",
  "http://127.0.0.1:8888",
];

export function isAllowedOrigin(origin: string | null, selfOrigin: string | null): boolean {
  if (origin === null) return true; // same-origin / non-browser
  if (selfOrigin !== null && origin === selfOrigin) return true;
  return DEV_ALLOWED_ORIGINS.includes(origin);
}

function selfOriginOf(req: Request): string | null {
  try {
    return new URL(req.url).origin;
  } catch {
    return null;
  }
}

/** CORS + security headers for a response to this request. */
export function responseHeaders(req: Request, correlationId: string): Headers {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
    "referrer-policy": "strict-origin-when-cross-origin",
    [CORRELATION_ID_HEADER]: correlationId,
  });
  const origin = req.headers.get("origin");
  if (origin !== null && isAllowedOrigin(origin, selfOriginOf(req))) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return headers;
}

/** Handle an OPTIONS preflight; null when the request is not a preflight. */
export function handlePreflight(req: Request, correlationId: string): Response | null {
  if (req.method !== "OPTIONS") return null;
  const headers = responseHeaders(req, correlationId);
  headers.delete("content-type");
  if (headers.has("access-control-allow-origin")) {
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set(
      "access-control-allow-headers",
      `content-type, ${CORRELATION_ID_HEADER}, x-teragon-auth`,
    );
    headers.set("access-control-max-age", "600");
  }
  return new Response(null, { status: 204, headers });
}
