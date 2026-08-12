var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => TeragonVaultBridge
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// bridgeServer.mjs
var import_node_http = __toESM(require("node:http"), 1);
var import_node_crypto = __toESM(require("node:crypto"), 1);
var BRIDGE_VERSION = "0.3.0-phase3";
var MAX_WRITE_BYTES = 256 * 1024;
var DEFAULT_MAX_NOTES = 200;
var MAX_NOTE_BYTES = 256 * 1024;
var MAX_GRAPH_NODES = 300;
var MAX_GRAPH_EDGES = 1500;
function sha256(s) {
  return import_node_crypto.default.createHash("sha256").update(String(s), "utf8").digest("hex");
}
function hmacSha256(key, msg) {
  return import_node_crypto.default.createHmac("sha256", String(key)).update(String(msg), "utf8").digest("hex");
}
function writeCapabilityMessage(op, path, mutationId, contentHash, exp) {
  return [op, path, mutationId, contentHash, String(exp)].join("\n");
}
var WRITE_CAP_MAX_TTL_MS = 10 * 60 * 1e3;
function safeVaultNotePath(rel) {
  if (!rel || typeof rel !== "string" || rel.length > 1024 || rel.includes("\0")) return null;
  const norm = rel.replace(/\\/g, "/");
  if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm)) return null;
  if (norm.split("/").some((s) => s === "..")) return null;
  if (/(^|\/)\.obsidian(\/|$)/.test(norm)) return null;
  if (!/\.(md|markdown)$/i.test(norm)) return null;
  return norm;
}
function generateToken() {
  return import_node_crypto.default.randomBytes(32).toString("base64url");
}
var TDP_VERSION = "tdp-1";
var SESSION_TTL_MS = 30 * 60 * 1e3;
var CHALLENGE_TTL_MS = 60 * 1e3;
var MAX_TRUSTED_DEVICES = 10;
var MAX_LIVE_CHALLENGES = 100;
function challengePayload({ deviceId, challengeId, nonce, bridgeInstanceId, origin, expiresAt }) {
  return [TDP_VERSION, deviceId, challengeId, nonce, bridgeInstanceId, origin, String(expiresAt)].join("\n");
}
function deviceFingerprint(publicKeyJwk) {
  const canon = JSON.stringify([publicKeyJwk.kty, publicKeyJwk.crv, publicKeyJwk.x, publicKeyJwk.y]);
  return sha256(canon);
}
function verifyDeviceSignature(publicKeyJwk, payload, signatureB64url) {
  try {
    if (!publicKeyJwk || publicKeyJwk.kty !== "EC" || publicKeyJwk.crv !== "P-256") return false;
    const key = import_node_crypto.default.createPublicKey({ key: publicKeyJwk, format: "jwk" });
    const sig = Buffer.from(String(signatureB64url), "base64url");
    if (sig.length !== 64) return false;
    return import_node_crypto.default.verify("sha256", Buffer.from(payload, "utf8"), { key, dsaEncoding: "ieee-p1363" }, sig);
  } catch {
    return false;
  }
}
function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && import_node_crypto.default.timingSafeEqual(ba, bb);
}
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
var WRITE_PATHS = /* @__PURE__ */ new Set(["/write/create", "/write/update", "/write/append"]);
function createBridge(opts) {
  const token = opts.token;
  const writeKey = typeof opts.writeKey === "string" ? opts.writeKey : "";
  const origins = new Set(opts.allowedOrigins ?? []);
  const vault = opts.vault;
  const maxNotes = opts.maxNotes ?? DEFAULT_MAX_NOTES;
  const canWrite = typeof vault.stageWrite === "function" && writeKey.length > 0;
  const appliedMutations = /* @__PURE__ */ new Map();
  const bridgeInstanceId = import_node_crypto.default.randomUUID();
  const trust = opts.trustStore ?? null;
  const sessions = /* @__PURE__ */ new Map();
  const challenges = /* @__PURE__ */ new Map();
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
      ...extra
    });
    res.end(payload);
  }
  function bearerOf(req) {
    const m = /^Bearer (.+)$/.exec(req.headers["authorization"] || "");
    return m ? m[1] : null;
  }
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
    const op = pathname.slice("/write/".length);
    const mutationId = body.mutationId;
    if (typeof mutationId !== "string" || mutationId.length < 8 || mutationId.length > 200) {
      return send(res, 400, { error: "bad_request", cid }, cors);
    }
    const rel = safeVaultNotePath(typeof body.path === "string" ? body.path : "");
    if (!rel) return send(res, 400, { error: "bad_request", cid }, cors);
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
    const exp = body.exp;
    const capability = body.capability;
    if (typeof capability !== "string" || typeof exp !== "number") return send(res, 403, { error: "write_unauthorized", cid }, cors);
    const now = Date.now();
    if (!(exp > now) || exp > now + WRITE_CAP_MAX_TTL_MS) return send(res, 403, { error: "write_unauthorized", cid }, cors);
    const expected = hmacSha256(writeKey, writeCapabilityMessage(op, rel, mutationId, contentHash, exp));
    if (!timingSafeEq(capability, expected)) return send(res, 403, { error: "write_unauthorized", cid }, cors);
    if (appliedMutations.has(mutationId)) {
      return send(res, 200, { ...appliedMutations.get(mutationId), idempotent: true, cid }, cors);
    }
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
  async function handleAuth(res, pathname, req, body, cors, cid, origin) {
    if (!trust) return send(res, 404, { error: "not_found", cid }, cors);
    if (!origin || !origins.has(origin)) return send(res, 403, { error: "origin_not_allowed", cid }, cors);
    if (!body || typeof body !== "object") return send(res, 400, { error: "bad_request", cid }, cors);
    const now = Date.now();
    if (pathname === "/auth/register") {
      const b = bearerOf(req);
      if (!b || !timingSafeEq(b, token)) return send(res, 401, { error: "unauthorized", cid }, cors);
      const { deviceId, publicKey, label } = body;
      if (typeof deviceId !== "string" || deviceId.length < 8 || deviceId.length > 200) return send(res, 400, { error: "bad_request", cid }, cors);
      if (!publicKey || publicKey.kty !== "EC" || publicKey.crv !== "P-256" || typeof publicKey.x !== "string" || typeof publicKey.y !== "string") {
        return send(res, 400, { error: "bad_request", cid }, cors);
      }
      const existing = trust.get(deviceId);
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
        revoked: false
      };
      trust.put(record);
      if (!existing) registrationOpen = false;
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
      const challengeId = import_node_crypto.default.randomUUID();
      const nonce = import_node_crypto.default.randomBytes(32).toString("base64url");
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
  const AUTH_PATHS = /* @__PURE__ */ new Set(["/auth/register", "/auth/challenge", "/auth/verify"]);
  const server = import_node_http.default.createServer(async (req, res) => {
    const cid = import_node_crypto.default.randomUUID();
    const origin = req.headers.origin;
    const cors = corsHeaders(origin);
    try {
      if (origin && !origins.has(origin)) return send(res, 403, { error: "origin_not_allowed", cid }, cors);
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        return res.end();
      }
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = url.pathname;
      if (pathname === "/health") {
        if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed", cid }, { ...cors, Allow: "GET, OPTIONS" });
        return send(res, 200, { ok: true, service: "teragon-vault-bridge", version: BRIDGE_VERSION, cid }, cors);
      }
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
      if (!isAuthed(req)) return send(res, 401, { error: "unauthorized", cid }, cors);
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
            cid
          },
          cors
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
          mtime: r.mtime ?? null
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
    }
  };
}

