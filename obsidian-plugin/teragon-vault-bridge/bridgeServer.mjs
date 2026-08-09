// TERAGON Vault Bridge — Phase 0 loopback HTTP bridge (transport/security spike).
// SINGLE SOURCE, imported by: the Obsidian plugin (main.ts), the local spike
// runner (run-spike.mjs), and the automated tests. READ-ONLY. GET-only.
// Binds 127.0.0.1 ONLY. Bearer-token auth. Explicit Origin allowlist. No writes,
// no arbitrary path params, no filesystem/shell. Fail-closed, sanitized errors.
import http from "node:http";
import crypto from "node:crypto";

export const BRIDGE_VERSION = "0.2.0-phase1";
const MAX_BODY_BYTES = 8 * 1024; // GET has no body; anything larger is rejected
const DEFAULT_MAX_NOTES = 200;
const MAX_NOTE_BYTES = 256 * 1024; // bounded note content; larger is truncated (never binary)

/**
 * Validate a Vault-relative Markdown path decoded from `/note/<encoded>`.
 * Read-only, defense-in-depth (the plugin re-checks existence via app.vault):
 * rejects traversal, absolute paths, `.obsidian` internals, and non-Markdown.
 * @returns {string|null} the normalized relative path, or null if unsafe.
 */
export function safeVaultNotePath(rel) {
  if (!rel || typeof rel !== "string" || rel.length > 1024 || rel.includes("\0")) return null;
  const norm = rel.replace(/\\/g, "/");
  if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm)) return null; // absolute
  if (norm.split("/").some((s) => s === "..")) return null; // parent traversal
  if (/(^|\/)\.obsidian(\/|$)/.test(norm)) return null; // Obsidian internals
  if (!/\.(md|markdown)$/i.test(norm)) return null; // Markdown only, no binary
  return norm;
}

/** Strong random pairing token (dev pairing only; never committed/logged). */
export function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * @param {{ token:string, allowedOrigins?:string[], vault:{getName:()=>string, listNotes:()=>Array<{path:string,basename:string,mtime?:number}>}, maxNotes?:number }} opts
 */
export function createBridge(opts) {
  const token = opts.token;
  const origins = new Set(opts.allowedOrigins ?? []);
  const vault = opts.vault;
  const maxNotes = opts.maxNotes ?? DEFAULT_MAX_NOTES;

  function corsHeaders(origin) {
    const h = { Vary: "Origin" };
    if (origin && origins.has(origin)) {
      h["Access-Control-Allow-Origin"] = origin;
      h["Access-Control-Allow-Methods"] = "GET, OPTIONS";
      h["Access-Control-Allow-Headers"] = "Authorization";
      // Chrome Private Network Access: allow the loopback preflight from a public/localhost page.
      h["Access-Control-Allow-Private-Network"] = "true";
    }
    return h;
  }
  function send(res, status, body, extra = {}) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...extra,
    });
    res.end(payload);
  }
  function isAuthed(req) {
    const m = /^Bearer (.+)$/.exec(req.headers["authorization"] || "");
    return !!m && timingSafeEq(m[1], token);
  }

  const server = http.createServer(async (req, res) => {
    const cid = crypto.randomUUID();
    const origin = req.headers.origin;
    const cors = corsHeaders(origin);
    // bounded body (GET should carry none)
    let bodySize = 0;
    req.on("data", (c) => {
      bodySize += c.length;
      if (bodySize > MAX_BODY_BYTES) req.destroy();
    });
    try {
      // Reject any request that carries an Origin we do not explicitly allow.
      if (origin && !origins.has(origin)) return send(res, 403, { error: "origin_not_allowed", cid }, cors);
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        return res.end();
      }
      // Phase 0 is GET-only — no POST/PUT/PATCH/DELETE (no write path anywhere).
      if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed", cid }, { ...cors, Allow: "GET, OPTIONS" });

      const url = new URL(req.url || "/", "http://127.0.0.1");
      // No arbitrary path/file params (no GET /file?path=...).
      if (url.searchParams.has("path") || url.searchParams.has("file")) return send(res, 400, { error: "bad_request", cid }, cors);
      const path = url.pathname;

      // /health — generic bridge health, NO auth, NO vault content.
      if (path === "/health") return send(res, 200, { ok: true, service: "teragon-vault-bridge", version: BRIDGE_VERSION, cid }, cors);

      // everything else requires the pairing token
      if (!isAuthed(req)) return send(res, 401, { error: "unauthorized", cid }, cors);

      if (path === "/connection") {
        return send(res, 200, { connected: true, vaultName: vault.getName(), version: BRIDGE_VERSION, readonly: true, cid }, cors);
      }
      if (path === "/notes") {
        const all = vault.listNotes();
        const notes = all.slice(0, maxNotes).map((n) => ({ path: n.path, basename: n.basename, mtime: n.mtime ?? null }));
        return send(res, 200, { notes, count: notes.length, truncated: all.length > maxNotes, cid }, cors);
      }
      // Bounded, validated single-note read (Phase 1). Path is carried in the URL
      // PATHNAME (never a query param), base64url/percent-decoded then re-validated.
      if (path.startsWith("/note/")) {
        let decoded;
        try {
          decoded = decodeURIComponent(path.slice("/note/".length));
        } catch {
          return send(res, 400, { error: "bad_request", cid }, cors);
        }
        const rel = safeVaultNotePath(decoded);
        if (!rel) return send(res, 400, { error: "bad_request", cid }, cors);
        if (typeof vault.readNote !== "function") return send(res, 404, { error: "not_found", cid }, cors);
        const note = await Promise.resolve(vault.readNote(rel));
        if (!note) return send(res, 404, { error: "not_found", cid }, cors);
        const raw = typeof note.content === "string" ? note.content : "";
        const truncated = raw.length > MAX_NOTE_BYTES;
        return send(
          res,
          200,
          {
            path: note.path,
            basename: note.basename,
            frontmatter: note.frontmatter ?? null,
            mtime: note.mtime ?? null,
            content: truncated ? raw.slice(0, MAX_NOTE_BYTES) : raw,
            truncated,
            cid,
          },
          cors,
        );
      }
      // Bounded local search (Phase 1). Query carried in the URL PATHNAME (never a
      // query param), percent-decoded, length-bounded. Read-only.
      if (path.startsWith("/search/")) {
        let q;
        try {
          q = decodeURIComponent(path.slice("/search/".length));
        } catch {
          return send(res, 400, { error: "bad_request", cid }, cors);
        }
        if (!q || q.length > 200) return send(res, 400, { error: "bad_request", cid }, cors);
        if (typeof vault.searchNotes !== "function") {
          return send(res, 200, { results: [], count: 0, truncated: false, cid }, cors);
        }
        const all = await Promise.resolve(vault.searchNotes(q));
        const results = all.slice(0, maxNotes).map((r) => ({
          path: r.path,
          basename: r.basename,
          snippet: typeof r.snippet === "string" ? r.snippet : "",
          mtime: r.mtime ?? null,
        }));
        return send(res, 200, { results, count: results.length, truncated: all.length > maxNotes, cid }, cors);
      }
      return send(res, 404, { error: "not_found", cid }, cors);
    } catch {
      // sanitized: never leak a stack trace or the token
      return send(res, 500, { error: "internal_error", cid }, cors);
    }
  });

  return {
    /** Bind LOOPBACK ONLY. port 0 = ephemeral (tests). */
    start(port = 0) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve(server.address()));
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
    address() {
      return server.address();
    },
  };
}
