// @ts-nocheck — imports the plain-JS single-source bridge (.mjs). S14.4 Phase 3 +
// approval-boundary fix: writes require a SEPARATE write-capability (HMAC over a
// writeKey) — the pairing token ALONE can never mutate the Vault.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBridge, sha256, hmacSha256, writeCapabilityMessage } from "../../obsidian-plugin/teragon-vault-bridge/bridgeServer.mjs";

const TOKEN = "phase3-write-token";
const WRITEKEY = "phase3-write-key-SEPARATE";
const ALLOWED = "http://localhost:4173";

function writableVault(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    getName: () => "WriteVault",
    listNotes: () => [...files.keys()].map((p) => ({ path: p, basename: p, mtime: 1 })),
    readNote: (rel) => (files.has(rel) ? { path: rel, basename: rel, frontmatter: null, mtime: 1, content: files.get(rel) } : null),
    applyWrite: (input) => {
      const rel = input.rel;
      if (input.op === "create") {
        if (files.has(rel)) return { ok: false, code: "EXISTS" };
        files.set(rel, input.content);
        return { ok: true, path: rel, hash: sha256(input.content) };
      }
      if (!files.has(rel)) return { ok: false, code: "NOT_FOUND" };
      const current = files.get(rel);
      if (sha256(current) !== input.expectedHash) return { ok: false, code: "CONFLICT", currentHash: sha256(current) };
      let next;
      if (input.op === "update") next = input.content;
      else {
        const sep = current.length === 0 || current.endsWith("\n") ? "" : "\n";
        next = current + sep + input.block + (input.block.endsWith("\n") ? "" : "\n");
      }
      files.set(rel, next);
      return { ok: true, path: rel, hash: sha256(next) };
    },
    _files: files,
  };
}

let bridge;
let base;
let vault;
beforeEach(async () => {
  vault = writableVault({ "Existing.md": "# Existing\n\nline1\n" });
  bridge = createBridge({ token: TOKEN, writeKey: WRITEKEY, allowedOrigins: [ALLOWED], vault });
  base = `http://127.0.0.1:${(await bridge.start(0)).port}`;
});
afterEach(async () => {
  await bridge.close();
});

const auth = { Authorization: `Bearer ${TOKEN}` };
const jheaders = { ...auth, "Content-Type": "application/json" };
const mid = (s) => `mut-${s}-01234567`;

// Build a properly-signed write body with a valid capability (key = WRITEKEY).
function signed(op, fields, { key = WRITEKEY, exp = Date.now() + 60000 } = {}) {
  const contentHash = op === "append" ? sha256(fields.block) : sha256(fields.content);
  const capability = hmacSha256(key, writeCapabilityMessage(op, fields.path, fields.mutationId, contentHash, exp));
  return { correlationId: "c", exp, capability, ...fields };
}
const post = (path, body, headers = jheaders) => fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });

describe("APPROVAL BOUNDARY — pairing token alone cannot authorize a Vault mutation", () => {
  it("valid pairing token + valid Origin + valid payload but NO write capability → 403, Vault unchanged", async () => {
    const before = new Map(vault._files);
    // create — no capability/exp fields at all
    const r1 = await post("/write/create", { mutationId: mid("nc1"), correlationId: "c", path: "Attacker.md", content: "# owned\n" });
    expect(r1.status).toBe(403);
    expect((await r1.json()).error).toBe("write_unauthorized");
    // update — no capability
    const r2 = await post("/write/update", { mutationId: mid("nc2"), correlationId: "c", path: "Existing.md", content: "x", expectedHash: sha256(vault._files.get("Existing.md")) });
    expect(r2.status).toBe(403);
    // append — no capability
    const r3 = await post("/write/append", { mutationId: mid("nc3"), correlationId: "c", path: "Existing.md", block: "x", expectedHash: sha256(vault._files.get("Existing.md")) });
    expect(r3.status).toBe(403);
    expect(vault._files).toEqual(before); // NOTHING changed
    expect(vault._files.has("Attacker.md")).toBe(false);
  });

  it("a capability signed with the WRONG key is rejected → 403", async () => {
    const r = await post("/write/create", signed("create", { mutationId: mid("wk"), path: "Wrong.md", content: "x\n" }, { key: "not-the-write-key" }));
    expect(r.status).toBe(403);
    expect(vault._files.has("Wrong.md")).toBe(false);
  });

  it("an EXPIRED capability is rejected → 403", async () => {
    const r = await post("/write/create", signed("create", { mutationId: mid("exp"), path: "Expired.md", content: "x\n" }, { exp: Date.now() - 1000 }));
    expect(r.status).toBe(403);
    expect(vault._files.has("Expired.md")).toBe(false);
  });

  it("a capability cannot be reused for another PATH / OP / CONTENT", async () => {
    // mint a capability for (create, Bound.md, content A)
    const good = signed("create", { mutationId: mid("bind"), path: "Bound.md", content: "AAA\n" });
    // reuse its capability/exp for a DIFFERENT path
    const otherPath = await post("/write/create", { ...good, path: "Other.md" });
    expect(otherPath.status).toBe(403);
    // reuse for a DIFFERENT content
    const otherContent = await post("/write/create", { ...good, content: "BBB\n" });
    expect(otherContent.status).toBe(403);
    // reuse the same capability on a DIFFERENT op endpoint
    const otherOp = await post("/write/update", { ...good, content: "AAA\n", expectedHash: sha256(vault._files.get("Existing.md")) });
    expect(otherOp.status).toBe(403);
    // the original still works
    expect((await post("/write/create", good)).status).toBe(200);
  });
});

