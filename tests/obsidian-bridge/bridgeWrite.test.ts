// @ts-nocheck — imports the plain-JS single-source bridge (.mjs). S14.4 Phase 3:
// proves the human-approved WRITE endpoints — auth/origin/method/path/schema/body,
// conflict (hash), idempotency (mutationId), and that reads stay GET-only.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBridge, sha256 } from "../../obsidian-plugin/teragon-vault-bridge/bridgeServer.mjs";

const TOKEN = "phase3-write-token";
const ALLOWED = "http://localhost:4173";

// In-memory writeable vault provider mirroring the plugin's applyWrite semantics.
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
  bridge = createBridge({ token: TOKEN, allowedOrigins: [ALLOWED], vault });
  base = `http://127.0.0.1:${(await bridge.start(0)).port}`;
});
afterEach(async () => {
  await bridge.close();
});

const auth = { Authorization: `Bearer ${TOKEN}` };
const jheaders = { ...auth, "Content-Type": "application/json" };
const post = (path, body, headers = jheaders) => fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
const mid = (s) => `mut-${s}-01234567`;

describe("write — create", () => {
  it("creates a new note once; second create of same path → 409 already_exists", async () => {
    const r = await post("/write/create", { mutationId: mid("c1"), correlationId: "x", path: "New Note.md", content: "# New\n\nhi\n" });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.applied).toBe(true);
    expect(b.path).toBe("New Note.md");
    expect(b.hash).toBe(sha256("# New\n\nhi\n"));
    expect(vault._files.get("New Note.md")).toBe("# New\n\nhi\n");
    const dup = await post("/write/create", { mutationId: mid("c2"), path: "New Note.md", content: "other" });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe("already_exists");
  });

  it("create is idempotent per mutationId (no second write)", async () => {
    const body = { mutationId: mid("cc"), path: "Idem.md", content: "# Idem\n" };
    const first = await (await post("/write/create", body)).json();
    expect(first.applied).toBe(true);
    const second = await post("/write/create", body);
    expect(second.status).toBe(200);
    const b2 = await second.json();
    expect(b2.idempotent).toBe(true);
    expect(vault._files.size).toBe(2); // Existing.md + Idem.md — not created twice
  });
});

describe("write — update + conflict", () => {
  it("updates when expectedHash matches current", async () => {
    const cur = vault._files.get("Existing.md");
    const r = await post("/write/update", { mutationId: mid("u1"), path: "Existing.md", content: "# Existing\n\nUPDATED\n", expectedHash: sha256(cur) });
    expect(r.status).toBe(200);
    expect(vault._files.get("Existing.md")).toBe("# Existing\n\nUPDATED\n");
  });

  it("refuses to overwrite on stale expectedHash → 409 conflict (no mutation)", async () => {
    const before = vault._files.get("Existing.md");
    const r = await post("/write/update", { mutationId: mid("u2"), path: "Existing.md", content: "clobber", expectedHash: sha256("something-else") });
    expect(r.status).toBe(409);
    const b = await r.json();
    expect(b.error).toBe("conflict");
    expect(b.currentHash).toBe(sha256(before));
    expect(vault._files.get("Existing.md")).toBe(before); // unchanged
  });

  it("update missing note → 404", async () => {
    const r = await post("/write/update", { mutationId: mid("u3"), path: "Nope.md", content: "x", expectedHash: sha256("") });
    expect(r.status).toBe(404);
  });
});

describe("write — append + idempotency (no double append)", () => {
  it("appends a block once; duplicate mutationId does NOT append twice", async () => {
    const cur = vault._files.get("Existing.md");
    const body = { mutationId: mid("a1"), path: "Existing.md", block: "appended-block", expectedHash: sha256(cur) };
    const r1 = await post("/write/append", body);
    expect(r1.status).toBe(200);
    const afterFirst = vault._files.get("Existing.md");
    expect(afterFirst).toContain("appended-block");
    const occurrences = (afterFirst.match(/appended-block/g) || []).length;
    expect(occurrences).toBe(1);
    // replay the SAME mutationId
    const r2 = await post("/write/append", body);
    expect(r2.status).toBe(200);
    expect((await r2.json()).idempotent).toBe(true);
    const afterSecond = vault._files.get("Existing.md");
    expect((afterSecond.match(/appended-block/g) || []).length).toBe(1); // still ONE block
  });
});

describe("write — auth / origin / method / schema / body", () => {
  it("missing token → 401; wrong token → 401", async () => {
    expect((await fetch(`${base}/write/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await post("/write/create", { mutationId: mid("z"), path: "a.md", content: "x" }, { Authorization: "Bearer wrong", "Content-Type": "application/json" })).status).toBe(401);
  });
  it("disallowed Origin → 403", async () => {
    const r = await fetch(`${base}/write/create`, { method: "POST", headers: { ...jheaders, Origin: "http://evil.example" }, body: "{}" });
    expect(r.status).toBe(403);
  });
  it("GET/PUT/PATCH/DELETE on a write endpoint → 405", async () => {
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      const r = await fetch(`${base}/write/create`, { method, headers: auth });
      expect(r.status, method).toBe(405);
    }
  });
  it("path confinement → 400 (.. / absolute / .obsidian / non-md)", async () => {
    for (const p of ["../secret.md", "/abs/x.md", ".obsidian/app.json.md", "notes/data.json"]) {
      const r = await post("/write/create", { mutationId: mid("p"), path: p, content: "x" });
      expect(r.status, p).toBe(400);
    }
  });
  it("malformed JSON / missing mutationId / missing fields → 400", async () => {
    expect((await fetch(`${base}/write/create`, { method: "POST", headers: jheaders, body: "{not json" })).status).toBe(400);
    expect((await post("/write/create", { path: "a.md", content: "x" })).status).toBe(400); // no mutationId
    expect((await post("/write/create", { mutationId: mid("m"), path: "a.md" })).status).toBe(400); // no content
    expect((await post("/write/update", { mutationId: mid("m2"), path: "Existing.md", content: "x" })).status).toBe(400); // no expectedHash
  });
  it("oversized body → 413", async () => {
    const big = "x".repeat(300 * 1024);
    const r = await post("/write/create", { mutationId: mid("big"), path: "Big.md", content: big });
    expect(r.status).toBe(413);
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
});
