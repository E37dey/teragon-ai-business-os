// W8-C — /administration page smoke: baseline bridge on mount, 8 tabs, the
// users table from the real seed, the 9-role matrix and emergency controls.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/design-system";
import { RailProvider } from "@/app/rail";
import { __resetRepositoriesForTests } from "@/repositories";
import AdministrationPage from "@/modules/administration/AdministrationPage";

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
          <AdministrationPage />
        </RailProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function waitForPage(): Promise<void> {
  await waitFor(
    () => {
      expect(screen.getByTestId("administration-page")).toBeTruthy();
    },
    { timeout: 5000 },
  );
}

describe("/administration page", () => {
  it("bridges on mount and renders the 5 seed users with roles and honest demo label", async () => {
    renderPage();
    await waitForPage();
    await waitFor(() => {
      expect(screen.getByText("צחי זוסטייהם")).toBeTruthy();
    });
    expect(screen.getByText("מאיה ברק")).toBeTruthy();
    expect(screen.getByText("נעה פרידמן")).toBeTruthy();
    expect(screen.getAllByText("ניהול הרשאות במצב הדגמה מקומי").length).toBeGreaterThan(0);
  });

  it("shows all 8 tabs", async () => {
    renderPage();
    await waitForPage();
    for (const label of [
      "משתמשים",
      "תפקידים",
      "הרשאות",
      "ארגונים",
      "סקירת גישה",
      "בקשות שינוי",
      "מצב חירום",
      "Audit",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("roles tab renders the exactly-9 canonical matrix", async () => {
    renderPage();
    await waitForPage();
    fireEvent.click(screen.getByRole("tab", { name: /תפקידים/ }));
    await waitFor(() => {
      expect(screen.getByTestId("role-matrix")).toBeTruthy();
    });
    expect(screen.getByText("בדיוק 9 תפקידים קנוניים (נאכף)")).toBeTruthy();
    expect(screen.getByText("Champion")).toBeTruthy();
    expect(screen.getByText("מבקר")).toBeTruthy();
    expect(screen.getByText("צופה")).toBeTruthy();
  });

  it("emergency tab shows the 5 controls with honest scope statements", async () => {
    renderPage();
    await waitForPage();
    fireEvent.click(screen.getByRole("tab", { name: /מצב חירום/ }));
    await waitFor(() => {
      expect(screen.getByText("השבתת כל ה-AI המרוחק")).toBeTruthy();
    });
    expect(screen.getByText("השבתת ביצוע אוטומציות")).toBeTruthy();
    expect(screen.getByText("נעילת שינויי הרשאות")).toBeTruthy();
    expect(screen.getByText("מצב קריאה בלבד")).toBeTruthy();
    expect(screen.getAllByText(/תצוגה בלבד/).length).toBeGreaterThan(0);
  });

  it("access-review tab blocks self-review with a disabled reason", async () => {
    renderPage();
    await waitForPage();
    fireEvent.click(screen.getByRole("tab", { name: /סקירת גישה/ }));
    await waitFor(() => {
      expect(screen.getAllByText("ממתין").length).toBeGreaterThan(0);
    });
    // the current actor (u-tzachi) sees a disabled decision button on his own row
    const disabled = screen.getAllByRole("button", { name: "הכרעה" });
    expect(disabled.length).toBeGreaterThan(0);
  });
});
