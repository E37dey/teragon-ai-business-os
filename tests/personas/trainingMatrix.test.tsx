// W7-B — TrainingMatrix renders the mandated 9 columns from real records;
// PersonasPage smoke: seven lanes, matrix, auditor rail, honest adoption.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RailProvider } from "@/app/rail";
import { ToastProvider } from "@/design-system";
import { PERSONAS, TRAINING_MATERIALS } from "@/repositories/seed/seedData";
import { __resetRepositoriesForTests } from "@/repositories";
import { bridgePersonas, CANONICAL_PERSONA_NAMES, NOT_MEASURED } from "@/domain/personas";
import { TrainingMatrix } from "@/modules/training-matrix";
import PersonasPage from "@/modules/personas/PersonasPage";

const HEADERS = [
  "פרסונה",
  "מטרת ההדרכה",
  "פורמט",
  "משך",
  "תרגול",
  "מדד הצלחה",
  "חומרי תמיכה",
  "אחראי",
  "סטטוס",
];

beforeEach(() => __resetRepositoriesForTests());
afterEach(cleanup);

describe("TrainingMatrix — canonical 9-column matrix", () => {
  it("renders all mandated columns and all 7 canonical personas", () => {
    const { personas } = bridgePersonas(PERSONAS);
    render(<TrainingMatrix personas={personas} materials={TRAINING_MATERIALS} />);
    for (const h of HEADERS) {
      expect(screen.getByRole("columnheader", { name: h })).toBeTruthy();
    }
    for (const name of CANONICAL_PERSONA_NAMES) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it("resolves every material link to a real seeded title — no broken links", () => {
    const { personas } = bridgePersonas(PERSONAS);
    render(<TrainingMatrix personas={personas} materials={TRAINING_MATERIALS} />);
    expect(screen.queryByText(/לא נמצא/)).toBeNull();
  });

  it("separates target from measured — every row says נמדד: טרם נמדד", () => {
    const { personas } = bridgePersonas(PERSONAS);
    render(<TrainingMatrix personas={personas} materials={TRAINING_MATERIALS} />);
    // the single spec-defined numeric target appears as a TARGET
    expect(screen.getAllByText(/יעד:/).length).toBe(7);
    expect(screen.getAllByText(new RegExp(NOT_MEASURED)).length).toBeGreaterThanOrEqual(7);
  });
});

describe("PersonasPage — smoke over the seeded repositories", () => {
  it("mounts with seven lanes, the matrix, and no invented adoption rate", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <RailProvider>
            <MemoryRouter>
              <PersonasPage />
            </MemoryRouter>
          </RailProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText("שבע הפרסונות — מסלול לכל קהל")).toBeTruthy();
    });
    // seven lanes — every canonical persona renders
    for (const name of CANONICAL_PERSONA_NAMES) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    // honest adoption — never a percentage
    expect(screen.getAllByText(NOT_MEASURED).length).toBeGreaterThan(0);
    // the validation guard passes on the seed
    expect(screen.getByText("בדיוק 7 פרסונות קנוניות")).toBeTruthy();
  });
});
