// S14.2 Phase 1 — /memory Obsidian panel UX + connection lifecycle. Mocks the
// read-only adapter so the panel, hook, and sessionStorage credential are exercised
// without a live bridge. Verifies disconnected/connected/error states, that the
// credential is stored on connect and CLEARED on disconnect, and fail-closed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { ToastProvider } from "@/design-system";

vi.mock("@/integration/obsidian/vaultBridgeClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integration/obsidian/vaultBridgeClient")>();
  return {
    ...actual,
    getConnectionInfo: vi.fn(),
    listNotes: vi.fn(),
    searchNotes: vi.fn(),
    readNote: vi.fn(),
    probeHealth: vi.fn(),
    openInObsidian: vi.fn(),
  };
});

import { getConnectionInfo, probeHealth } from "@/integration/obsidian/vaultBridgeClient";
import { getObsidianToken } from "@/integration/obsidian/obsidianCredential";
import { ObsidianVaultPanel } from "@/modules/memory/obsidian/ObsidianVaultPanel";

const mockedConn = vi.mocked(getConnectionInfo);
const mockedHealth = vi.mocked(probeHealth);

function renderPanel(): ReactElement {
  return render(
    <ToastProvider>
      <ObsidianVaultPanel />
    </ToastProvider>,
  ) as unknown as ReactElement;
}

const CONNECTED = {
  ok: true as const,
  code: "OK" as const,
  status: 200,
  data: { connected: true, vaultName: "TERAGON OS", version: "0.2.0-phase1", readonly: true },
};

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

async function connect(): Promise<void> {
  mockedConn.mockResolvedValue(CONNECTED);
  fireEvent.click(screen.getByTestId("obsidian-connect-btn"));
  fireEvent.change(screen.getByTestId("obsidian-token-input"), { target: { value: "paste-token" } });
  fireEvent.click(screen.getByText("התחבר"));
  await waitFor(() => expect(screen.getByTestId("obsidian-connected")).toBeTruthy());
}

describe("ObsidianVaultPanel", () => {
  it("default state is DISCONNECTED with connect + check actions", () => {
    renderPanel();
    expect(screen.getByTestId("obsidian-disconnected")).toBeTruthy();
    expect(screen.getByTestId("obsidian-connect-btn")).toBeTruthy();
    expect(screen.getByTestId("obsidian-check-btn")).toBeTruthy();
    // no vault identity leaked while disconnected
    expect(screen.queryByTestId("obsidian-vault-name")).toBeNull();
  });

  it("connect success shows vault name + readonly, and STORES the credential", async () => {
    renderPanel();
    await connect();
    expect(screen.getByTestId("obsidian-vault-name").textContent).toBe("TERAGON OS");
    // read-only connection (no writeEnabled) → write shown as disabled
    expect(screen.getByTestId("obsidian-readonly").textContent).toContain("קריאה בלבד");
    expect(getObsidianToken()).toBe("paste-token");
  });

  it("disconnect CLEARS the credential and returns to disconnected", async () => {
    renderPanel();
    await connect();
    fireEvent.click(screen.getByTestId("obsidian-disconnect-btn"));
    await waitFor(() => expect(screen.getByTestId("obsidian-disconnected")).toBeTruthy());
    expect(getObsidianToken()).toBeNull();
  });

  it("invalid credential fails closed (error state, no connection, nothing stored)", async () => {
    renderPanel();
    mockedConn.mockResolvedValue({ ok: false, code: "UNAUTHORIZED", status: 401 });
    fireEvent.click(screen.getByTestId("obsidian-connect-btn"));
    fireEvent.change(screen.getByTestId("obsidian-token-input"), { target: { value: "bad" } });
    fireEvent.click(screen.getByText("התחבר"));
    await waitFor(() => expect(screen.getByTestId("obsidian-error")).toBeTruthy());
    expect(screen.queryByTestId("obsidian-connected")).toBeNull();
    expect(getObsidianToken()).toBeNull();
  });

  it("check with no pairing + unreachable bridge fails closed (error message)", async () => {
    renderPanel();
    mockedHealth.mockResolvedValue({ ok: false, code: "UNAVAILABLE", status: null });
    fireEvent.click(screen.getByTestId("obsidian-check-btn"));
    await waitFor(() => expect(screen.getByTestId("obsidian-error").textContent).toContain("Obsidian אינו זמין"));
  });

  it("all primary controls have accessible names (keyboard/AT operable)", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "חבר Obsidian" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "בדוק חיבור" })).toBeTruthy();
  });
});
