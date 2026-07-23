// W7-C — /stage-gates page smoke: bridges on mount, renders the six-gate
// navigator, the honest KPI row and the criteria of the selected gate.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/design-system";
import { RailProvider } from "@/app/rail";
import { __resetRepositoriesForTests } from "@/repositories";
import StageGatesPage from "@/modules/stage-gates/StageGatesPage";

beforeEach(() => {
  __resetRepositoriesForTests();
});
afterEach(cleanup);

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <RailProvider>
          <StageGatesPage />
        </RailProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("/stage-gates page", () => {
  it("renders all six canonical gates in the navigator after the bridge", async () => {
    renderPage();
    await waitFor(
      () => {
        expect(screen.getByLabelText("שער G1 — מוכנות")).toBeTruthy();
      },
      { timeout: 5000 },
    );
    expect(screen.getByLabelText("שער G2 — עיצוב הדרכה")).toBeTruthy();
    expect(screen.getByLabelText("שער G3 — פיילוט מוכן")).toBeTruthy();
    expect(screen.getByLabelText("שער G4 — הפיילוט הצליח")).toBeTruthy();
    expect(screen.getByLabelText("שער G5 — מוכן להרחבה")).toBeTruthy();
    expect(screen.getByLabelText("שער G6 — הפעלה שגרתית")).toBeTruthy();
  });

  it("shows the selected gate's criteria and switches gates from the navigator", async () => {
    renderPage();
    await waitFor(
      () => {
        expect(screen.getByLabelText("שער G4 — הפיילוט הצליח")).toBeTruthy();
      },
      { timeout: 5000 },
    );
    // default selection G1 — its personas criterion is visible
    expect(
      screen.getByText("מפת פרסונות מלאה — כל 7 הפרסונות ממופות עם מסלול הדרכה"),
    ).toBeTruthy();
    // switch to G4 — the PilotResult criterion appears
    fireEvent.click(screen.getByLabelText("שער G4 — הפיילוט הצליח"));
    await waitFor(() => {
      expect(screen.getByText("רשומת PilotResult אמיתית עם תוצאות מתועדות")).toBeTruthy();
    });
  });
});
