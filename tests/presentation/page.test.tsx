// W7-F — /submission/presentation page: overview lists the 5 canonical
// sections with honest "טרם נמדד" rehearsal states, the print handout renders
// ALL 5 sections + presenter notes, and the evaluator demo mode lists the 11
// deterministic steps with the next-action chip.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import PresentationPage from "@/modules/presentation/PresentationPage";
import { PRESENTATION_SECTION_TITLES } from "@/presentation";
import { fresh } from "./helpers";

function ui(): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/submission/presentation"]}>
        <PresentationPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fresh(); // reset repositories + sessionStorage — the page bootstraps itself
});
afterEach(cleanup);

describe("/submission/presentation — page", () => {
  it("bootstraps and lists the EXACTLY-5 canonical sections with honest rehearsal state", async () => {
    render(ui());
    await waitFor(() => expect(screen.getByTestId("presentation-overview")).toBeTruthy(), {
      timeout: 5_000,
    });
    for (const title of PRESENTATION_SECTION_TITLES) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
    // no structural problems banner
    expect(screen.queryByTestId("exactly5-problems")).toBeNull();
    // honest per-section rehearsal state before any real rehearsal
    for (const id of ["ps-1", "ps-2", "ps-3", "ps-4", "ps-5"]) {
      expect(screen.getByTestId(`rehearsal-${id}`).textContent).toContain("טרם נמדד");
    }
    expect(screen.getByTestId("rehearsal-total").textContent).toContain("טרם נמדד");
  });

  it("print handout renders ALL 5 sections with objectives, demo links and presenter notes", async () => {
    render(ui());
    await waitFor(() => expect(screen.getByTestId("presentation-overview")).toBeTruthy(), {
      timeout: 5_000,
    });
    fireEvent.click(screen.getByRole("tab", { name: "דף מודפס" }));
    const handout = await screen.findByTestId("handout-view");
    for (let i = 0; i < 5; i += 1) {
      expect(within(handout).getByText(new RegExp(`שקף ${i + 1} `))).toBeTruthy();
    }
    for (const title of PRESENTATION_SECTION_TITLES) {
      expect(within(handout).getByText(new RegExp(title))).toBeTruthy();
    }
    // presenter notes are part of the printed handout
    expect(within(handout).getAllByText("הערות מרצה:").length).toBe(5);
    expect(within(handout).getAllByText(/\[מסר מרכזי\]|\[הערת כנות\]/).length).toBeGreaterThan(0);
    // demo links + backup source files are listed
    expect(within(handout).getByText("/stage-gates")).toBeTruthy();
    expect(
      within(handout).getByText("docs/screenshots/wave3/command-center-1920x1080.png"),
    ).toBeTruthy();
  });

  it("evaluator demo mode lists 11 steps and highlights the next action", async () => {
    render(ui());
    await waitFor(() => expect(screen.getByTestId("presentation-overview")).toBeTruthy(), {
      timeout: 5_000,
    });
    fireEvent.click(screen.getByRole("tab", { name: "מצב הדגמה לבוחן" }));
    const view = await screen.findByTestId("demo-mode-view");
    const list = within(view).getByTestId("demo-steps-list");
    expect(await within(list).findByText("מרכז הפיקוד")).toBeTruthy();
    expect(within(list).getByText("חזרה למצגת")).toBeTruthy();
    // next-action chip points at step 1 before anything was done
    const chip = within(view).getByTestId("demo-next-chip");
    expect(chip.textContent).toContain("1/11");
    expect(chip.textContent).toContain("מרכז הפיקוד");
    expect(chip.textContent).toContain("הושלמו 0/11");
  });
});
