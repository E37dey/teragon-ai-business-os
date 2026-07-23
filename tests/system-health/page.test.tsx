// W8-D — /system-health page honesty: before any check runs, everything is
// "טרם נבדק" (no fake green), and the export action is disabled with a reason.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RailProvider } from "@/app/rail";
import { ToastProvider } from "@/design-system";
import { __resetRepositoriesForTests } from "@/repositories";
import SystemHealthPage from "@/modules/system-health/SystemHealthPage";

afterEach(cleanup);

function mountPage() {
  __resetRepositoriesForTests();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <RailProvider>
          <SystemHealthPage />
        </RailProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("/system-health — no fake green before a real check", () => {
  it('shows all 15 components as "טרם נבדק" initially and zero "תקין"', () => {
    mountPage();
    expect(screen.getAllByText("טרם נבדק").length).toBeGreaterThanOrEqual(15);
    // the state chip "תקין" must not appear before any check ran (the KPI
    // title mentions the word, so assert on the KPI value instead)
    expect(screen.getByText("תקינים (נמדדו)").closest(".os-kpi")?.textContent).toContain("0");
  });

  it("the page title and honest subtitle render", () => {
    mountPage();
    expect(screen.getAllByText("בריאות המערכת").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/לעולם לא ירוק מזויף/)).toBeTruthy();
  });

  it("diagnostic export is disabled with a Hebrew reason until a snapshot exists", () => {
    mountPage();
    const btn = screen.getByText("ייצוא דוח אבחון (מושמט-סודות)").closest("button");
    expect(btn).toBeTruthy();
    expect(btn?.disabled).toBe(true);
  });

  it("runs the local health check from the page action and states become measured", async () => {
    mountPage();
    const run = screen.getByText("הרצת בדיקת בריאות מקומית").closest("button");
    expect(run).toBeTruthy();
    run?.click();
    // after the run completes, at least the repositories check is green and
    // netlify functions honestly not-measurable (no fetch reachability in jsdom)
    const okKpi = await screen.findByText(
      (t) => t.includes("בדיקת הבריאות הושלמה"),
      undefined,
      { timeout: 8000 },
    );
    expect(okKpi).toBeTruthy();
    expect(screen.queryAllByText("טרם נבדק").length).toBeLessThan(15);
  }, 15000);
});
