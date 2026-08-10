// S14.6 Phase 4 — agent inspector Obsidian read control: denied notice, allowed
// search → read → honest source attribution, and a real Agent→Note trace/edge.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/design-system";

vi.mock("@/integration/obsidian/obsidianCredential", async (o) => ({ ...(await o<typeof import("@/integration/obsidian/obsidianCredential")>()), getObsidianToken: vi.fn() }));
vi.mock("@/integration/obsidian/vaultBridgeClient", async (o) => ({ ...(await o<typeof import("@/integration/obsidian/vaultBridgeClient")>()), getConnectionInfo: vi.fn(), searchNotes: vi.fn(), readNote: vi.fn() }));

import { getObsidianToken } from "@/integration/obsidian/obsidianCredential";
import { getConnectionInfo, searchNotes, readNote } from "@/integration/obsidian/vaultBridgeClient";
import { AgentObsidianPanel } from "@/modules/ai-workspace/visual/AgentObsidianPanel";
import { __resetRetrievalTraceForTests } from "@/agents/obsidian/retrievalTrace";
import { deriveAgentNoteUsages } from "@/modules/ai-workspace/visual/crossView";

const conn = { ok: true as const, code: "OK" as const, status: 200, data: { connected: true, vaultName: "TERAGON OS", version: "v", readonly: true, writeEnabled: false } };

beforeEach(() => {
  vi.clearAllMocks();
  __resetRetrievalTraceForTests();
  vi.mocked(getObsidianToken).mockReturnValue("tok-secret");
  vi.mocked(getConnectionInfo).mockResolvedValue(conn);
});
afterEach(() => {
  cleanup();
  __resetRetrievalTraceForTests();
});

const wrap = (id: string) => render(<ToastProvider><AgentObsidianPanel agentId={id} /></ToastProvider>);

describe("AgentObsidianPanel", () => {
  it("a DENIED agent sees a capability-denied notice and NO search control", () => {
    wrap("ag-hunter");
    expect(screen.getByTestId("agent-obsidian-denied")).toBeTruthy();
    expect(screen.queryByTestId("agent-obsidian-search")).toBeNull();
  });

  it("an ALLOWED agent can search → read a live note with honest source attribution + real trace", async () => {
    vi.mocked(searchNotes).mockResolvedValue({ ok: true, code: "OK", status: 200, data: { results: [{ path: "AI Operations.md", basename: "AI Operations", snippet: "orchestrates AI + automation", mtime: 1 }], count: 1, truncated: false } });
    vi.mocked(readNote).mockResolvedValue({ ok: true, code: "OK", status: 200, data: { path: "AI Operations.md", basename: "AI Operations", frontmatter: null, mtime: 1, content: "# AI Operations\n\nlinks AI + Automation + Operations", truncated: false } });
    wrap("ag-wiki");
    fireEvent.change(screen.getByLabelText("חיפוש חי במסמכי Obsidian"), { target: { value: "AI Operations" } });
    fireEvent.click(screen.getByTestId("agent-obsidian-search"));
    await waitFor(() => expect(screen.getByTestId("agent-obsidian-results")).toBeTruthy());
    fireEvent.click(screen.getByTestId("agent-obsidian-read"));
    await waitFor(() => expect(screen.getByTestId("agent-obsidian-source")).toBeTruthy());
    // honest source attribution shown
    expect(screen.getByTestId("agent-obsidian-source").textContent).toContain("TERAGON OS");
    expect(screen.getByTestId("agent-obsidian-content").textContent).toContain("AI Operations");
    // a REAL Agent→Note usage now exists from the trace
    const usages = deriveAgentNoteUsages();
    expect(usages.map((u) => `${u.agentId}:${u.path}`)).toContain("ag-wiki:AI Operations.md");
    // no token leaked into the DOM
    expect(document.body.textContent).not.toContain("tok-secret");
  });
});
