// Reconnect fix — the user-visible "קרא מסמך" flow in the Knowledge Graph.
//
// Real scenario: connected → read works → plugin restarts → the browser token is
// now stale → next "קרא מסמך" gets 401 → the panel must show a reconnect state
// (not a dead-end toast), remember the pending read, and after an EXPLICIT valid
// re-pair, resume that exact read ONCE. Invalid token stays disconnected; a
// bridge-unavailable read is NOT treated as an auth expiry.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/design-system";

vi.mock("@/integration/obsidian/obsidianCredential", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integration/obsidian/obsidianCredential")>();
  return { ...actual, getObsidianToken: vi.fn(), setObsidianToken: vi.fn() };
});
vi.mock("@/integration/obsidian/vaultBridgeClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integration/obsidian/vaultBridgeClient")>();
  return { ...actual, getConnectionInfo: vi.fn(), getVaultGraph: vi.fn(), readNote: vi.fn(), openInObsidian: vi.fn() };
});

import { getObsidianToken, setObsidianToken } from "@/integration/obsidian/obsidianCredential";
import { getConnectionInfo, getVaultGraph, readNote } from "@/integration/obsidian/vaultBridgeClient";
import { KnowledgeGraphPanel } from "@/modules/memory/obsidian/KnowledgeGraphPanel";

const mToken = vi.mocked(getObsidianToken);
const mSetToken = vi.mocked(setObsidianToken);
const mConn = vi.mocked(getConnectionInfo);
const mGraph = vi.mocked(getVaultGraph);
const mRead = vi.mocked(readNote);

const CONNECTED = { ok: true as const, code: "OK" as const, status: 200, data: { connected: true, vaultName: "TERAGON OS", version: "v", readonly: false, writeEnabled: true } };
const GRAPH = {
  ok: true as const,
  code: "OK" as const,
  status: 200,
  data: {
    nodes: [{ id: "Customer Success.md", path: "Customer Success.md", basename: "Customer Success", mtime: 1, tags: [], linkCount: 2 }],
    edges: [],
    count: 1,
    edgeCount: 0,
    truncated: false,
  },
};
const UNAUTHORIZED = { ok: false as const, code: "UNAUTHORIZED" as const, status: 401 };
const NOTE_OK = { ok: true as const, code: "OK" as const, status: 200, data: { path: "Customer Success.md", basename: "Customer Success", frontmatter: null, mtime: 1, content: "# Customer Success\n\nlive body", truncated: false } };

function renderPanel() {
  render(
    <ToastProvider>
      <KnowledgeGraphPanel />
    </ToastProvider>,
  );
}

async function loadAndSelect() {
  mToken.mockReturnValue("stale-token");
  mConn.mockResolvedValue(CONNECTED);
  mGraph.mockResolvedValue(GRAPH);
  renderPanel();
  await waitFor(() => expect(screen.getByTestId("obsidian-graph-relationships")).toBeTruthy());
  fireEvent.click(screen.getByText("Customer Success"));
  await waitFor(() => expect(screen.getByTestId("obsidian-graph-details")).toBeTruthy());
}

beforeEach(() => vi.resetAllMocks()); // resetAllMocks also drains any leftover mock*Once queue
afterEach(() => cleanup());

