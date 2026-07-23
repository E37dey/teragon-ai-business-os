// W6-D — /learning page (Phase 6.15): selectors, honest "טרם נמדד" rendering,
// idempotent demo seed, single-case marker in the review rail.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RailProvider } from "@/app/rail";
import { ToastProvider } from "@/design-system";
import { LEARNING_UNMEASURED_HE, SINGLE_CASE_MARKER_HE } from "@/domain/learning";
import { ensureLearningDemoData, learningStores } from "@/learning";
import { __resetRepositoriesForTests } from "@/repositories";
import LearningPage, { ProposalReviewPanel } from "@/modules/learning/LearningPage";
import { learningMetrics, learningRows, loopSteps } from "@/modules/learning/lib";
import { freshLearning, makeProposal, makeRule, REVIEWER } from "./helpers";

afterEach(cleanup);

function mountPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <RailProvider>
          <LearningPage />
        </RailProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("demo seed — idempotent, through repositories, derived not invented", () => {
  it("seeds observations/proposals/one active rule; calling twice changes nothing", async () => {
    const fx = freshLearning();
    const first = await ensureLearningDemoData({
      stores: fx.stores,
      engine: fx.engine,
      clock: fx.clock,
    });
    expect(first.observations).toBeGreaterThan(0);
    expect(first.proposals).toBe(2);
    expect(first.activeRules).toBe(1);

    const second = await ensureLearningDemoData({
      stores: fx.stores,
      engine: fx.engine,
      clock: fx.clock,
    });
    expect(second).toEqual(first);
    // the pending proposal is the honest single case
    const proposals = await fx.stores.proposals.list();
    const pending = proposals.filter((p) => p.approvalState === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.singleCaseMarkerHe).toBe(SINGLE_CASE_MARKER_HE);
    // the active rule has an honest small sample + limitations + unmeasured effectiveness
    const rules = await fx.stores.rules.list();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.sampleSize).toBe(2);
    expect(rules[0]?.limitationsHe.length).toBeGreaterThan(0);
    expect(rules[0]?.effectivenessMeasured).toBe(false);
  });
});

describe("pure page selectors", () => {
  it('metrics: nothing measured ⇒ "טרם נמדד" (never 0-as-progress)', async () => {
    const fx = freshLearning();
    await ensureLearningDemoData({ stores: fx.stores, engine: fx.engine, clock: fx.clock });
    const [observations, outcomes, proposals, rules, rollbacks] = await Promise.all([
      fx.stores.observations.list(),
      fx.stores.outcomes.list(),
      fx.stores.proposals.list(),
      fx.stores.rules.list(),
      fx.stores.rollbacks.list(),
    ]);
    const metrics = learningMetrics({ observations, outcomes, proposals, rules, rollbacks });
    expect(metrics.measuredOutcomeCount).toBe(0);
    expect(metrics.measuredOutcomeDisplay).toBe(LEARNING_UNMEASURED_HE);
    expect(metrics.activeRules).toBe(1);
    expect(metrics.proposalsPending).toBe(1);
    expect(metrics.underReview).toBe(1); // active rule, effectiveness unmeasured
    expect(metrics.rollbackCount).toBe(0);
  });

  it("loop steps cover the full canonical workflow in order", async () => {
    const fx = freshLearning();
    await ensureLearningDemoData({ stores: fx.stores, engine: fx.engine, clock: fx.clock });
    const [recommendations, outcomes, proposals, evidence, rules, audit] = await Promise.all([
      fx.stores.recommendations.list(),
      fx.stores.outcomes.list(),
      fx.stores.proposals.list(),
      fx.stores.evidence.list(),
      fx.stores.rules.list(),
      fx.stores.audit.list(),
    ]);
    const steps = loopSteps({ recommendations, outcomes, proposals, evidence, rules, audit });
    expect(steps.map((s) => s.label)).toEqual([
      "המלצה",
      "תגובת משתמש",
      "תוצאה",
      "תובנה מוצעת",
      "בדיקת ראיות",
      "אישור מנהל",
      "כלל פעיל",
      "מעקב",
    ]);
    expect(steps.find((s) => s.id === "outcome")?.count).toBe(0); // honestly unmeasured
    expect(steps.find((s) => s.id === "active-rule")?.count).toBe(1);
    expect(steps.find((s) => s.id === "monitoring")?.count).toBeGreaterThan(0);
  });

  it("table rows join recommendation → outcome → proposal → rule honestly", async () => {
    const fx = freshLearning();
    await ensureLearningDemoData({ stores: fx.stores, engine: fx.engine, clock: fx.clock });
    const [recommendations, approvals, outcomes, proposals, rules] = await Promise.all([
      fx.stores.recommendations.list(),
      fx.stores.approvals.list(),
      fx.stores.outcomes.list(),
      fx.stores.proposals.list(),
      fx.stores.rules.list(),
    ]);
    const rows = learningRows({ recommendations, approvals, outcomes, proposals, rules });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("rec-1")?.decisionLabelHe).toBe("ממתינה להחלטה");
    expect(byId.get("rec-1")?.statusHe).toBe("אין תובנה נגזרת");
    expect(byId.get("rec-2")?.statusHe).toBe("כלל פעיל");
    expect(byId.get("rec-2")?.sampleSize).toBe(2);
    expect(byId.get("rec-3")?.statusHe).toBe("ממתין לבדיקת מנהל");
    for (const row of rows) {
      expect(row.outcomeDisplayHe).toBe(LEARNING_UNMEASURED_HE);
    }
  });
});

