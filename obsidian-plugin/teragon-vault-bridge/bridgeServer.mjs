// TERAGON Vault Bridge — loopback HTTP bridge. SINGLE SOURCE, imported by the
// Obsidian plugin (main.ts), the local spike runner, and the automated tests.
// Binds 127.0.0.1 ONLY. Bearer-token auth. Explicit Origin allowlist (no wildcard).
// READS are GET-only. WRITES (Phase 3) are three narrowly-scoped POST capability
// endpoints — human-approved, hash-guarded (conflict), and idempotent (mutationId).
// No generic filesystem API, no shell, no DELETE/RENAME/MOVE. Fail-closed, sanitized.
import http from "node:http";
import crypto from "node:crypto";

export const BRIDGE_VERSION = "0.3.0-phase3";
const MAX_WRITE_BYTES = 256 * 1024; // bounded write request body
const DEFAULT_MAX_NOTES = 200;
const MAX_NOTE_BYTES = 256 * 1024; // bounded note content; larger is truncated (never binary)
const MAX_GRAPH_NODES = 300; // bounded knowledge-graph nodes (never a whole-vault dump)
const MAX_GRAPH_EDGES = 1500; // bounded knowledge-graph edges

/** Stable content hash shared by plugin + tests (TERAGON mirrors this with SHA-256). */
export function sha256(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

/** HMAC-SHA256 (hex) — the write-capability MAC. TERAGON mirrors this with Web Crypto. */
export function hmacSha256(key, msg) {
  return crypto.createHmac("sha256", String(key)).update(String(msg), "utf8").digest("hex");
}

/**
 * Canonical write-capability message. MUST match TERAGON's adapter byte-for-byte.
 * Binds the capability to exactly one op / path / mutation / content / expiry.
 */
export function writeCapabilityMessage(op, path, mutationId, contentHash, exp) {
  return [op, path, mutationId, contentHash, String(exp)].join("\n");
}

const WRITE_CAP_MAX_TTL_MS = 10 * 60 * 1000; // reject capabilities dated too far ahead

/**
 * Validate a Vault-relative Markdown path. Defense-in-depth (the plugin re-checks
 * via app.vault): rejects traversal, absolute paths, `.obsidian` internals, non-Markdown.
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

// --- Trusted Device Pairing (asymmetric device identity) -------------------
// The persistent trust is an asymmetric device identity, NOT a persistent bearer.
// The plugin stores only the device PUBLIC key; the browser holds a non-exportable
// private key. After a plugin restart the browser proves possession via a signed
// challenge and receives a NEW short-lived session bearer — no manual re-pairing.
export const TDP_VERSION = "tdp-1";
const SESSION_TTL_MS = 30 * 60 * 1000; // short-lived bridge session bearer
const CHALLENGE_TTL_MS = 60 * 1000; // one-time challenge lifetime
const MAX_TRUSTED_DEVICES = 10; // bounded registry (registration guard)
const MAX_LIVE_CHALLENGES = 100; // bounded in-memory challenge map

/** Canonical, unambiguous challenge payload. MUST match the TERAGON client byte-for-byte. */
export function challengePayload({ deviceId, challengeId, nonce, bridgeInstanceId, origin, expiresAt }) {
  return [TDP_VERSION, deviceId, challengeId, nonce, bridgeInstanceId, origin, String(expiresAt)].join("\n");
}

/** Short public-key fingerprint (hex) for non-secret display/audit — never the private key. */
export function deviceFingerprint(publicKeyJwk) {
  const canon = JSON.stringify([publicKeyJwk.kty, publicKeyJwk.crv, publicKeyJwk.x, publicKeyJwk.y]);
  return sha256(canon);
}

/** Verify an ECDSA P-256 / SHA-256 signature (WebCrypto raw IEEE-P1363) over `payload`. */
export function verifyDeviceSignature(publicKeyJwk, payload, signatureB64url) {
  try {
    if (!publicKeyJwk || publicKeyJwk.kty !== "EC" || publicKeyJwk.crv !== "P-256") return false;
    const key = crypto.createPublicKey({ key: publicKeyJwk, format: "jwk" });
    const sig = Buffer.from(String(signatureB64url), "base64url");
    if (sig.length !== 64) return false; // P-256 raw r||s
    return crypto.verify("sha256", Buffer.from(payload, "utf8"), { key, dsaEncoding: "ieee-p1363" }, sig);
  } catch {
    return false;
  }
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Read a bounded request body; resolves null if it exceeds the limit or errors.
 * An over-limit body drains (up to a hard cap) so the caller can answer 413 cleanly. */
function readBody(req, limit) {
  return new Promise((resolve) => {
    let size = 0;
    let over = false;
    let done = false;
    const chunks = [];
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        over = true;
        if (size > limit * 4) {
          finish(null);
          req.destroy();
        }
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => finish(over ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => finish(null));
    req.on("aborted", () => finish(null));
  });
}

const WRITE_PATHS = new Set(["/write/create", "/write/update", "/write/append"]);

export function createBridge(opts) {
  const token = opts.token;
  // SEPARATE write-authorization secret (NOT the pairing token). Writes require a
  // per-request HMAC capability keyed by this. A holder of only the pairing token
  // cannot mint one, so the pairing token alone can never mutate the Vault.
  const writeKey = typeof opts.writeKey === "string" ? opts.writeKey : "";
  const origins = new Set(opts.allowedOrigins ?? []);
  const vault = opts.vault;
  const maxNotes = opts.maxNotes ?? DEFAULT_MAX_NOTES;
  // Writes are STAGED to the plugin, which requires a LOCAL HUMAN CONFIRMATION inside
  // Obsidian before app.vault is touched. No client-held secret can authorize a write.
  const canWrite = typeof vault.stageWrite === "function" && writeKey.length > 0;
  // Idempotency ledger for this bridge instance (per plugin load / session).
  const appliedMutations = new Map();

  // --- Trusted Device Pairing state (per bridge runtime) --------------------
  // A fresh random instance id per plugin load: challenge signatures bind to it, so a
  // signature captured for one runtime cannot be replayed against a future one.
  const bridgeInstanceId = crypto.randomUUID();
  // Optional persistent trust registry (public-device info only), supplied by the plugin
  // (loadData/saveData) or tests. When absent, the trusted-device endpoints are inert and
  // the bridge behaves exactly as before (backward compatible).
  const trust = opts.trustStore ?? null;
  const sessions = new Map(); // sessionBearer -> { deviceId, exp }  (short-lived, in-memory)
  const challenges = new Map(); // challengeId -> { deviceId, nonce, exp, origin }  (one-time)
  // The pairing token bootstraps trust ONCE per plugin load: after the first NEW device
  // registers, the token can no longer enrol a DIFFERENT device (re-pairing the same
  // device stays idempotent). Enrolling another device requires a fresh pairing token
  // (a plugin reload rotates it).
  let registrationOpen = true;

  function pruneSessions(now) {
    for (const [k, v] of sessions) if (v.exp <= now) sessions.delete(k);
  }
  function pruneChallenges(now) {
    for (const [k, v] of challenges) if (v.exp <= now) challenges.delete(k);
  }
  function issueSession(deviceId, now) {
    pruneSessions(now);
    const sessionToken = generateToken();
    const exp = now + SESSION_TTL_MS;
    sessions.set(sessionToken, { deviceId, exp });
    return { sessionToken, expiresAt: exp };
  }

  function corsHeaders(origin) {
    const h = { Vary: "Origin" };
    if (origin && origins.has(origin)) {
      h["Access-Control-Allow-Origin"] = origin;
      h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
      h["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
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
  function bearerOf(req) {
    const m = /^Bearer (.+)$/.exec(req.headers["authorization"] || "");
    return m ? m[1] : null;
  }
  // A request is authed by EITHER the bootstrap pairing token (backward compatible)
  // OR a live, non-expired trusted-device session bearer.
  function isAuthed(req) {
    const b = bearerOf(req);
    if (!b) return false;
    if (timingSafeEq(b, token)) return true;
    const s = sessions.get(b);
    return !!s && s.exp > Date.now();
  }

  async function handleWrite(res, pathname, body, cors, cid) {
    if (!canWrite) return send(res, 404, { error: "not_found", cid }, cors);
    if (!body || typeof body !== "object") return send(res, 400, { error: "bad_request", cid }, cors);
    const op = pathname.slice("/write/".length); // create | update | append
    const mutationId = body.mutationId;
    if (typeof mutationId !== "string" || mutationId.length < 8 || mutationId.length > 200) {
      return send(res, 400, { error: "bad_request", cid }, cors);
    }
    const rel = safeVaultNotePath(typeof body.path === "string" ? body.path : "");
    if (!rel) return send(res, 400, { error: "bad_request", cid }, cors);

    // Op-specific schema → the exact bytes that authorization binds to.
    let input;
    let contentHash;
    if (op === "create") {
      if (typeof body.content !== "string") return send(res, 400, { error: "bad_request", cid }, cors);
      input = { op, rel, content: body.content };
      contentHash = sha256(body.content);
    } else if (op === "update") {
      if (typeof body.content !== "string" || typeof body.expectedHash !== "string") return send(res, 400, { error: "bad_request", cid }, cors);
      input = { op, rel, content: body.content, expectedHash: body.expectedHash };
      contentHash = sha256(body.content);
    } else if (op === "append") {
      if (typeof body.block !== "string" || typeof body.expectedHash !== "string") return send(res, 400, { error: "bad_request", cid }, cors);
      input = { op, rel, block: body.block, expectedHash: body.expectedHash };
      contentHash = sha256(body.block);
    } else {
      return send(res, 404, { error: "not_found", cid }, cors);
    }

    // WRITE AUTHORIZATION (REQUIRED). The pairing token alone is INSUFFICIENT to mutate.
    // A single-use, short-lived HMAC capability — keyed by the SEPARATE writeKey and bound
    // to exactly this op/path/mutationId/contentHash/expiry — must verify first.
    const exp = body.exp;
    const capability = body.capability;
    if (typeof capability !== "string" || typeof exp !== "number") return send(res, 403, { error: "write_unauthorized", cid }, cors);
    const now = Date.now();
    if (!(exp > now) || exp > now + WRITE_CAP_MAX_TTL_MS) return send(res, 403, { error: "write_unauthorized", cid }, cors);
    const expected = hmacSha256(writeKey, writeCapabilityMessage(op, rel, mutationId, contentHash, exp));
    if (!timingSafeEq(capability, expected)) return send(res, 403, { error: "write_unauthorized", cid }, cors);

    // Idempotency (only after the capability verified): never apply the same mutationId twice.
    if (appliedMutations.has(mutationId)) {
      return send(res, 200, { ...appliedMutations.get(mutationId), idempotent: true, cid }, cors);
    }

    // STAGE the intent — the plugin blocks here until a HUMAN approves it INSIDE Obsidian
    // (or rejects / times out). The pairing token + writeKey get you this far; only the
    // in-Obsidian human decision can cause app.vault to be touched.
    const result = await Promise.resolve(vault.stageWrite(input));
    if (!result || typeof result !== "object") return send(res, 500, { error: "internal_error", cid }, cors);
    if (result.code === "REJECTED") return send(res, 403, { error: "write_rejected", cid }, cors);
    if (result.code === "EXPIRED") return send(res, 403, { error: "write_expired", cid }, cors);
    if (result.code === "CONFLICT") return send(res, 409, { error: "conflict", currentHash: result.currentHash ?? null, cid }, cors);
    if (result.code === "EXISTS") return send(res, 409, { error: "already_exists", cid }, cors);
    if (result.code === "NOT_FOUND") return send(res, 404, { error: "not_found", cid }, cors);
    if (!result.ok) return send(res, 400, { error: "write_failed", cid }, cors);

    const applied = { ok: true, applied: true, op, path: result.path, hash: result.hash, mutationId };
    appliedMutations.set(mutationId, applied);
    return send(res, 200, { ...applied, cid }, cors);
  }

  // --- Trusted Device Pairing endpoints -------------------------------------
  // register: bootstrap the trust (requires the one-time pairing token) by storing the
  // device PUBLIC key. challenge/verify: unauthenticated by bearer — the device proves
  // possession of its non-exportable private key, and only then receives a new session.
  async function handleAuth(res, pathname, req, body, cors, cid, origin) {
    if (!trust) return send(res, 404, { error: "not_found", cid }, cors);
    // Trusted-device auth is bound to an explicitly allowed Origin (defense in depth;
    // the global gate already rejects a present-but-disallowed Origin).
    if (!origin || !origins.has(origin)) return send(res, 403, { error: "origin_not_allowed", cid }, cors);
    if (!body || typeof body !== "object") return send(res, 400, { error: "bad_request", cid }, cors);
    const now = Date.now();

    if (pathname === "/auth/register") {
      // The one-time pairing token is the bootstrap proof (a session bearer cannot register).
      const b = bearerOf(req);
      if (!b || !timingSafeEq(b, token)) return send(res, 401, { error: "unauthorized", cid }, cors);
      const { deviceId, publicKey, label } = body;
      if (typeof deviceId !== "string" || deviceId.length < 8 || deviceId.length > 200) return send(res, 400, { error: "bad_request", cid }, cors);
      if (!publicKey || publicKey.kty !== "EC" || publicKey.crv !== "P-256" || typeof publicKey.x !== "string" || typeof publicKey.y !== "string") {
        return send(res, 400, { error: "bad_request", cid }, cors);
      }
      const existing = trust.get(deviceId);
      // A used pairing code cannot enrol a NEW (different) device this plugin load.
      if (!existing && !registrationOpen) return send(res, 403, { error: "pairing_consumed", cid }, cors);
      if (!existing && trust.list().filter((d) => !d.revoked).length >= MAX_TRUSTED_DEVICES) {
        return send(res, 403, { error: "too_many_devices", cid }, cors);
      }
      const fingerprint = deviceFingerprint(publicKey);
      const record = {
        deviceId,
        publicKey,
        fingerprint,
        label: typeof label === "string" ? label.slice(0, 80) : "TERAGON device",
        origin,
        createdAt: existing?.createdAt ?? now,
        lastSeenAt: now,
        revoked: false,
      };
      trust.put(record);
      if (!existing) registrationOpen = false; // pairing token consumed for new-device enrolment
      const { sessionToken, expiresAt } = issueSession(deviceId, now);
      return send(res, 200, { ok: true, deviceId, fingerprint, sessionToken, expiresAt, bridgeInstanceId, cid }, cors);
    }

    if (pathname === "/auth/challenge") {
      const { deviceId } = body;
      const dev = typeof deviceId === "string" ? trust.get(deviceId) : null;
      if (!dev || dev.revoked) return send(res, 401, { error: "unknown_device", cid }, cors);
      if (dev.origin && dev.origin !== origin) return send(res, 403, { error: "origin_mismatch", cid }, cors);
      pruneChallenges(now);
      if (challenges.size >= MAX_LIVE_CHALLENGES) return send(res, 429, { error: "too_many_challenges", cid }, cors);
      const challengeId = crypto.randomUUID();
      const nonce = crypto.randomBytes(32).toString("base64url");
      const expiresAt = now + CHALLENGE_TTL_MS;
      challenges.set(challengeId, { deviceId, nonce, exp: expiresAt, origin });
      return send(res, 200, { challengeId, nonce, expiresAt, bridgeInstanceId, cid }, cors);
    }

    if (pathname === "/auth/verify") {
      const { deviceId, challengeId, signature } = body;
      if (typeof deviceId !== "string" || typeof challengeId !== "string" || typeof signature !== "string") {
        return send(res, 400, { error: "bad_request", cid }, cors);
      }
      const ch = challenges.get(challengeId);
      // Consume the challenge on ANY verify attempt so it can never be replayed.
      if (ch) challenges.delete(challengeId);
      if (!ch || ch.exp <= now) return send(res, 401, { error: "challenge_invalid", cid }, cors);
      if (ch.deviceId !== deviceId || ch.origin !== origin) return send(res, 401, { error: "challenge_invalid", cid }, cors);
      const dev = trust.get(deviceId);
      if (!dev || dev.revoked) return send(res, 401, { error: "unknown_device", cid }, cors);
      const payload = challengePayload({ deviceId, challengeId, nonce: ch.nonce, bridgeInstanceId, origin, expiresAt: ch.exp });
      if (!verifyDeviceSignature(dev.publicKey, payload, signature)) return send(res, 401, { error: "bad_signature", cid }, cors);
      if (typeof trust.touch === "function") trust.touch(deviceId, now);
      const { sessionToken, expiresAt } = issueSession(deviceId, now);
      return send(res, 200, { ok: true, sessionToken, expiresAt, bridgeInstanceId, cid }, cors);
    }

    return send(res, 404, { error: "not_found", cid }, cors);
  }

  const AUTH_PATHS = new Set(["/auth/register", "/auth/challenge", "/auth/verify"]);

  const server = http.createServer(async (req, res) => {
    const cid = crypto.randomUUID();
    const origin = req.headers.origin;
    const cors = corsHeaders(origin);
    try {
      // Reject any request that carries an Origin we do not explicitly allow.
      if (origin && !origins.has(origin)) return send(res, 403, { error: "origin_not_allowed", cid }, cors);
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        return res.end();
      }
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = url.pathname;

      // /health — generic bridge health, NO auth, NO vault content. GET only.
      if (pathname === "/health") {
        if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed", cid }, { ...cors, Allow: "GET, OPTIONS" });
        return send(res, 200, { ok: true, service: "teragon-vault-bridge", version: BRIDGE_VERSION, cid }, cors);
      }

      // Trusted Device Pairing endpoints — POST only, bounded body. These authenticate
      // by device signature (challenge/verify) or the bootstrap token (register), NOT by
      // a session bearer, so they sit BEFORE the session gate.
      if (AUTH_PATHS.has(pathname)) {
        if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed", cid }, { ...cors, Allow: "POST, OPTIONS" });
        const raw = await readBody(req, MAX_WRITE_BYTES);
        if (raw === null) return send(res, 413, { error: "payload_too_large", cid }, cors);
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return send(res, 400, { error: "bad_request", cid }, cors);
        }
        return handleAuth(res, pathname, req, parsed, cors, cid, origin);
      }

      // Everything else requires the pairing token OR a live trusted-device session.
      if (!isAuthed(req)) return send(res, 401, { error: "unauthorized", cid }, cors);

      // WRITE capability endpoints (Phase 3) — POST only, bounded body.
      if (WRITE_PATHS.has(pathname)) {
        if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed", cid }, { ...cors, Allow: "POST, OPTIONS" });
        const raw = await readBody(req, MAX_WRITE_BYTES);
        if (raw === null) return send(res, 413, { error: "payload_too_large", cid }, cors);
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return send(res, 400, { error: "bad_request", cid }, cors);
        }
        return handleWrite(res, pathname, parsed, cors, cid);
      }

      // READ endpoints — GET only.
      if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed", cid }, { ...cors, Allow: "GET, OPTIONS" });
      if (url.searchParams.has("path") || url.searchParams.has("file")) return send(res, 400, { error: "bad_request", cid }, cors);

      if (pathname === "/connection") {
        return send(res, 200, { connected: true, vaultName: vault.getName(), version: BRIDGE_VERSION, readonly: !canWrite, writeEnabled: canWrite, cid }, cors);
      }
      if (pathname === "/notes") {
        const all = vault.listNotes();
        const notes = all.slice(0, maxNotes).map((n) => ({ path: n.path, basename: n.basename, mtime: n.mtime ?? null }));
        return send(res, 200, { notes, count: notes.length, truncated: all.length > maxNotes, cid }, cors);
      }
      // Bounded knowledge-graph (nodes + link edges) from Vault metadata. READ-ONLY,
      // no note bodies, Markdown-only, no writeKey — independent of the write capability.
      if (pathname === "/graph") {
        if (typeof vault.getGraph !== "function") {
          return send(res, 200, { nodes: [], edges: [], count: 0, edgeCount: 0, truncated: false, cid }, cors);
        }
        const g = await Promise.resolve(vault.getGraph(MAX_GRAPH_NODES, MAX_GRAPH_EDGES));
        const nodes = (g.nodes ?? []).slice(0, MAX_GRAPH_NODES);
        const edges = (g.edges ?? []).slice(0, MAX_GRAPH_EDGES);
        return send(res, 200, { nodes, edges, count: nodes.length, edgeCount: edges.length, truncated: !!g.truncated, cid }, cors);
      }
      if (pathname.startsWith("/note/")) {
        let decoded;
        try {
          decoded = decodeURIComponent(pathname.slice("/note/".length));
        } catch {
          return send(res, 400, { error: "bad_request", cid }, cors);
        }
        const rel = safeVaultNotePath(decoded);
        if (!rel) return send(res, 400, { error: "bad_request", cid }, cors);
        if (typeof vault.readNote !== "function") return send(res, 404, { error: "not_found", cid }, cors);
        const note = await Promise.resolve(vault.readNote(rel));
        if (!note) return send(res, 404, { error: "not_found", cid }, cors);
        const rawContent = typeof note.content === "string" ? note.content : "";
        const truncated = rawContent.length > MAX_NOTE_BYTES;
        return send(
          res,
          200,
          {
            path: note.path,
            basename: note.basename,
            frontmatter: note.frontmatter ?? null,
            mtime: note.mtime ?? null,
            content: truncated ? rawContent.slice(0, MAX_NOTE_BYTES) : rawContent,
            truncated,
            cid,
          },
          cors,
        );
      }
      if (pathname.startsWith("/search/")) {
        let q;
        try {
          q = decodeURIComponent(pathname.slice("/search/".length));
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
      return send(res, 500, { error: "internal_error", cid }, cors);
    }
  });

  return {
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