describe("KnowledgeGraphPanel — stale-token reconnect", () => {
  it("read → 401 shows the reconnect state (no note, header flips, open-in-Obsidian stays)", async () => {
    await loadAndSelect();
    mRead.mockResolvedValueOnce(UNAUTHORIZED);
    fireEvent.click(screen.getByTestId("obsidian-graph-read"));

    await waitFor(() => expect(screen.getByTestId("obsidian-graph-reconnect")).toBeTruthy());
    // reconnect required is surfaced (header chip + inspector); the note body never appears
    expect(screen.getAllByText("נדרש חיבור מחדש").length).toBeGreaterThan(0);
    expect(screen.queryByText(/live body/)).toBeNull();
    // "פתח ב-Obsidian" (obsidian:// URI, no bridge token) stays available
    expect(screen.getByTestId("obsidian-graph-open")).toBeTruthy();
    // the reconnect pairing modal is open for a fresh token
    expect(screen.getByTestId("obsidian-token-input")).toBeTruthy();
  });

  it("reconnect with an INVALID token stays disconnected (error shown, nothing resumed)", async () => {
    await loadAndSelect();
    mRead.mockResolvedValueOnce(UNAUTHORIZED);
    fireEvent.click(screen.getByTestId("obsidian-graph-read"));
    await waitFor(() => expect(screen.getByTestId("obsidian-token-input")).toBeTruthy());

    mConn.mockResolvedValueOnce(UNAUTHORIZED); // /connection rejects the pasted token
    fireEvent.change(screen.getByTestId("obsidian-token-input"), { target: { value: "still-bad" } });
    fireEvent.click(screen.getByTestId("obsidian-pairing-submit"));

    await waitFor(() => expect(screen.getByTestId("obsidian-pairing-error").textContent).toContain("אינו תקין"));
    expect(mSetToken).not.toHaveBeenCalled(); // never persisted an unverified token
    expect(mRead).toHaveBeenCalledTimes(1); // no resumed read
    expect(screen.queryByText(/live body/)).toBeNull();
  });

  it("reconnect with a VALID token verifies via /connection and resumes the pending read EXACTLY once", async () => {
    await loadAndSelect();
    mRead.mockResolvedValueOnce(UNAUTHORIZED); // stale read fails
    fireEvent.click(screen.getByTestId("obsidian-graph-read"));
    await waitFor(() => expect(screen.getByTestId("obsidian-token-input")).toBeTruthy());

    // fresh pairing verifies + the resumed read now succeeds
    mConn.mockResolvedValue(CONNECTED);
    mRead.mockResolvedValueOnce(NOTE_OK);
    fireEvent.change(screen.getByTestId("obsidian-token-input"), { target: { value: "fresh-token-xyz" } });
    fireEvent.click(screen.getByTestId("obsidian-pairing-submit"));

    // the ORIGINAL read resumes without the user clicking "קרא מסמך" again
    await waitFor(() => expect(screen.getByText(/live body/)).toBeTruthy());
    expect(mSetToken).toHaveBeenCalledWith("fresh-token-xyz"); // persisted only after verify
    expect(mRead).toHaveBeenCalledTimes(2); // 1 failed + 1 resumed — exactly once
    expect(mRead.mock.calls.every((c) => c[0] === "Customer Success.md")).toBe(true);
    // the token value is never rendered into the DOM
    expect(document.body.textContent).not.toContain("fresh-token-xyz");
  });

  it("reconnect from the error state with NO pending read does not auto-open any read", async () => {
    // Enter the error/reconnect state directly via a 401 on graph load (no read intent).
    mToken.mockReturnValue("stale-token");
    mConn.mockResolvedValueOnce(UNAUTHORIZED); // /connection during load → 401
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("obsidian-graph-reconnect-btn")).toBeTruthy());
    fireEvent.click(screen.getByTestId("obsidian-graph-reconnect-btn"));

    // Valid re-pair; graph reloads, but there is NO pending read to resume.
    mConn.mockResolvedValue(CONNECTED);
    mGraph.mockResolvedValue(GRAPH);
    fireEvent.change(screen.getByTestId("obsidian-token-input"), { target: { value: "fresh" } });
    fireEvent.click(screen.getByTestId("obsidian-pairing-submit"));

    await waitFor(() => expect(mSetToken).toHaveBeenCalledWith("fresh"));
    expect(mRead).not.toHaveBeenCalled(); // no note auto-opened without an intent
  });

  it("a bridge-UNAVAILABLE read is NOT a reconnect (honest failure, no reconnect UI)", async () => {
    await loadAndSelect();
    mRead.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE", status: null });
    fireEvent.click(screen.getByTestId("obsidian-graph-read"));

    await waitFor(() => expect(mRead).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("obsidian-graph-reconnect")).toBeNull();
    expect(screen.queryByTestId("obsidian-token-input")).toBeNull();
    // read button is still the offered action (not swapped for reconnect)
    expect(screen.getByTestId("obsidian-graph-read")).toBeTruthy();
  });
});
