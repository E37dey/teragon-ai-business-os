// @ts-nocheck — imports the plain-JS single-source bridge (.mjs); typecheck skipped
// for this spike test file. S14.1 Phase 0: proves the loopback bridge security contract.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBridge } from "../../obsidian-plugin/teragon-vault-bridge/bridgeServer.mjs";
import { mockVault } from "../../obsidian-plugin/teragon-vault-bridge/mockVault.mjs";

const TOKEN = "test-token-abc123";
const ALLOWED = "http://localhost:5199";
let bridge;
let base;

beforeAll(async () => {
  bridge = createBridge({ token: TOKEN, allowedOrigins: [ALLOWED], vault: mockVault(5), maxNotes: 3 });
  const addr = await bridge.start(0); // ephemeral loopback port
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(async () => {
  await bridge.close();
});

const auth = { headers: { Authorization: `Bearer ${TOKEN}` } };

describe("Phase 0 bridge — binding + read-only security contract", () => {
  it("binds LOOPBACK only (127.0.0.1)", () => {
    expect(bridge.address().address).toBe("127.0.0.1");
  });

  it("GET /health is unauthenticated and returns NO vault content", async () => {
    const r = await fetch(`${base}/health`);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.ok).toBe(true);
    // no actual vault content: no vault name, no note paths/basenames
    expect(b.vaultName).toBeUndefined();
    expect(b.notes).toBeUndefined();
    expect(JSON.stringify(b)).not.toMatch(/Note-|\.md|Demo Vault/);
  });

  it("authenticated endpoints REJECT missing / wrong / malformed token", async () => {
    expect((await fetch(`${base}/connection`)).status).toBe(401); // missing
    expect((await fetch(`${base}/connection`, { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await fetch(`${base}/connection`, { headers: { Authorization: TOKEN } })).status).toBe(401); // malformed (no Bearer)
  });

  it("GET /connection with the token returns read-only connection info", async () => {
    const r = await fetch(`${base}/connection`, auth);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b).toMatchObject({ connected: true, readonly: true, vaultName: "Demo Vault (spike)" });
  });

  it("GET /notes returns a BOUNDED metadata list (≤ maxNotes), no content", async () => {
    const r = await fetch(`${base}/notes`, auth);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.count).toBeLessThanOrEqual(3);
    expect(b.truncated).toBe(true); // 5 notes, maxNotes 3
    for (const n of b.notes) {
      expect(Object.keys(n).sort()).toEqual(["basename", "mtime", "path"]);
    }
    expect(JSON.stringify(b)).not.toMatch(/content|body/);
  });

  it("rejects unsupported methods (no write path)", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const r = await fetch(`${base}/notes`, { method, ...auth });
      expect(r.status, method).toBe(405);
    }
  });

  it("enforces the Origin allowlist (rejects unexpected Origin; no wildcard)", async () => {
    const bad = await fetch(`${base}/health`, { headers: { Origin: "http://evil.example" } });
    expect(bad.status).toBe(403);
    const good = await fetch(`${base}/health`, { headers: { Origin: ALLOWED } });
    expect(good.status).toBe(200);
    expect(good.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(good.headers.get("access-control-allow-origin")).not.toBe("*");
  });

  it("rejects arbitrary path/file params (no GET /file?path=...)", async () => {
    expect((await fetch(`${base}/notes?path=../secret`, auth)).status).toBe(400);
    expect((await fetch(`${base}/notes?file=x`, auth)).status).toBe(400);
  });

  it("errors are sanitized (no stack trace, no token)", async () => {
    const r = await fetch(`${base}/nope`, auth);
    expect(r.status).toBe(404);
    const txt = await r.text();
    expect(txt).not.toMatch(/at .*\(|Error:|test-token/);
  });
});

describe("Phase 0 bridge — shutdown fails closed", () => {
  it("closing the server makes the port unreachable (fail-closed)", async () => {
    const b2 = createBridge({ token: TOKEN, allowedOrigins: [ALLOWED], vault: mockVault(1) });
    const addr = await b2.start(0);
    const url = `http://127.0.0.1:${addr.port}/health`;
    expect((await fetch(url)).status).toBe(200);
    await b2.close();
    await expect(fetch(url)).rejects.toBeTruthy(); // connection refused → fail closed
  });
});
