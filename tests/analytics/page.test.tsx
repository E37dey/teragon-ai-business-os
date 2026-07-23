// W8-A — /analytics page smoke: 6 groups, honest "טרם נמדד" (never 0), the
// rail "מבקר המדדים", table-alternative toggle and the reports tab.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RailProvider } from "@/app/rail";
import { useRailContent } from "@/app/railContext";
import { ToastProvider } from "@/design-system";
import { __resetRepositoriesForTests } from "@/repositories";
import AnalyticsPage from "@/modules/analytics/AnalyticsPage";
import { ANALYTICS_GROUP_TITLES } from "@/domain/analytics";

beforeEach(() => {
  __resetRepositoriesForTests();
});
afterEach(cleanup);

/** renders whatever the page published into the contextual rail (like OsShell) */
function RailOutlet() {
  const content = useRailContent();
  return <aside aria-label="rail">{content}</aside>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <RailProvider>
          <MemoryRouter initialEntries={["/analytics"]}>
            <AnalyticsPage />
            <RailOutlet />
          </MemoryRouter>
        </RailProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("/analytics page", () => {
  it("renders the title + all six mandated metric groups", { timeout: 20000 }, async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("דוחות וניתוחים")).toBeTruthy(), { timeout: 8000 });
    for (const title of Object.values(ANALYTICS_GROUP_TITLES)) {
      // appears both as a section heading and a filter option — require ≥1
      const matches = await screen.findAllByText(title, undefined, { timeout: 5000 });
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it("unmeasured metrics show 'טרם נמדד' — NEVER a fake 0", { timeout: 20000 }, async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("NPS לקוחות")).toBeTruthy(), { timeout: 5000 });
    expect(screen.getAllByText("טרם נמדד").length).toBeGreaterThan(0);
    // the NPS card's value button must not display 0
    const npsBtn = screen.getByLabelText("NPS לקוחות — פתיחת רשומות המקור");
    expect(npsBtn.textContent).toBe("טרם נמדד");
  });

  it("publishes the 'מבקר המדדים' rail with real findings", { timeout: 20000 }, async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("מבקר המדדים")).toBeTruthy(), { timeout: 8000 });
    expect(screen.getAllByText(/מדד ללא קו בסיס/).length).toBeGreaterThan(0);
  });

  it("toggles the accessible table alternative for charts", { timeout: 20000 }, async () => {
    renderPage();
    const toggle = await screen.findByText("תצוגת טבלה (נגיש)", undefined, { timeout: 5000 });
    fireEvent.click(toggle);
    expect(await screen.findByText("תצוגת גרפים", undefined, { timeout: 5000 })).toBeTruthy();
  });

  it("the reports tab lists the 7 canonical report definitions", { timeout: 30000 }, async () => {
    renderPage();
    const tab = await screen.findByRole("tab", { name: /דוחות/ }, { timeout: 5000 });
    fireEvent.click(tab);
    for (const title of [
      "דוח פעילות שבועי",
      "דוח מכירות חודשי",
      "דוח שירות ותקלות",
      "דוח התקדמות תלמידים",
      "דוח אימוץ והטמעה",
      "דוח ממשל AI",
      "דוח מוכנות להגשה",
    ]) {
      expect(await screen.findByText(title, undefined, { timeout: 5000 })).toBeTruthy();
    }
  });
});