describe("LearningPage rendering", () => {
  it('renders metrics, stepper and table — with "טרם נמדד" and no autonomy language', async () => {
    __resetRepositoriesForTests();
    mountPage();
    expect(await screen.findByTestId("learning-page")).toBeTruthy();
    // honest metric rendering
    expect(screen.getAllByText(LEARNING_UNMEASURED_HE).length).toBeGreaterThan(0);
    // the workflow stepper
    expect(screen.getAllByText("תובנה מוצעת").length).toBeGreaterThan(0);
    expect(screen.getAllByText("אישור מנהל").length).toBeGreaterThan(0);
    // the main table joins real seed recommendations
    expect(screen.getAllByText(/וורפינג/).length).toBeGreaterThan(0);
    // NO autonomous-retraining framing — the page states the opposite
    expect(screen.getByText(/אין למידה אוטונומית/)).toBeTruthy();
    expect(screen.queryByText(/משתפר מעצמו|self-improving/i)).toBeNull();
  });

  it("mounting the page twice keeps the demo dataset stable (idempotent boot)", async () => {
    __resetRepositoriesForTests();
    const first = mountPage();
    await screen.findByTestId("learning-page");
    const stores = learningStores();
    const countA = (await stores.proposals.list()).length;
    first.unmount();
    mountPage();
    await screen.findByTestId("learning-page");
    const countB = (await stores.proposals.list()).length;
    expect(countB).toBe(countA);
  });
});

describe("ProposalReviewPanel (rail content)", () => {
  const noop = () => undefined;

  it("shows the mandatory single-case marker and blocks approval", () => {
    const proposal = makeProposal({
      id: "lp-single",
      sampleSize: 1,
      supportingRecordIds: ["ai-recommendation:rec-3"],
      singleCaseMarkerHe: SINGLE_CASE_MARKER_HE,
    });
    render(
      <ProposalReviewPanel
        proposal={proposal}
        evidence={[]}
        rule={null}
        rollback={null}
        applications={[]}
        currentUserId={REVIEWER.id}
        busy={false}
        onApprove={noop}
        onReject={noop}
        onRollback={noop}
      />,
    );
    expect(screen.getByTestId("single-case-marker").textContent).toContain(SINGLE_CASE_MARKER_HE);
    const approve = screen.getByTestId("approve-proposal");
    expect((approve as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows limitations, bias, affected agents and the bounded proposed effect", () => {
    const proposal = makeProposal();
    render(
      <ProposalReviewPanel
        proposal={proposal}
        evidence={[]}
        rule={null}
        rollback={null}
        applications={[]}
        currentUserId={REVIEWER.id}
        busy={false}
        onApprove={noop}
        onReject={noop}
        onRollback={noop}
      />,
    );
    expect(screen.getByText(/קורלציה בלבד/)).toBeTruthy();
    expect(screen.getByText("מדגם קטן — 2 רשומות")).toBeTruthy();
    expect(screen.getByText("הטיית בדיקה")).toBeTruthy();
    expect(screen.getByText(/ag-fixer/)).toBeTruthy();
    // reject needs a reason — disabled until one is typed
    expect((screen.getByTestId("reject-proposal") as HTMLButtonElement).disabled).toBe(true);
  });

  it("only the named reviewer sees an enabled approve button", () => {
    const proposal = makeProposal();
    render(
      <ProposalReviewPanel
        proposal={proposal}
        evidence={[]}
        rule={null}
        rollback={null}
        applications={[]}
        currentUserId="u-someone-else"
        busy={false}
        onApprove={noop}
        onReject={noop}
        onRollback={noop}
      />,
    );
    expect((screen.getByTestId("approve-proposal") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a rolled-back rule is honestly labeled with visible past applications", () => {
    const proposal = makeProposal({ approvalState: "approved" });
    render(
      <ProposalReviewPanel
        proposal={proposal}
        evidence={[]}
        rule={{
          ...makeRule(),
          status: "rolled-back",
        }}
        rollback={{
          id: "rb-rule-lp-test",
          createdAt: "2026-07-23T08:00:00.000Z",
          updatedAt: "2026-07-23T08:00:00.000Z",
          ruleId: "rule-lp-test",
          version: 1,
          reasonHe: "לא הועיל",
          rolledBackById: REVIEWER.id,
          rolledBackByName: REVIEWER.name,
          rolledBackAt: "2026-07-23T08:00:00.000Z",
        }}
        applications={[
          {
            id: "lae-1",
            createdAt: "2026-07-23T08:00:00.000Z",
            updatedAt: "2026-07-23T08:00:00.000Z",
            at: "2026-07-23T08:00:00.000Z",
            actor: REVIEWER.id,
            action: "learning.rule-apply",
            entityRef: "learning-rule:rule-lp-test",
            details: "יישום",
            correlationId: "rule-lp-test",
          },
        ]}
        currentUserId={REVIEWER.id}
        busy={false}
        onApprove={noop}
        onReject={noop}
        onRollback={noop}
      />,
    );
    expect(screen.getByTestId("rule-rolled-back").textContent).toContain("יישומי העבר");
    expect(screen.queryByTestId("rollback-rule")).toBeNull(); // no double rollback
  });
});
