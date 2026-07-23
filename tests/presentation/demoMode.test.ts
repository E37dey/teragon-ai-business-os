// W7-F — evaluator demo mode: exactly 11 deterministic steps whose routes
// resolve to REAL app routes, repository-persisted progress (survives a
// "refresh" = fresh stores over the same repositories), the destructive-action
// guard, and reset-deterministic-data through the canonical seedIfEmpty path.
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/app/routes";
import { getRepository } from "@/repositories";
import {
  DEMO_STEP_DEFINITIONS,
  completeDemoStep,
  demoProgress,
  ensureDemoSteps,
  guardDestructiveAction,
  nextDemoStep,
  presentationStores,
  resetDemoProgress,
  resetDeterministicData,
} from "@/presentation";
import { fresh, freshBootstrapped } from "./helpers";

const APP_PATHS = new Set(APP_ROUTES.map((r) => r.path));

describe("the 11-step deterministic path", () => {
  it("defines EXACTLY 11 steps, ordered 1..11, ending back at the presentation", () => {
    expect(DEMO_STEP_DEFINITIONS).toHaveLength(11);
    expect(DEMO_STEP_DEFINITIONS.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(DEMO_STEP_DEFINITIONS[10]?.route).toBe("/submission/presentation");
    expect(DEMO_STEP_DEFINITIONS[0]?.route).toBe("/");
  });

  it("every step route resolves to a REAL app route", () => {
    for (const step of DEMO_STEP_DEFINITIONS) {
      expect(APP_PATHS.has(step.route)).toBe(true);
    }
  });

  it("covers the mandated waypoints (personas, matrix, gates evidence, quick start, metrics, submission)", () => {
    const routes = DEMO_STEP_DEFINITIONS.map((s) => s.route);
    for (const required of [
      "/",
      "/implementation",
      "/personas",
      "/stage-gates",
      "/quick-start",
      "/agents",
      "/analytics",
      "/submission",
      "/submission/presentation",
    ]) {
      expect(routes).toContain(required);
    }
  });

  it("ensureDemoSteps is idempotent and starts every step honestly at לא בוצע", async () => {
    const { stores, clock } = fresh();
    const first = await ensureDemoSteps(stores, clock);
    expect(first.created).toBe(11);
    expect((await ensureDemoSteps(stores, clock)).created).toBe(0);
    for (const s of await stores.demoSteps.list()) {
      expect(s.status).toBe("לא בוצע");
      expect(s.completedAt).toBeNull();
    }
  });
});

describe("progress — repository-persisted (survives refresh)", () => {
  it("completeDemoStep records completion; progress survives fresh store handles", async () => {
    const { stores, clock } = await freshBootstrapped();
    await completeDemoStep(stores, "ds-1", clock);
    await completeDemoStep(stores, "ds-2", clock);
    // "refresh": a brand-new stores wrapper over the SAME repositories
    const reloaded = presentationStores();
    const steps = await reloaded.demoSteps.list();
    expect(demoProgress(steps)).toEqual({ done: 2, total: 11 });
    expect(steps.find((s) => s.id === "ds-1")?.completedAt).not.toBeNull();
  });

  it("nextDemoStep highlights the first incomplete step, and null when done", async () => {
    const { stores, clock } = await freshBootstrapped();
    expect(nextDemoStep(await stores.demoSteps.list())?.id).toBe("ds-1");
    await completeDemoStep(stores, "ds-1", clock);
    expect(nextDemoStep(await stores.demoSteps.list())?.id).toBe("ds-2");
    for (const d of DEMO_STEP_DEFINITIONS) await completeDemoStep(stores, d.id, clock);
    expect(nextDemoStep(await stores.demoSteps.list())).toBeNull();
  });

  it("resetDemoProgress returns every step to לא בוצע", async () => {
    const { stores, clock } = await freshBootstrapped();
    await completeDemoStep(stores, "ds-1", clock);
    await completeDemoStep(stores, "ds-5", clock);
    const reset = await resetDemoProgress(stores, clock);
    expect(reset).toBe(2);
    for (const s of await stores.demoSteps.list()) expect(s.status).toBe("לא בוצע");
  });

  it("completing an unknown step is an error; completing twice is a no-op", async () => {
    const { stores, clock } = await freshBootstrapped();
    await expect(completeDemoStep(stores, "ds-99", clock)).rejects.toThrow();
    const once = await completeDemoStep(stores, "ds-3", clock);
    const twice = await completeDemoStep(stores, "ds-3", clock);
    expect(twice.completedAt).toBe(once.completedAt);
  });
});

describe("demo-mode guard", () => {
  it("allows everything while demo mode is off", () => {
    expect(guardDestructiveAction("מחיקת לקוח", false)).toEqual({ allowed: true, reasonHe: "" });
  });

  it("refuses destructive changes with a Hebrew reason while demo mode is on", () => {
    const verdict = guardDestructiveAction("מחיקת לקוח", true);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasonHe).toContain("מחיקת לקוח");
    expect(verdict.reasonHe).toContain("מצב הדגמה");
  });
});

describe("reset-deterministic-data (clear + canonical seedIfEmpty reseed)", () => {
  it("wipes manual junk, restores the seed and re-bootstraps the presentation content", async () => {
    const { stores, clock } = await freshBootstrapped();
    // pollute: a junk record + completed progress + a rehearsal-like edit
    const customers = getRepository("customers");
    const seededCustomers = (await customers.list()).length;
    await customers.create({
      id: "cu-junk",
      createdAt: clock(),
      updatedAt: clock(),
    });
    await completeDemoStep(stores, "ds-1", clock);

    const result = await resetDeterministicData(stores, clock);
    expect(result.clearedCollections).toBeGreaterThan(0);

    // seed restored exactly (junk gone)
    expect((await customers.list()).length).toBe(seededCustomers);
    expect(await customers.get("cu-junk")).toBeUndefined();
    // presentation content re-bootstrapped: 5 sections, 11 steps, progress reset
    expect((await stores.sections.list()).length).toBe(5);
    const steps = await stores.demoSteps.list();
    expect(steps).toHaveLength(11);
    for (const s of steps) expect(s.status).toBe("לא בוצע");
  });
});