// main.ts
var DEFAULT_PORT = 5200;
var WRITE_CONFIRM_TIMEOUT_MS = 12e4;
var WriteConfirmModal = class extends import_obsidian.Modal {
  constructor(app, intent, done) {
    super(app);
    __publicField(this, "decided", false);
    __publicField(this, "intent");
    __publicField(this, "done");
    this.intent = intent;
    this.done = done;
  }
  onOpen() {
    this.titleEl.setText("TERAGON \u2014 \u05D0\u05D9\u05E9\u05D5\u05E8 \u05DB\u05EA\u05D9\u05D1\u05D4 \u05DC\u05DB\u05E1\u05E4\u05EA");
    const c = this.contentEl;
    c.createEl("p", { text: "TERAGON \u05DE\u05D1\u05E7\u05E9 \u05DC\u05DB\u05EA\u05D5\u05D1 \u05DC\u05DB\u05E1\u05E4\u05EA \u05D4\u05DE\u05E7\u05D5\u05DE\u05D9\u05EA. \u05D0\u05E9\u05E8\u05D5 \u05E8\u05E7 \u05D0\u05DD \u05D0\u05EA\u05DD \u05D9\u05D6\u05DE\u05EA\u05DD \u05E4\u05E2\u05D5\u05DC\u05D4 \u05D6\u05D5 \u05DB\u05E2\u05EA." });
    const info = c.createEl("div");
    info.createEl("div", { text: `\u05E4\u05E2\u05D5\u05DC\u05D4: ${this.intent.op}` });
    info.createEl("div", { text: `\u05E0\u05EA\u05D9\u05D1: ${this.intent.path}` });
    info.createEl("div", { text: `hash \u05E0\u05D5\u05DB\u05D7\u05D9 (\u05E6\u05E4\u05D5\u05D9): ${String(this.intent.expectedHash).slice(0, 16)}` });
    info.createEl("div", { text: `hash \u05DE\u05D5\u05E6\u05E2: ${String(this.intent.proposedHash).slice(0, 16)}` });
    const pre = c.createEl("pre");
    pre.setText(this.intent.preview.slice(0, 600));
    const btns = c.createEl("div");
    const approve = btns.createEl("button", { text: "\u05D0\u05E9\u05E8 \u05DB\u05EA\u05D9\u05D1\u05D4" });
    approve.addEventListener("click", () => this.decide("approved"));
    const reject = btns.createEl("button", { text: "\u05D3\u05D7\u05D4" });
    reject.addEventListener("click", () => this.decide("rejected"));
  }
  decide(d) {
    if (this.decided) return;
    this.decided = true;
    this.done(d);
    this.close();
  }
  onClose() {
    if (!this.decided) {
      this.decided = true;
      this.done("rejected");
    }
    this.contentEl.empty();
  }
};
var TrustedDevicesModal = class extends import_obsidian.Modal {
  constructor(app, devices, onRevoke, onRevokeAll) {
    super(app);
    __publicField(this, "devices");
    __publicField(this, "onRevoke");
    __publicField(this, "onRevokeAll");
    this.devices = devices;
    this.onRevoke = onRevoke;
    this.onRevokeAll = onRevokeAll;
  }
  onOpen() {
    this.render();
  }
  render() {
    this.titleEl.setText("TERAGON \u2014 \u05DE\u05DB\u05E9\u05D9\u05E8\u05D9\u05DD \u05DE\u05D4\u05D9\u05DE\u05E0\u05D9\u05DD");
    const c = this.contentEl;
    c.empty();
    const active = [...this.devices.values()].filter((d) => !d.revoked);
    if (active.length === 0) {
      c.createEl("p", { text: "\u05D0\u05D9\u05DF \u05DE\u05DB\u05E9\u05D9\u05E8\u05D9\u05DD \u05DE\u05D4\u05D9\u05DE\u05E0\u05D9\u05DD. \u05D7\u05D1\u05E8\u05D5 \u05D3\u05E4\u05D3\u05E4\u05DF \u05D3\u05E8\u05DA \u05E7\u05D5\u05D3 \u05D4\u05D4\u05EA\u05D0\u05DE\u05D4 \u05D4\u05D7\u05D3-\u05E4\u05E2\u05DE\u05D9." });
      return;
    }
    c.createEl("p", { text: "\u05D3\u05E4\u05D3\u05E4\u05E0\u05D9\u05DD \u05E9\u05D0\u05D5\u05E9\u05E8\u05D5 \u05DC\u05D4\u05EA\u05D7\u05D1\u05E8 \u05DE\u05D7\u05D3\u05E9 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05DC\u05D0\u05D7\u05E8 \u05D4\u05E4\u05E2\u05DC\u05D4 \u05DE\u05D7\u05D3\u05E9 (\u05DE\u05D9\u05D3\u05E2 \u05E6\u05D9\u05D1\u05D5\u05E8\u05D9 \u05D1\u05DC\u05D1\u05D3):" });
    for (const d of active) {
      const row = c.createEl("div");
      row.createEl("div", { text: `${d.label} \xB7 ${d.fingerprint.slice(-12)}` });
      row.createEl("div", { text: `\u05E0\u05D5\u05E6\u05E8: ${new Date(d.createdAt).toLocaleString()} \xB7 \u05E0\u05E8\u05D0\u05D4 \u05DC\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4: ${new Date(d.lastSeenAt).toLocaleString()}` });
      row.createEl("div", { text: `\u05DE\u05E7\u05D5\u05E8: ${d.origin} \xB7 \u05DB\u05E1\u05E4\u05EA: ${d.vaultName}` });
      const revoke = row.createEl("button", { text: "\u05D1\u05D8\u05DC \u05D0\u05DE\u05D5\u05DF" });
      revoke.addEventListener("click", () => {
        this.onRevoke(d.deviceId);
        this.render();
        new import_obsidian.Notice("\u05D4\u05DE\u05DB\u05E9\u05D9\u05E8 \u05E0\u05E9\u05DC\u05DC. \u05D9\u05D9\u05D3\u05E8\u05E9 \u05D7\u05D9\u05D1\u05D5\u05E8 \u05DE\u05D7\u05D3\u05E9 \u05E2\u05DD \u05E7\u05D5\u05D3 \u05D4\u05EA\u05D0\u05DE\u05D4.");
      });
    }
    const all = c.createEl("button", { text: "\u05D1\u05D8\u05DC \u05D0\u05DE\u05D5\u05DF \u05DC\u05DB\u05DC \u05D4\u05DE\u05DB\u05E9\u05D9\u05E8\u05D9\u05DD" });
    all.addEventListener("click", () => {
      this.onRevokeAll();
      this.render();
      new import_obsidian.Notice("\u05DB\u05DC \u05D4\u05DE\u05DB\u05E9\u05D9\u05E8\u05D9\u05DD \u05E0\u05E9\u05DC\u05DC\u05D5.");
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ALLOWED_ORIGINS = ["http://localhost:4173", "http://127.0.0.1:4173"];
var SEARCH_SCAN_CAP = 1e3;
var SEARCH_RESULT_CAP = 50;
var SNIPPET_LEN = 160;
function makeSnippet(text, at) {
  const start = Math.max(0, at - 40);
  return text.slice(start, start + SNIPPET_LEN).replace(/\s+/g, " ").trim();
}
var TeragonVaultBridge = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "bridge", null);
    __publicField(this, "token", "");
    __publicField(this, "writeKey", "");
    // Persistent trusted-device registry (PUBLIC keys only) — loaded from this vault's
    // data.json, so trust is inherently scoped to this vault.
    __publicField(this, "trustedDevices", /* @__PURE__ */ new Map());
  }
  async loadTrust() {
    try {
      const data = await this.loadData();
      const arr = Array.isArray(data?.trustedDevices) ? data.trustedDevices : [];
      for (const d of arr) {
        if (d && typeof d.deviceId === "string" && d.publicKey && typeof d.publicKey.x === "string") this.trustedDevices.set(d.deviceId, d);
      }
    } catch {
    }
  }
  async persistTrust() {
    try {
      await this.saveData({ trustedDevices: [...this.trustedDevices.values()] });
    } catch {
    }
  }
  async onload() {
    await this.loadTrust();
    this.token = generateToken();
    this.writeKey = generateToken();
    const vault = {
      getName: () => this.app.vault.getName(),
      listNotes: () => this.app.vault.getMarkdownFiles().map((f) => ({
        path: f.path,
        basename: f.basename,
        mtime: f.stat?.mtime
      })),
      // Read-only single note via Obsidian Vault APIs (never raw fs). Returns null
      // when the path is not a Markdown TFile in this vault.
      readNote: async (rel) => {
        const file = this.app.vault.getAbstractFileByPath(rel);
        if (!(file instanceof import_obsidian.TFile)) return null;
        if (file.extension !== "md" && file.extension !== "markdown") return null;
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
        const content = await this.app.vault.cachedRead(file);
        return { path: file.path, basename: file.basename, frontmatter, mtime: file.stat?.mtime ?? null, content };
      },
      // Local bounded search over filename, path, and Markdown text. Read-only.
      searchNotes: async (query) => {
        const q = query.toLowerCase();
        const files = this.app.vault.getMarkdownFiles().slice(0, SEARCH_SCAN_CAP);
        const out = [];
        for (const f of files) {
          if (out.length >= SEARCH_RESULT_CAP) break;
          const nameHit = f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q);
          const content = await this.app.vault.cachedRead(f);
          const idx = content.toLowerCase().indexOf(q);
          if (!nameHit && idx < 0) continue;
          const snippet = idx >= 0 ? makeSnippet(content, idx) : content.slice(0, SNIPPET_LEN).replace(/\s+/g, " ").trim();
          out.push({ path: f.path, basename: f.basename, snippet, mtime: f.stat?.mtime ?? null });
        }
        return out;
      },
      // Bounded knowledge GRAPH from OFFICIAL metadata: getMarkdownFiles() + resolvedLinks.
      // Nodes carry bounded metadata only (never bodies); edges are real Markdown-to-Markdown
      // links. Highest-degree nodes are kept when the vault exceeds the node bound.
      getGraph: (maxNodes, maxEdges) => {
        const files = this.app.vault.getMarkdownFiles();
        const mdPaths = new Set(files.map((f) => f.path));
        const resolved = this.app.metadataCache.resolvedLinks ?? {};
        const degree = /* @__PURE__ */ new Map();
        const rawEdges = [];
        for (const src of Object.keys(resolved)) {
          if (!mdPaths.has(src)) continue;
          const targets = resolved[src] ?? {};
          for (const tgt of Object.keys(targets)) {
            if (tgt === src || !mdPaths.has(tgt)) continue;
            const count = targets[tgt] ?? 1;
            rawEdges.push({ source: src, target: tgt, count });
            degree.set(src, (degree.get(src) ?? 0) + count);
            degree.set(tgt, (degree.get(tgt) ?? 0) + count);
          }
        }
        let selected = files;
        let truncated = false;
        if (files.length > maxNodes) {
          selected = [...files].sort((a, b) => (degree.get(b.path) ?? 0) - (degree.get(a.path) ?? 0)).slice(0, maxNodes);
          truncated = true;
        }
        const selSet = new Set(selected.map((f) => f.path));
        const nodes = selected.map((f) => {
          const cache = this.app.metadataCache.getFileCache(f);
          const inlineTags = (cache?.tags ?? []).map((t) => t.tag);
          const fmTagsRaw = cache?.frontmatter?.tags;
          const fmTags = Array.isArray(fmTagsRaw) ? fmTagsRaw.map((t) => `#${String(t).replace(/^#/, "")}`) : [];
          const tags = Array.from(/* @__PURE__ */ new Set([...inlineTags, ...fmTags])).slice(0, 12);
          return { id: f.path, path: f.path, basename: f.basename, mtime: f.stat?.mtime ?? null, tags, linkCount: degree.get(f.path) ?? 0 };
        });
        const edges = rawEdges.filter((e) => selSet.has(e.source) && selSet.has(e.target));
        return { nodes, edges: edges.slice(0, maxEdges), truncated: truncated || edges.length > maxEdges };
      },
      // STAGE a write (Phase 3). Shows a LOCAL human confirmation in Obsidian and touches
      // app.vault ONLY on human approval — via OFFICIAL Vault APIs, conflict-guarded, never
      // .obsidian/absolute/../ /non-md (path pre-validated). No client secret can bypass this.
      stageWrite: async (input) => {
        const rel = input.rel;
        const preview = input.op === "append" ? input.block ?? "" : input.content ?? "";
        const decision = await this.confirmWriteInObsidian({
          op: input.op,
          path: rel,
          expectedHash: input.expectedHash ?? "(new file)",
          proposedHash: sha256(preview),
          preview
        });
        if (decision === "rejected") return { ok: false, code: "REJECTED" };
        if (decision === "expired") return { ok: false, code: "EXPIRED" };
        if (input.op === "create") {
          if (this.app.vault.getAbstractFileByPath(rel)) return { ok: false, code: "EXISTS" };
          const created = await this.app.vault.create(rel, input.content ?? "");
          return { ok: true, path: created.path, hash: sha256(input.content ?? "") };
        }
        const file = this.app.vault.getAbstractFileByPath(rel);
        if (!(file instanceof import_obsidian.TFile)) return { ok: false, code: "NOT_FOUND" };
        if (file.extension !== "md" && file.extension !== "markdown") return { ok: false, code: "NOT_FOUND" };
        const current = await this.app.vault.read(file);
        const currentHash = sha256(current);
        if (currentHash !== input.expectedHash) return { ok: false, code: "CONFLICT", currentHash };
        let next;
        if (input.op === "update") {
          next = input.content ?? "";
        } else {
          const block = input.block ?? "";
          const sep = current.length === 0 || current.endsWith("\n") ? "" : "\n";
          next = current + sep + block + (block.endsWith("\n") ? "" : "\n");
        }
        await this.app.vault.process(file, () => next);
        return { ok: true, path: file.path, hash: sha256(next) };
      }
    };
    const trustStore = {
      list: () => [...this.trustedDevices.values()],
      get: (deviceId) => this.trustedDevices.get(deviceId) ?? null,
      put: (rec) => {
        this.trustedDevices.set(rec.deviceId, { ...rec, vaultName: this.app.vault.getName() });
        void this.persistTrust();
      },
      touch: (deviceId, at) => {
        const d = this.trustedDevices.get(deviceId);
        if (d) {
          d.lastSeenAt = at;
          void this.persistTrust();
        }
      }
    };
    this.bridge = createBridge({ token: this.token, writeKey: this.writeKey, allowedOrigins: ALLOWED_ORIGINS, vault, trustStore });
    await this.bridge.start(DEFAULT_PORT);
    this.addCommand({
      id: "manage-trusted-devices",
      name: "Manage TERAGON trusted devices",
      callback: () => {
        new TrustedDevicesModal(
          this.app,
          this.trustedDevices,
          (id) => {
            const d = this.trustedDevices.get(id);
            if (d) {
              d.revoked = true;
              void this.persistTrust();
            }
          },
          () => {
            for (const d of this.trustedDevices.values()) d.revoked = true;
            void this.persistTrust();
          }
        ).open();
      }
    });
    this.addCommand({
      id: "show-pairing-token",
      name: "Copy TERAGON pairing token (once)",
      callback: () => {
        void navigator.clipboard?.writeText(this.token);
        new import_obsidian.Notice("TERAGON pairing token copied. Paste it into TERAGON. Do not share or commit it.");
      }
    });
    this.addCommand({
      id: "show-write-key",
      name: "Copy TERAGON write key (once)",
      callback: () => {
        void navigator.clipboard?.writeText(this.writeKey);
        new import_obsidian.Notice("TERAGON write key copied. Required to AUTHORIZE approved writes \u2014 the pairing token alone cannot write. Do not share or commit it.");
      }
    });
    console.info(`[teragon-vault-bridge] ${BRIDGE_VERSION} listening on 127.0.0.1:${DEFAULT_PORT} (read + approved-write)`);
  }
  /** Show the in-Obsidian confirmation and resolve the human's decision (or timeout). */
  confirmWriteInObsidian(intent) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (d) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(d);
      };
      const modal = new WriteConfirmModal(this.app, intent, finish);
      const timer = setTimeout(() => {
        finish("expired");
        modal.close();
      }, WRITE_CONFIRM_TIMEOUT_MS);
      modal.open();
    });
  }
  async onunload() {
    await this.bridge?.close();
    this.bridge = null;
    this.token = "";
    this.writeKey = "";
  }
};
