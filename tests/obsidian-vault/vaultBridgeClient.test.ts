// S14.2 Phase 1 — production READ-ONLY adapter tests. Runs against the real shared
// bridge (createBridge + mockVault) via the internal baseUrl override; fail-closed
// and error-mapping paths are exercised too.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createBridge } from "../../obsidian-plugin/teragon-vault-bridge/bridgeServer.mjs";
import { mockVault } from "../../obsidian-plugin/teragon-vault-bridge/mockVault.mjs";
import {
  getConnectionInfo,
  listNotes,
  openInObsidian,
  probeHealth,
  readNote,
  searchNotes,
} from "@/integration/obsidian/vaultBridgeClient";

const TOKEN = "adapter-token-123";
const ALLOWED = "http://localhost:4173";
let bridge: { close: () => Promise<void>; start: (p: number) => Promise<{ port: number }> };
let base: string;

beforeAll(async () => {
  bridge = createBridge({ token: TOKEN, allowedOrigins: [ALLOWED], vault: mockVault(3), maxNotes: 50 });
  const addr = await bridge.start(0);
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(async () => {
  await bridge.close();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("vaultBridgeClient — read-only operations (real bridge)", () => {
  it("getConnectionInfo returns readonly connection info", async () => {
    const r = await getConnectionInfo(TOKEN, base);
    expect(r.ok).toBe(true);
    expect(r.code).toBe("OK");
    expect(r.data?.vaultName).toBe("Demo Vault (spike)");
    expect(r.data?.readonly).toBe(true);
  });

  it("probeHealth works without a token", async () => {
    const r = await probeHealth(base);
    expect(r.ok).toBe(true);
    expect(r.data?.ok).toBe(true);
  });

  it("listNotes returns a bounded list", async () => {
    const r = await listNotes(TOKEN, base);
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.data?.notes)).toBe(true);
  });

  it("searchNotes returns hits; empty query short-circuits with no request", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const empty = await searchNotes("   ", TOKEN, base);
    expect(empty.ok).toBe(true);
    expect(empty.data?.results).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    const r = await searchNotes("Note", TOKEN, base);
    expect(r.ok).toBe(true);
    expect(r.data?.results.every((h) => typeof h.snippet === "string")).toBe(true);
  });

  it("readNote reads a real note", async () => {
    const r = await readNote("Notes/Note-1.md", TOKEN, base);
    expect(r.ok).toBe(true);
    expect(r.data?.basename).toBe("Note-1");
    expect(typeof r.data?.content).toBe("string");
  });

  it("readNote missing → NOT_FOUND (no false success)", async () => {
    const r = await readNote("Notes/Nope.md", TOKEN, base);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("NOT_FOUND");
  });

  it("readNote traversal/absolute → BAD_REQUEST", async () => {
    expect((await readNote("../secret.md", TOKEN, base)).code).toBe("BAD_REQUEST");
    expect((await readNote("/abs/x.md", TOKEN, base)).code).toBe("BAD_REQUEST");
  });
});

describe("vaultBridgeClient — auth + fail-closed", () => {
  it("wrong token → UNAUTHORIZED", async () => {
    const r = await getConnectionInfo("wrong-token", base);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("UNAUTHORIZED");
    expect(r.status).toBe(401);
  });

  it("unreachable bridge → UNAVAILABLE (fail closed, status null)", async () => {
    // bind then release a port so nothing is listening on it
    const tmp = createBridge({ token: "t", allowedOrigins: [], vault: mockVault(1) });
    const addr = await tmp.start(0);
    const deadBase = `http://127.0.0.1:${addr.port}`;
    await tmp.close();
    const r = await getConnectionInfo(TOKEN, deadBase);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("UNAVAILABLE");
    expect(r.status).toBeNull();
  });

  it("abort → TIMEOUT (mapped, fail closed)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const r = await getConnectionInfo(TOKEN, base);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("TIMEOUT");
  });
});

describe("openInObsidian — official navigation URI only (no token)", () => {
  it("builds obsidian://open with encoded vault + file, no sensitive data", () => {
    const spy = vi.spyOn(window, "open").mockImplementation(() => null);
    openInObsidian("TERAGON OS", "Alpha Note.md");
    expect(spy).toHaveBeenCalledTimes(1);
    const uri = spy.mock.calls[0]?.[0] as string;
    expect(uri).toBe("obsidian://open?vault=TERAGON%20OS&file=Alpha%20Note.md");
    expect(uri).not.toMatch(/token|Bearer/i);
  });
});
