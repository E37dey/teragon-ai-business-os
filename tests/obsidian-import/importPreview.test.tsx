// S14.3 Phase 2 — import preview modal UX: source/destination separation, not-sync
// warning, create wiring (proposal only), and unchanged → create disabled (no silent dup).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/design-system";

vi.mock("@/integration/obsidian/obsidianImport", () => ({
  classifyObsidianNote: vi.fn(),
  createObsidianImportProposal: vi.fn(),
  obsidianImportRefId: (p: string) => `imported-markdown:${p}`,
}));
vi.mock("@/app/data/hooks", () => ({ invalidateCollections: vi.fn().mockResolvedValue(undefined) }));

import { classifyObsidianNote, createObsidianImportProposal } from "@/integration/obsidian/obsidianImport";
import { ImportPreviewModal } from "@/modules/memory/obsidian/ObsidianVaultPanel";

const mockedClassify = vi.mocked(classifyObsidianNote);
const mockedCreate = vi.mocked(createObsidianImportProposal);

const NOTE = {
  path: "Alpha Note.md",
  basename: "Alpha Note",
  frontmatter: { tags: "x" },
  mtime: 123,
  content: "# Alpha Note\n\nbody",
  truncated: false,
};

function renderModal() {
  render(
    <ToastProvider>
      <ImportPreviewModal note={NOTE} vaultName="TERAGON OS" onClose={() => {}} />
    </ToastProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("ImportPreviewModal", () => {
  it("shows source=Obsidian, destination=governed knowledge, and a NOT-sync warning; create makes a proposal", async () => {
    mockedClassify.mockResolvedValue({ status: "new", existingSourceId: null, existingCapturedAt: null });
    mockedCreate.mockResolvedValue({} as never);
    renderModal();

    await waitFor(() => expect(screen.getByTestId("obsidian-import-status")).toBeTruthy());
    expect(screen.getByTestId("obsidian-import-destination").textContent).toContain("ידע מנוהל");
    expect(screen.getByRole("note").textContent).toContain("אינו סנכרון");

    fireEvent.click(screen.getByTestId("obsidian-import-create"));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith({ path: NOTE.path, content: NOTE.content }));
    await waitFor(() => expect(screen.getByText("נוצרה הצעה")).toBeTruthy());
  });

  it("unchanged note disables create (no silent duplicate)", async () => {
    mockedClassify.mockResolvedValue({ status: "unchanged", existingSourceId: "src-1", existingCapturedAt: "t" });
    renderModal();
    await waitFor(() => expect(screen.getByTestId("obsidian-import-status").textContent).toContain("כבר יובא"));
    expect(screen.queryByTestId("obsidian-import-create")).toBeNull(); // enabled create button is absent
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
