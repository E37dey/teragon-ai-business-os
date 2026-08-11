// S18 Phase 8 — the WorkflowMode pack integration: ?pack selects a pack and prefills its intent
// WITHOUT auto-starting; the picker prefills the (editable) intent; ?run still focuses a run (no
// picker); the recovery pack surfaces the real failed run + reason. Trusted config only.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/app/queryClient";
import { AuthProvider } from "@/auth/AuthProvider";
import { ToastProvider } from "@/design-system";
import { __resetRepositoriesForTests } from "@/repositories";
import { __resetIdbConnectionForTests } from "@/repositories/IndexedDBRepository";

vi.mock("@/integration/obsidian/obsidianCredential", async (o) => ({ ...(await o<typeof import("@/integration/obsidian/obsidianCredential")>()), getObsidianToken: vi.fn(() => null) }));
vi.mock("@/integration/obsidian/vaultBridgeClient", async (o) => ({ ...(await o<typeof import("@/integration/obsidian/vaultBridgeClient")>()), getConnectionInfo: vi.fn(), searchNotes: vi.fn(), readNote: vi.fn(), getVaultGraph: vi.fn() }));

import { WorkflowMode } from "@/modules/ai-workspace/visual/WorkflowMode";
import { getWorkflowPack } from "@/agents/workflow/workflowPacks";
import { recordWorkflowEvent, __resetWorkflowEventsForTests, type WorkflowEventType } from "@/agents/workflow/workflowEvents";
import { __resetRetrievalTraceForTests } from "@/agents/obsidian/retrievalTrace";

function wrap(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider><QueryClientProvider client={queryClient}><ToastProvider><WorkflowMode /></ToastProvider></QueryClientProvider></AuthProvider>
    </MemoryRouter>,
  );
}
let seq = 0;
const rec = (runId: string, type: WorkflowEventType, extra: Record<string, unknown> = {}) =>
  recordWorkflowEvent({ id: `e${seq++}`, workflowRunId: runId, type, at: 1000 + seq, detailHe: (extra.detailHe as string) ?? "", success: (extra.success as boolean) ?? true, ...extra });

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __resetIdbConnectionForTests();
  __resetRepositoriesForTests();
  queryClient.clear();
  vi.clearAllMocks();
  __resetWorkflowEventsForTests();
  __resetRetrievalTraceForTests();
});
afterEach(() => {
  cleanup();
  __resetWorkflowEventsForTests();
  __resetRetrievalTraceForTests();
});

describe("Phase 8 — WorkflowMode pack integration", () => {
  it("?pack selects the flagship + prefills its intent WITHOUT auto-starting", async () => {
    wrap("/ai-workspace?pack=governed-knowledge-capture");
    await waitFor(() => expect(screen.getByTestId("workflow-packs")).toBeTruthy());
    const flagship = screen.getAllByTestId("pack-card").find((c) => c.getAttribute("data-pack") === "governed-knowledge-capture")!;
    expect(flagship.getAttribute("data-selected")).toBe("true");
    // intent prefilled from trusted pack config
    const input = screen.getByLabelText("בקשת תהליך הידע") as HTMLInputElement;
    expect(input.value).toBe(getWorkflowPack("governed-knowledge-capture")!.intentTemplate);
    // NOT started: no workflow events, Start button present
    expect(screen.queryAllByTestId("workflow-event")).toHaveLength(0);
    expect(screen.getByTestId("workflow-start")).toBeTruthy();
  });

  it("clicking a pack card prefills the (editable) intent and does not start", async () => {
    wrap("/ai-workspace");
    await waitFor(() => expect(screen.getByTestId("workflow-packs")).toBeTruthy());
    const flagship = screen.getAllByTestId("pack-card").find((c) => c.getAttribute("data-pack") === "governed-knowledge-capture")!;
    fireEvent.click(flagship);
    const input = screen.getByLabelText("בקשת תהליך הידע") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe(getWorkflowPack("governed-knowledge-capture")!.intentTemplate));
    expect(screen.queryAllByTestId("workflow-event")).toHaveLength(0);
  });

  it("?run focuses a recorded run (Phase-7) — the pack picker is NOT shown", async () => {
    rec("wf-focus", "WORKFLOW_STARTED");
    rec("wf-focus", "USER_DECISION_REQUIRED");
    wrap("/ai-workspace?run=wf-focus");
    await waitFor(() => expect(screen.getByTestId("workflow-focus-readonly")).toBeTruthy());
    expect(screen.queryByTestId("workflow-packs")).toBeNull(); // run focus wins over pack
    expect(screen.getAllByTestId("workflow-event").length).toBeGreaterThan(0);
  });

  it("operational-recovery surfaces the real most-recent failed run + reason", async () => {
    rec("wf-bad", "WORKFLOW_STARTED");
    rec("wf-bad", "VAULT_UNAVAILABLE", { success: false });
    rec("wf-bad", "WORKFLOW_FAILED", { success: false, detailHe: "Obsidian אינו זמין — התהליך נעצר ללא ידע חי." });
    wrap("/ai-workspace?pack=operational-recovery");
    await waitFor(() => expect(screen.getByTestId("recovery-context")).toBeTruthy());
    const ctx = screen.getByTestId("recovery-context");
    expect(ctx.textContent).toContain("wf-bad");
    expect(ctx.textContent).toContain("Obsidian אינו זמין");
    // recovery Start is a retry, not a governed action
    expect(screen.getByTestId("workflow-start").textContent).toContain("התחל מחדש");
  });
});
