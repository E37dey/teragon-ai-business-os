// @ts-nocheck — imports the plain-JS single-source bridge (.mjs). S14.2 Phase 1:
// proves the bounded READ-ONLY /note + /search surface and its path security.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBridge, safeVaultNotePath } from "../../obsidian-plugin/teragon-vault-bridge/bridgeServer.mjs";
import { mockVault } from "../../obsidian-plugin/teragon-vault-bridge/mockVault.mjs";

const TOKEN = "phase1-token-xyz";
const ALLOWED = "http://localhost:4173";
const auth = { headers: { Authorization: `Bearer ${TOKEN}` } };

let bridge;
let base;
beforeAll(async () => {
  bridge = createBridge({ token: TOKEN, allowedOrigins: [ALLOWED], vault: mockVault(3), maxNotes: 50 });
  const addr = await bridge.start(0);
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(async () => {
  await bridge.close();
});

const noteUrl = (p) => `${base}/note/${encodeURIComponent(p)}`;
const searchUrl = (q) => `${base}/search/${encodeURIComponent(q)}`;

describe("safeVaultNotePath — unit", () => {
  it("accepts a normal vault-relative .md path", () => {
    expect(safeVaultNotePath("Notes/Note-1.md")).toBe("Notes/Note-1.md");
  });
  it("rejects traversal / absolute / .obsidian / non-markdown", () => {
    expect(safeVaultNotePath("../secret.md")).toBeNull();
    expect(safeVaultNotePath("/etc/passwd.md")).toBeNull();
    expect(safeVaultNotePath("C:/Users/x.md")).toBeNull();
    expect(safeVaultNotePath(".obsidian/plugins/x.md")).toBeNull();
    expect(safeVaultNotePath("Notes/config.json")).toBeNull();
    expect(safeVaultNotePath("Notes/image.png")).toBeNull();
  });
});

describe("GET /note — bounded read-only note read", () => {
  it("reads a real note (auth) with metadata + content, no binary", async () => {
    const r = await fetch(noteUrl("Notes/Note-1.md"), auth);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.path).toBe("Notes/Note-1.md");
    expect(b.basename).toBe("Note-1");
    expect(typeof b.content).toBe("string");
    expect(b.truncated).toBe(false);
    expect(b).toHaveProperty("mtime");
    expect(b).toHaveProperty("frontmatter");
  });

  it("requires auth (401 without token)", async () => {
    expect((await fetch(noteUrl("Notes/Note-1.md"))).status).toBe(401);
  });

  it("missing note → 404 (no false success)", async () => {
    const r = await fetch(noteUrl("Notes/Does-Not-Exist.md"), auth);
    expect(r.status).toBe(404);
  });

  it("rejects traversal / absolute / .obsidian / non-md → 400", async () => {
    expect((await fetch(noteUrl("../secret.md"), auth)).status).toBe(400);
    expect((await fetch(noteUrl("/abs/note.md"), auth)).status).toBe(400);
    expect((await fetch(noteUrl("C:/win/note.md"), auth)).status).toBe(400);
    expect((await fetch(noteUrl(".obsidian/plugins/p.md"), auth)).status).toBe(400);
    expect((await fetch(noteUrl("Notes/data.json"), auth)).status).toBe(400);
  });

  it("rejects write methods on /note (405)", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const r = await fetch(noteUrl("Notes/Note-1.md"), { method, ...auth });
      expect(r.status, method).toBe(405);
    }
  });

  it("bounds oversized content (truncated=true, content ≤ cap)", async () => {
    const CAP = 256 * 1024;
    const big = "x".repeat(CAP + 5000);
    const bigBridge = createBridge({
      token: TOKEN,
      allowedOrigins: [ALLOWED],
      vault: {
        getName: () => "Big",
        listNotes: () => [{ path: "Big.md", basename: "Big", mtime: 1 }],
        readNote: () => ({ path: "Big.md", basename: "Big", frontmatter: null, mtime: 1, content: big }),
      },
    });
    const addr = await bigBridge.start(0);
    try {
      const r = await fetch(`http://127.0.0.1:${addr.port}/note/Big.md`, auth);
      expect(r.status).toBe(200);
      const b = await r.json();
      expect(b.truncated).toBe(true);
      expect(b.content.length).toBe(CAP);
    } finally {
      await bigBridge.close();
    }
  });
});

describe("GET /search — bounded local search", () => {
  it("returns bounded results (auth)", async () => {
    const r = await fetch(searchUrl("Note"), auth);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(Array.isArray(b.results)).toBe(true);
    expect(b.count).toBe(b.results.length);
    for (const hit of b.results) {
      expect(Object.keys(hit).sort()).toEqual(["basename", "mtime", "path", "snippet"]);
    }
  });

  it("requires auth (401)", async () => {
    expect((await fetch(searchUrl("Note"))).status).toBe(401);
  });

  it("rejects an over-long query (400)", async () => {
    const long = "a".repeat(201);
    expect((await fetch(searchUrl(long), auth)).status).toBe(400);
  });

  it("rejects write methods on /search (405)", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const r = await fetch(searchUrl("Note"), { method, ...auth });
      expect(r.status, method).toBe(405);
    }
  });
});
