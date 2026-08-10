// Live knowledge graph UI: disconnected / loaded / error states, source attribution,
// node select → details, read note reuse, accessible relationship list.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/design-system";

vi.mock("@/integration/obsidian/obsidianCredential", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integration/obsidian/obsidianCredential")>();
  return { ...actual, getObsidianToken: vi.fn() };
});
vi.mock("@/integration/obsidian/vaultBridgeClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integration/obsidian/vaultBridgeClient")>();
  return { ...actual, getConnectionInfo: vi.fn(), getVaultGraph: vi.fn(), readNote: vi.fn(), openInObsidian: vi.fn() };
});

import { getObsidianToken } from "@/integration/obsidian/obsidianCredential";
import { getConnectionInfo, getVaultGraph, openInObsidian, readNote } from "@/integration/obsidian/vaultBridgeClient";
import { KnowledgeGraphPanel } from "@/modules/memory/obsidian/KnowledgeGraphPanel";

const mToken = vi.mocked(getObsidianToken);
const mConn = vi.mocked(getConnectionInfo);
const mGraph = vi.mocked(getVaultGraph);
const mRead = vi.mocked(readNote);
const mOpen = vi.mocked(openInObsidian);

const GRAPH = {
  ok: true as const,
  code: "OK" as const,
  status: 200,
  data: {
    nodes: [
      { id: "Company.md", path: "Company.md", basename: "Company", mtime: 1, tags: [], linkCount: 2 },
      { id: "Customers.md", path: "Customers.md", basename: "Customers", mtime: 1, tags: [], linkCount: 1 },
      { id: "Orphan.md", path: "Orphan.md", basename: "Orphan", mtime: 1, tags: [], linkCount: 0 },
    ],
    edges: [{ source: "Company.md", target: "Customers.md", count: 1 }],
    count: 3,
    edgeCount: 1,
    truncated: false,
  },
};

function renderPanel() {
  render(
    <ToastProvider>
      <KnowledgeGraphPanel />
    </ToastProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("KnowledgeGraphPanel", () => {
  it("shows a connect prompt when there is no token", async () => {
    mToken.mockReturnValue(null);
    renderPanel();
    await waitFor(() => expect(screen.getByText(/התחברו ל-Obsidian/)).toBeTruthy());
    expect(mGraph).not.toHaveBeenCalled();
  });

  it("loads the live graph with source attribution + accessible relationship list", async () => {
    mToken.mockReturnValue("tok");
    mConn.mockResolvedValue({ ok: true, code: "OK", status: 200, data: { connected: true, vaultName: "TERAGON OS", version: "0.3.0-phase3", readonly: false, writeEnabled: true } });
    mGraph.mockResolvedValue(GRAPH);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("obsidian-graph-svg")).toBeTruthy());
    expect(screen.getByTestId("obsidian-graph-source").textContent).toContain("TERAGON OS");
    expect(screen.getByTestId("obsidian-graph-relationships")).toBeTruthy();
    // node meta only — no note body anywhere
    expect(document.body.textContent).not.toMatch(/frontmatter|cachedRead/);
  });

  it("selecting a node opens details; 'קרא מסמך' reuses readNote; 'פתח' uses openInObsidian", async () => {
    mToken.mockReturnValue("tok");
    mConn.mockResolvedValue({ ok: true, code: "OK", status: 200, data: { connected: true, vaultName: "TERAGON OS", version: "v", readonly: false, writeEnabled: true } });
    mGraph.mockResolvedValue(GRAPH);
    mRead.mockResolvedValue({ ok: true, code: "OK", status: 200, data: { path: "Company.md", basename: "Company", frontmatter: null, mtime: 1, content: "# Company\n\nbody", truncated: false } });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("obsidian-graph-relationships")).toBeTruthy());
    // select via the accessible relationship list
    fireEvent.click(screen.getByText("Company"));
    await waitFor(() => expect(screen.getByTestId("obsidian-graph-details")).toBeTruthy());
    fireEvent.click(screen.getByTestId("obsidian-graph-read"));
    await waitFor(() => expect(mRead).toHaveBeenCalledWith("Company.md", "tok"));
    fireEvent.click(screen.getByTestId("obsidian-graph-open"));
    expect(mOpen).toHaveBeenCalledWith("TERAGON OS", "Company.md");
  });

  it("fails closed when the bridge is unavailable (no fabricated graph)", async () => {
    mToken.mockReturnValue("tok");
    mConn.mockResolvedValue({ ok: false, code: "UNAVAILABLE", status: null });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("obsidian-graph-error").textContent).toContain("Obsidian אינו זמין"));
    expect(screen.queryByTestId("obsidian-graph-svg")).toBeNull();
  });
});
