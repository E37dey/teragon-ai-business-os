// W7-E (7.19) — /submission page smoke: honest readiness header (never green
// with blockers), the 12 deliverable cards, and the "מבקר ההגשה" rail.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RailProvider } from "@/app/rail";
import { __resetRepositoriesForTests } from "@/repositories";
import SubmissionPage from "@/modules/submission/SubmissionPage";
import { REGISTRY_DELIVERABLE_TITLES } from "@/domain/submission";

beforeEach(() => {
  __resetRepositoriesForTests();
});
afterEach(cleanup);

function renderPage(initialEntry = "/submission") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RailProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <SubmissionPage />
        </MemoryRouter>
      </RailProvider>
    </QueryClientProvider>,
  );
}

describe("/submission page", () => {
  it("renders the honest readiness header — NEVER green while blockers exist", async () => {
    renderPage();
    await waitFor(
      () => {
        expect(screen.getByText("מרכז ההגשה והראיות")).toBeTruthy();
      },
      { timeout: 5000 },
    );
    const chip = await screen.findByText(/מוכנות להגשה:/, undefined, { timeout: 5000 });
    // honest header: with open blockers the state is never the green one
    expect(chip.textContent).toMatch(/לא מוכן להגשה|בהכנה/);
  });

  it("renders all 12 deliverable cards with owner + approval status", async () => {
    renderPage();
    await waitFor(
      () => {
        expect(screen.getByText(/1\. One-Pager לפתרון/)).toBeTruthy();
      },
      { timeout: 5000 },
    );
    for (const title of Object.values(REGISTRY_DELIVERABLE_TITLES)) {
      expect(
        screen.getAllByText((content) => content.includes(title)).length,
      ).toBeGreaterThan(0);
    }
    // honest approval state — the canonical engine has not approved anything
    expect(screen.getAllByText(/אין רשומת אישור/).length).toBeGreaterThan(0);
  });

  it("shows the honest 'no forced 12/12' completeness note", async () => {
    renderPage();
    await waitFor(
      () => {
        expect(screen.getByText(/אין 12\/12 מאולץ/)).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });
});