describe("write with a valid capability — applied exactly once, idempotent replay", () => {
  it("create applies once; second create of same path → 409", async () => {
    const r = await post("/write/create", signed("create", { mutationId: mid("c1"), path: "New Note.md", content: "# New\n\nhi\n" }));
    expect(r.status).toBe(200);
    expect((await r.json()).applied).toBe(true);
    expect(vault._files.get("New Note.md")).toBe("# New\n\nhi\n");
    const dup = await post("/write/create", signed("create", { mutationId: mid("c2"), path: "New Note.md", content: "other\n" }));
    expect(dup.status).toBe(409);
  });

  it("replay of the SAME mutationId+capability is idempotent (no second write)", async () => {
    const body = signed("create", { mutationId: mid("cc"), path: "Idem.md", content: "# Idem\n" });
    expect((await (await post("/write/create", body)).json()).applied).toBe(true);
    const second = await post("/write/create", body);
    expect(second.status).toBe(200);
    expect((await second.json()).idempotent).toBe(true);
    expect(vault._files.size).toBe(2);
  });

  it("update: matches expectedHash → applied; stale → 409 (no mutation)", async () => {
    const cur = vault._files.get("Existing.md");
    const ok = await post("/write/update", signed("update", { mutationId: mid("u1"), path: "Existing.md", content: "# Existing\n\nUPDATED\n", expectedHash: sha256(cur) }));
    expect(ok.status).toBe(200);
    expect(vault._files.get("Existing.md")).toBe("# Existing\n\nUPDATED\n");
    const before = vault._files.get("Existing.md");
    const stale = await post("/write/update", signed("update", { mutationId: mid("u2"), path: "Existing.md", content: "clobber\n", expectedHash: sha256("stale") }));
    expect(stale.status).toBe(409);
    expect(vault._files.get("Existing.md")).toBe(before);
  });

  it("append: block once; duplicate mutationId does not append twice", async () => {
    const cur = vault._files.get("Existing.md");
    const body = signed("append", { mutationId: mid("a1"), path: "Existing.md", block: "appended-block", expectedHash: sha256(cur) });
    await post("/write/append", body);
    expect((vault._files.get("Existing.md").match(/appended-block/g) || []).length).toBe(1);
    await post("/write/append", body); // replay same mutationId+capability
    expect((vault._files.get("Existing.md").match(/appended-block/g) || []).length).toBe(1);
  });
});

describe("auth / origin / method / schema / body (pre-capability gates)", () => {
  it("missing token → 401; wrong token → 401", async () => {
    expect((await fetch(`${base}/write/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await post("/write/create", {}, { Authorization: "Bearer wrong", "Content-Type": "application/json" })).status).toBe(401);
  });
  it("disallowed Origin → 403 origin_not_allowed", async () => {
    const r = await fetch(`${base}/write/create`, { method: "POST", headers: { ...jheaders, Origin: "http://evil.example" }, body: "{}" });
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("origin_not_allowed");
  });
  it("GET/PUT/PATCH/DELETE on a write endpoint → 405", async () => {
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      expect((await fetch(`${base}/write/create`, { method, headers: auth })).status, method).toBe(405);
    }
  });
  it("path confinement → 400 (.. / absolute / .obsidian / non-md)", async () => {
    for (const p of ["../secret.md", "/abs/x.md", ".obsidian/app.json.md", "notes/data.json"]) {
      expect((await post("/write/create", { mutationId: mid("p"), path: p, content: "x" })).status, p).toBe(400);
    }
  });
  it("malformed JSON / missing mutationId / missing fields → 400", async () => {
    expect((await fetch(`${base}/write/create`, { method: "POST", headers: jheaders, body: "{not json" })).status).toBe(400);
    expect((await post("/write/create", { path: "a.md", content: "x" })).status).toBe(400);
    expect((await post("/write/create", { mutationId: mid("m"), path: "a.md" })).status).toBe(400);
    expect((await post("/write/update", { mutationId: mid("m2"), path: "Existing.md", content: "x" })).status).toBe(400);
  });
  it("oversized body → 413", async () => {
    const big = "x".repeat(300 * 1024);
    expect((await post("/write/create", signed("create", { mutationId: mid("big"), path: "Big.md", content: big }))).status).toBe(413);
  });
});

describe("reads stay GET-only; connection advertises write capability", () => {
  it("POST on read endpoints → 405", async () => {
    expect((await fetch(`${base}/notes`, { method: "POST", headers: auth })).status).toBe(405);
    expect((await fetch(`${base}/note/Existing.md`, { method: "POST", headers: auth })).status).toBe(405);
  });
  it("/connection reports writeEnabled:true, readonly:false for a writeable vault", async () => {
    const b = await (await fetch(`${base}/connection`, { headers: auth })).json();
    expect(b.writeEnabled).toBe(true);
    expect(b.readonly).toBe(false);
  });
  it("a bridge WITHOUT a writeKey exposes no write capability (writes 404)", async () => {
    const nb = createBridge({ token: TOKEN, allowedOrigins: [ALLOWED], vault: writableVault() }); // no writeKey
    const nbase = `http://127.0.0.1:${(await nb.start(0)).port}`;
    try {
      expect((await fetch(`${nbase}/write/create`, { method: "POST", headers: jheaders, body: JSON.stringify(signed("create", { mutationId: mid("x"), path: "a.md", content: "y\n" })) })).status).toBe(404);
      const conn = await (await fetch(`${nbase}/connection`, { headers: auth })).json();
      expect(conn.writeEnabled).toBe(false);
      expect(conn.readonly).toBe(true);
    } finally {
      await nb.close();
    }
  });
});
