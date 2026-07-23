// W8-D — /settings page: NO key/password inputs anywhere, RTL not toggleable,
// honest disabled reasons, deterministic demo reset through the canonical path.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RailProvider } from "@/app/rail";
import { ToastProvider } from "@/design-system";
import { __resetRepositoriesForTests, getRepository, SEED } from "@/repositories";
import { presentationStores } from "@/presentation/stores";
import { resetDeterministicData } from "@/presentation/demoMode";
import SettingsPage from "@/modules/settings/SettingsPage";

afterEach(cleanup);
beforeEach(() => __resetRepositoriesForTests());

function mountPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <RailProvider>
          <MemoryRouter>
            <SettingsPage />
          </MemoryRouter>
        </RailProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function loaded() {
  await waitFor(() => expect(screen.getAllByText("הגדרות").length).toBeGreaterThanOrEqual(1));
  await screen.findByText("שם העסק");
}

describe("/settings — browser never holds secrets", () => {
  it("has NO password input and NO key-named input anywhere (all 7 groups)", async () => {
    const { container } = mountPage();
    await loaded();
    for (const tab of ["עסק", "ממשק", "התראות", "AI", "זיכרון וידע", "אבטחה", "הדגמה"]) {
      fireEvent.click(screen.getByRole("tab", { name: (n) => n.includes(tab) }));
      expect(container.querySelectorAll('input[type="password"]')).toHaveLength(0);
      for (const input of Array.from(container.querySelectorAll("input, textarea"))) {
        const idName = `${input.getAttribute("id") ?? ""} ${input.getAttribute("name") ?? ""} ${input.getAttribute("aria-label") ?? ""}`;
        expect(idName.toLowerCase()).not.toMatch(/api[-_]?key|token|secret|password/);
        expect(idName).not.toMatch(/מפתח API|סיסמה/);
      }
    }
  });

  it("the AI group points to the server-side setup doc instead of any key field", async () => {
    mountPage();
    await loaded();
    fireEvent.click(screen.getByRole("tab", { name: (n) => n.includes("AI") }));
    expect(screen.getByText("docs/AI_PROVIDER_SETUP.md")).toBeTruthy();
    expect(screen.getByText(/אין ולא יהיה שדה מפתח/)).toBeTruthy();
  });
});

describe("/settings — honest controls", () => {
  it("the RTL toggle is disabled and checked — non-disableable", async () => {
    mountPage();
    await loaded();
    fireEvent.click(screen.getByRole("tab", { name: (n) => n.includes("ממשק") }));
    const rtl = screen.getByLabelText("כיווניות עברית (RTL)") as HTMLInputElement;
    expect(rtl.disabled).toBe(true);
    expect(rtl.checked).toBe(true);
    expect(screen.getByText(/RTL אינו ניתן לכיבוי/)).toBeTruthy();
  });

  it("every read-only control shows its Hebrew reason (no dead toggles)", async () => {
    mountPage();
    await loaded();
    fireEvent.click(screen.getByRole("tab", { name: (n) => n.includes("התראות") }));
    expect(screen.getAllByText(/שרת דיוור/).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("tab", { name: (n) => n.includes("ממשק") }));
    const reduced = screen.getByLabelText("הפחתת אנימציות (override)") as HTMLInputElement;
    expect(reduced.disabled).toBe(true);
  });

  it("the demo group carries the synthetic-data notice and the evaluator link", async () => {
    mountPage();
    await loaded();
    fireEvent.click(screen.getByRole("tab", { name: (n) => n.includes("הדגמה") }));
    expect(screen.getByText(/נתוני הדגמה סינתטיים ודטרמיניסטיים/)).toBeTruthy();
    expect(screen.getByText("מצב הדגמה לבוחן (מצגת)")).toBeTruthy();
    const reset = screen.getByText("איפוס נתוני הדגמה דטרמיניסטי").closest("button");
    expect(reset?.disabled).toBe(false);
  });

  it("sensitive security settings are marked as audited + approval-gated", async () => {
    mountPage();
    await loaded();
    fireEvent.click(screen.getByRole("tab", { name: (n) => n.includes("אבטחה") }));
    const rows = screen.getAllByText("רגיש — עם ביקורת");
    expect(rows.length).toBe(2);
    expect(screen.getAllByText(/שינוי דורש אישור/).length).toBeGreaterThanOrEqual(1);
  });
});

describe("deterministic demo reset (canonical path)", () => {
  it("reset restores the exact seed — same ids, twice in a row", async () => {
    const customers = getRepository("customers");
    await customers.create({ id: "cu-extra", createdAt: "2026-07-23T00:00:00Z", updatedAt: "2026-07-23T00:00:00Z" });
    const r1 = await resetDeterministicData(presentationStores(), () => "2026-07-23T09:00:00.000Z");
    const ids1 = (await customers.list()).map((c) => c.id).sort();
    const r2 = await resetDeterministicData(presentationStores(), () => "2026-07-23T09:00:00.000Z");
    const ids2 = (await customers.list()).map((c) => c.id).sort();
    expect(ids1).toEqual(ids2);
    expect(ids1).toEqual(SEED.customers.map((c) => c.id).sort());
    expect(r1.clearedCollections).toBe(r2.clearedCollections);
  });
});
