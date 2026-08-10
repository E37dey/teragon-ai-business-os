// S14.6 Phase 4 — the sanitized runtime trace store is bounded (drop-oldest) and never
// stores a note body or a secret. Deterministic — proves the cap without real bridge reads.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetRetrievalTraceForTests, getRetrievals, getRetrievalsForNote, recordRetrieval, type AgentRetrievalTrace } from "@/agents/obsidian/retrievalTrace";

const trace = (i: number): AgentRetrievalTrace => ({
  id: `t-${i}`,
  agentId: "ag-wiki",
  action: "read",
  vaultName: "TERAGON OS",
  notePath: `Note-${i}.md`,
  basename: `Note-${i}`,
  resultCount: 1,
  at: i,
  correlationId: `t-${i}`,
  success: true,
});

beforeEach(() => __resetRetrievalTraceForTests());
afterEach(() => __resetRetrievalTraceForTests());

describe("retrievalTrace — bounds + sanitization", () => {
  it("enforces the drop-oldest cap of 200 (deterministic, no real reads)", () => {
    for (let i = 0; i < 250; i++) recordRetrieval(trace(i));
    const all = getRetrievals();
    expect(all).toHaveLength(200);
    // oldest 50 dropped; newest retained
    expect(all[0]?.id).toBe("t-50");
    expect(all[all.length - 1]?.id).toBe("t-249");
  });
  it("stores metadata sufficient to derive the visual relation — but no body/secret shape", () => {
    recordRetrieval(trace(1));
    const t = getRetrievals()[0]!;
    // sufficient for the Agent→Note edge
    expect(t.agentId).toBe("ag-wiki");
    expect(t.notePath).toBe("Note-1.md");
    expect(t.vaultName).toBe("TERAGON OS");
    expect(t.action).toBe("read");
    expect(typeof t.at).toBe("number");
    expect(t.correlationId).toBe("t-1");
    // the trace shape has no field for a body or a credential
    expect(Object.keys(t)).not.toContain("content");
    expect(Object.keys(t)).not.toContain("token");
    expect(Object.keys(t)).not.toContain("body");
  });
  it("getRetrievalsForNote returns only successful reads of that exact note", () => {
    recordRetrieval(trace(1));
    recordRetrieval({ ...trace(2), notePath: "Note-1.md", success: false });
    expect(getRetrievalsForNote("Note-1.md").map((t) => t.id)).toEqual(["t-1"]);
    expect(getRetrievalsForNote("Missing.md")).toEqual([]);
  });
});
