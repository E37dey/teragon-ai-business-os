// S14.4 Phase 3 — write UI: propose → preview/diff → explicit approval. Mocks the
// service to prove no write happens before approval, and reject/conflict states.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/design-system";

vi.mock("@/integration/obsidian/obsidianWrite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integration/obsidian/obsidianWrite")>();
  return {
    ...actual, // keep real isSafeMarkdownPath
    createWriteProposal: vi.fn(),
    executeWriteProposal: vi.fn(),
    approveWriteProposal: vi.fn((p) => ({ ...p, state: "APPROVED" })),
    rejectWriteProposal: vi.fn((p) => ({ ...p, state: "REJECTED" })),
  };
});

import { createWriteProposal, executeWriteProposal } from "@/integration/obsidian/obsidianWrite";
import { clearObsidianWriteKey, setObsidianWriteKey } from "@/integration/obsidian/obsidianCredential";
import { WriteProposeModal } from "@/modules/memory/obsidian/WriteProposeModal";

const mkProposal = vi.mocked(createWriteProposal);
const mkExec = vi.mocked(executeWriteProposal);

const FAKE = {
  proposalId: "owp-1",
  operation: "create" as const,
  vaultName: "TERAGON OS",
  path: "New.md",
  baseContent: null,
  baseHash: null,
  proposedContent: "# New\n\nbody",
  appendBlock: null,
  proposedHash: "h",
  createdAt: "t",
  requesterId: "u-tzachi",
  requesterName: "צחי זוסטייהם",
  correlationId: "cid-1",
  mutationId: "mut-1",
  state: "PROPOSED" as const,
  approvedById: null,
  approvedByName: null,
  approvedAt: null,
  resultHash: null,
  failureCode: null,
};

function renderModal() {
  render(
    <ToastProvider>
      <WriteProposeModal vaultName="TERAGON OS" onLoadCurrent={vi.fn()} onClose={vi.fn()} />
    </ToastProvider>,
  );
}

async function toPreview() {
  fireEvent.change(screen.getByTestId("obsidian-write-path"), { target: { value: "New.md" } });
  fireEvent.change(screen.getByTestId("obsidian-write-content"), { target: { value: "# New\n\nbody" } });
  fireEvent.click(screen.getByTestId("obsidian-write-propose"));
  await waitFor(() => expect(screen.getByTestId("obsidian-write-preview")).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  setObsidianWriteKey("test-write-key"); // write authorization present for the approve-path tests
  mkProposal.mockResolvedValue({ ...FAKE });
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("WriteProposeModal", () => {
  it("propose shows a preview + not-sync warning and does NOT write before approval", async () => {
    mkExec.mockResolvedValue({ ...FAKE, state: "WRITTEN", resultHash: "deadbeef00000000" });
    renderModal();
    await toPreview();
    expect(screen.getByTestId("obsidian-write-warning").textContent).toContain("אינה סנכרון");
    expect(mkExec).not.toHaveBeenCalled(); // no write yet
  });

  it("approve executes exactly one write and shows success", async () => {
    mkExec.mockResolvedValue({ ...FAKE, state: "WRITTEN", resultHash: "deadbeef00000000" });
    renderModal();
    await toPreview();
    fireEvent.click(screen.getByTestId("obsidian-write-approve"));
    await waitFor(() => expect(screen.getByTestId("obsidian-write-success")).toBeTruthy());
    expect(mkExec).toHaveBeenCalledTimes(1);
  });

  it("reject writes nothing", async () => {
    renderModal();
    await toPreview();
    fireEvent.click(screen.getByTestId("obsidian-write-reject"));
    await waitFor(() => expect(screen.getByTestId("obsidian-write-result")).toBeTruthy());
    expect(mkExec).not.toHaveBeenCalled();
  });

  it("without a paired write key, approval is GATED (write-key pairing shown, no approve)", async () => {
    clearObsidianWriteKey();
    renderModal();
    await toPreview();
    expect(screen.getByTestId("obsidian-write-keypair")).toBeTruthy();
    expect(screen.queryByTestId("obsidian-write-approve")).toBeNull();
    expect(mkExec).not.toHaveBeenCalled();
  });

  it("conflict result shows the refresh-and-recheck message (no forced overwrite)", async () => {
    mkExec.mockResolvedValue({ ...FAKE, state: "CONFLICT", failureCode: "CONFLICT" });
    renderModal();
    await toPreview();
    fireEvent.click(screen.getByTestId("obsidian-write-approve"));
    await waitFor(() => expect(screen.getByTestId("obsidian-write-conflict")).toBeTruthy());
    expect(screen.getByTestId("obsidian-write-conflict").textContent).toContain("השתנה מאז התצוגה המקדימה");
  });
});
