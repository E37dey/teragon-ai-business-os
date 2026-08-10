// @ts-nocheck — imports the plain-JS single-source bridge (.mjs). Live knowledge graph:
// proves GET /graph builds bounded nodes+edges from Vault metadata, read-only, no secrets,
// and stays GET-only + auth/origin bounded. Independent of the write capability.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBridge } from "../../obsidian-plugin/teragon-vault-bridge/bridgeServer.mjs";

const TOKEN = "graph-token-xyz";
const ALLOWED = "http://localhost:4173";
const auth = { headers: { Authorization: `Bearer ${TOKEN}` } };

// A vault provider that returns a synthetic graph (7 notes with real link edges + one orphan).
function graphVault(nodeCount = 7, { orphan = true } = {}) {
  const names = ["Company", "Customers", "Projects", "AI", "Sales", "Support", "Knowledge"].slice(0, nodeCount);
  const nodes = names.map((n) => ({ id: `${n}.md`, path: `${n}.md`, basename: n, mtime: 1, tags: n === "AI" ? ["#tech"] : [], linkCount: 0 }));
  // edges: Company→Customers, Company→Projects, Projects→AI, Sales→Customers, Support→Customers
  const rawEdges = [
    ["Company.md", "Customers.md"],
    ["Company.md", "Projects.md"],
    ["Projects.md", "AI.md"],
    ["Sales.md", "Customers.md"],
    ["Support.md", "Customers.md"],
  ].filter(([s, t]) => names.includes(s.replace(".md", "")) && names.includes(t.replace(".md", "")));
  const deg = new Map();
  for (const [s, t] of rawEdges) {
    deg.set(s, (deg.get(s) ?? 0) + 1);
    deg.set(t, (deg.get(t) ?? 0) + 1);
  }
  nodes.forEach((n) => (n.linkCount = deg.get(n.path) ?? 0));
  const edges = rawEdges.map(([source, target]) => ({ source, target, count: 1 }));
  return {
    getName: () => "TERAGON OS",
    listNotes: () => nodes.map((n) => ({ path: n.path, basename: n.basename, mtime: n.mtime })),
    getGraph: (maxNodes, maxEdges) => {
      const nn = nodes.slice(0, maxNodes);
      const ee = edges.slice(0, maxEdges);
      return { nodes: nn, edges: ee, truncated: nodes.length > maxNodes || edges.length > maxEdges };
    },
    _orphan: orphan,
  };
}

let bridge;
let base;
beforeEach(async () => {
  bridge = createBridge({ token: TOKEN, writeKey: "wk", allowedOrigins: [ALLOWED], vault: graphVault() });
  base = `http://127.0.0.1:${(await bridge.start(0)).port}`;
});
afterEach(async () => {
  await bridge.close();
});

describe("GET /graph — nodes + edges from metadata", () => {
  it("returns bounded nodes and real edges (no bodies, no secrets)", async () => {
    const r = await fetch(`${base}/graph`, auth);
    expect(r.status).toBe(200);
    const g = await r.json();
    expect(g.count).toBe(7);
    expect(g.edgeCount).toBe(5);
    // node shape: metadata only, NO content/body
    for (const n of g.nodes) {
      expect(Object.keys(n).sort()).toEqual(["basename", "id", "linkCount", "mtime", "path", "tags"]);
    }
    const raw = JSON.stringify(g);
    expect(raw).not.toMatch(/content|body|Bearer|writeKey|capability|Authorization/i);
    // edges reference node ids
    for (const e of g.edges) expect(g.nodes.some((n) => n.id === e.source) && g.nodes.some((n) => n.id === e.target)).toBe(true);
  });

  it("represents an orphan note (linkCount 0) and a hub note (Customers has 3)", async () => {
    const g = await (await fetch(`${base}/graph`, auth)).json();
    const knowledge = g.nodes.find((n) => n.basename === "Knowledge");
    expect(knowledge.linkCount).toBe(0); // orphan
    const customers = g.nodes.find((n) => n.basename === "Customers");
    expect(customers.linkCount).toBe(3); // hub (3 inbound)
  });

  it("reports truncated:true and caps nodes/edges when the vault exceeds server maxima", async () => {
    // a huge synthetic vault provider
    const bigNodes = Array.from({ length: 500 }, (_, i) => ({ id: `n${i}.md`, path: `n${i}.md`, basename: `n${i}`, mtime: 1, tags: [], linkCount: 0 }));
    const bigEdges = Array.from({ length: 3000 }, (_, i) => ({ source: `n${i % 500}.md`, target: `n${(i + 1) % 500}.md`, count: 1 }));
    const big = createBridge({
      token: TOKEN,
      writeKey: "wk",
      allowedOrigins: [ALLOWED],
      vault: { getName: () => "Big", listNotes: () => [], getGraph: (mn, me) => ({ nodes: bigNodes.slice(0, mn), edges: bigEdges.slice(0, me), truncated: true }) },
    });
    const a = await big.start(0);
    try {
      const g = await (await fetch(`http://127.0.0.1:${a.port}/graph`, auth)).json();
      expect(g.truncated).toBe(true);
      expect(g.count).toBeLessThanOrEqual(300); // server node bound
      expect(g.edgeCount).toBeLessThanOrEqual(1500); // server edge bound
    } finally {
      await big.close();
    }
  });
});

describe("GET /graph — security", () => {
  it("requires a token (401) and rejects a bad Origin (403)", async () => {
    expect((await fetch(`${base}/graph`)).status).toBe(401);
    expect((await fetch(`${base}/graph`, { headers: { ...auth.headers, Origin: "http://evil.example" } })).status).toBe(403);
  });
  it("is GET-only (POST/PUT/PATCH/DELETE → 405)", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect((await fetch(`${base}/graph`, { method, ...auth })).status, method).toBe(405);
    }
  });
  it("needs no writeKey — a bridge without writeKey still serves the graph", async () => {
    const nw = createBridge({ token: TOKEN, allowedOrigins: [ALLOWED], vault: graphVault() }); // no writeKey
    const a = await nw.start(0);
    try {
      const r = await fetch(`http://127.0.0.1:${a.port}/graph`, auth);
      expect(r.status).toBe(200);
      const conn = await (await fetch(`http://127.0.0.1:${a.port}/connection`, auth)).json();
      expect(conn.writeEnabled).toBe(false); // read-only connection, graph still works
    } finally {
      await nw.close();
    }
  });
});
