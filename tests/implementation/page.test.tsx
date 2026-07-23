// W7-A — /implementation page selectors: six stage cards, five rollout waves,
// honest pilot state, drawer tabs on real records, rail "מבקר ההטמעה".
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { RailProvider } from "@/app/rail";
import { useRailContent } from "@/app/railContext";
import { __resetRepositoriesForTests } from "@/repositories";
import { implementationStores } from "@/repositories/implementationStores";
import { ensureImplementationProgramme } from "@/domain/adoption/bootstrap";
import ImplementationPage from "@/modules/implementation/ImplementationPage";
import { makeClock } from "./helpers";

/** Renders the published rail content — stands in for OsShell's rail slot. */
function RailOutlet(): ReactElement {
  return <aside data-testid="test-rail-outlet">{useRailContent()}</aside>;
}

function ui(): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <RailProvider>
        <ImplementationPage />
        <RailOutlet />
      </RailProvider>
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  __resetRepositoriesForTests();
  // run the bootstrap deterministically BEFORE render (the page's own
  // module-level single-flight guard may have consumed its first run already)
  await ensureImplementationProgramme(implementationStores(), makeClock());
});
afterEach(cleanup);

describe("/implementation — page selectors", () => {
  it("renders header, health KPIs, current stage, exactly 6 stage cards and 5 waves", async () => {
    render(ui());
    await waitFor(() => expect(screen.getByTestId("stage-roadmap")).toBeTruthy());
    expect(screen.getAllByText("תכנית ההטמעה").length).toBeGreaterThan(0);
    expect(screen.getByTestId("implementation-health")).toBeTruthy();
    // exactly six stage cards
    for (let i = 1; i <= 6; i += 1) expect(screen.getByTestId(`stage-card-${i}`)).toBeTruthy();
    expect(screen.queryByTestId("stage-card-7")).toBeNull();
    // exactly five rollout waves
    for (let i = 1; i <= 5; i += 1) expect(screen.getByTestId(`rollout-wave-${i}`)).toBeTruthy();
    expect(screen.queryByTestId("rollout-wave-6")).toBeNull();
    // Gantt present
    expect(screen.getByTestId("implementation-gantt")).toBeTruthy();
    // current stage honest — pilot in progress, not completed
    const current = screen.getByTestId("current-stage-panel");
    expect(within(current).getByText(/פיילוט מבוקר/)).toBeTruthy();
  });

  it("shows the honest pilot/baseline states (טרם נמדד / חסרות ראיות / קו בסיס)", async () => {
    render(ui());
    await waitFor(() => expect(screen.getByTestId("rail-pilot-readiness")).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId("rail-pilot-readiness").textContent).toContain("חסרות ראיות"),
    );
    expect(screen.getByTestId("rail-pilot-readiness").textContent).toContain("טרם נמדד");
    expect(screen.getByText("לא הוגדר קו בסיס")).toBeTruthy();
  });

  it("rail 'מבקר ההטמעה' derives risk / evidence / decision / action honestly", async () => {
    render(ui());
    await waitFor(() => expect(screen.getByText("מבקר ההטמעה")).toBeTruthy());
    // blocking risk = the highest open risk from the register
    await waitFor(() =>
      expect(screen.getByTestId("rail-blocking-risk").textContent).toContain("ההדרכה נשכחת"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("rail-missing-evidence").textContent).toContain("חסרות ראיות"),
    );
    expect(screen.getByTestId("rail-overdue-owner").textContent).toContain("אין אבן דרך באיחור");
    expect(screen.getByTestId("rail-next-decision").textContent).toContain("G1");
    expect(screen.getByTestId("rail-next-action").textContent).toContain("פיילוט");
    expect(screen.getByTestId("rail-submission-deliverables").textContent).toContain("Stage Gates");
  });

  it("stage card opens the drawer with סקירה/תוצרים/ראיות/סיכונים/החלטות/היסטוריה", async () => {
    render(ui());
    await waitFor(() => expect(screen.getByTestId("stage-card-4")).toBeTruthy());
    fireEvent.click(screen.getByTestId("stage-card-4"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("סקירה")).toBeTruthy();
    for (const tab of ["תוצרים", "ראיות", "סיכונים", "החלטות", "היסטוריה"]) {
      expect(within(dialog).getByText(tab)).toBeTruthy();
    }
    // overview shows the NAMED owner (canonical CEO spelling)
    expect(within(dialog).getByText("צחי זוסטייהם")).toBeTruthy();
    // decisions tab — honest pending state
    fireEvent.click(within(dialog).getByText("החלטות"));
    expect(await within(dialog).findByText("טרם התקבלה החלטה")).toBeTruthy();
    // history tab — honest empty state (no fabricated history)
    fireEvent.click(within(dialog).getByText("היסטוריה"));
    expect(await within(dialog).findByText("אין אירועי היסטוריה")).toBeTruthy();
  });

  it("renders the AS-IS/TO-BE map with working view toggles", async () => {
    render(ui());
    await waitFor(() => expect(screen.getByTestId("asis-tobe-map")).toBeTruthy());
    fireEvent.click(screen.getByText("תצוגת מצגת 16:9"));
    expect(await screen.findByTestId("atb-presentation")).toBeTruthy();
    fireEvent.click(screen.getByText("תצוגת עמוד"));
    expect(await screen.findByTestId("atb-panel-human")).toBeTruthy();
  });
});
