// S11.3 — the 7 agents' deterministic business actions: contract, safety,
// idempotency, honesty and observability. Local, deterministic, no remote model.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_ACTIONS,
  getActionsForAgent,
  runAgentAction,
  __resetAgentActionStore,
  appliedCorrectionCount,
  savedAutomationCount,
  LOCAL_ENGINE_LABEL,
  type AgentActionResult,
  type ActionStatus,
} from "@/agents/actions";
import { AGENT_IDS } from "@/agents/definitions";
import { APP_ROUTES } from "@/app/routes";
import {
  setErrorReportProvider,
  resetErrorReportProvider,
  type SafeErrorEvent,
} from "@/observability/errorSink";

const VALID_INPUTS: Record<string, Record<string, string>> = {
  "orch.system-review": {},
  "orch.action-plan": {},
  "hunter.incomplete-customers": {},
  "hunter.missing-contacts": {},
  "fixer.propose-correction": { recordId: "dc-2" },
  "fixer.apply-correction": { recordId: "dc-2" },
  "flow.followup-sequence": { recordId: "dc-5" },
  "flow.automation-proposal": { trigger: "missing-contact" },
  "mentor.explain-recommendation": { recommendationId: "rec-1" },
  "mentor.improvement-checklist": {},
  "nexa.system-question": { query: "לידים" },
  "nexa.navigation-guidance": { query: "להוסיף לקוח" },
  "wiki.knowledge-search": { query: "אישור" },
  "wiki.summarize-entry": { entryId: "kn-1" },
};

const ROUTE_PATHS = new Set(APP_ROUTES.map((r) => r.path));

function assertStructured(res: AgentActionResult): void {
  expect(typeof res.status).toBe("string");
  expect(typeof res.summary).toBe("string");
  expect(Array.isArray(res.findings)).toBe(true);
  expect(Array.isArray(res.recommendations)).toBe(true);
  expect(Array.isArray(res.evidence)).toBe(true);
  expect(Array.isArray(res.affectedRecordIds)).toBe(true);
  expect(typeof res.createdAt).toBe("string");
  expect(typeof res.correlationId).toBe("string");
  expect(res.correlationId.length).toBeGreaterThan(0);
  expect(res.engineLabel).toBe(LOCAL_ENGINE_LABEL);
  // the five mandatory "why" explanations
  for (const k of ["foundHe", "importanceHe", "basedOnHe", "recommendedHe"] as const) {
    expect(typeof res.why[k]).toBe("string");
    expect(res.why[k].length).toBeGreaterThan(0);
  }
  expect(typeof res.why.isProposalOnly).toBe("boolean");
}

beforeEach(() => __resetAgentActionStore());
afterEach(() => resetErrorReportProvider());

describe("S11.3 · registry integrity", () => {
  it("the 7 governed agents each expose exactly 2 business actions", () => {
    expect(AGENT_IDS).toHaveLength(7);
    for (const id of AGENT_IDS) {
      expect(getActionsForAgent(id), `agent ${id}`).toHaveLength(2);
    }
  });

  it("there are 14 actions with unique ids", () => {
    expect(AGENT_ACTIONS).toHaveLength(14);
    expect(new Set(AGENT_ACTIONS.map((a) => a.id)).size).toBe(14);
  });

  it("every action belongs to one of the 7 agents and has an allowed execution mode", () => {
    const modes = new Set(["READ_ONLY_LOCAL", "PROPOSAL_ONLY", "LOCAL_DEMO_MUTATION_WITH_APPROVAL"]);
    for (const a of AGENT_ACTIONS) {
      expect(AGENT_IDS).toContain(a.agentId);
      expect(modes.has(a.executionMode)).toBe(true);
      expect(a.approvalRequired).toBe(a.executionMode === "LOCAL_DEMO_MUTATION_WITH_APPROVAL");
    }
  });
});

describe("S11.3 · structured results, evidence, correlationId", () => {
  it("every action returns the structured schema with a non-empty correlationId", () => {
    for (const a of AGENT_ACTIONS) {
      const res = runAgentAction(a.id, VALID_INPUTS[a.id], { approved: true });
      assertStructured(res);
    }
  });

  it("every successful/awaiting result carries evidence", () => {
    for (const a of AGENT_ACTIONS) {
      const res = runAgentAction(a.id, VALID_INPUTS[a.id], { approved: true });
      if (res.status === "ok" || res.status === "applied" || res.status === "awaiting_approval") {
        expect(res.evidence.length, `evidence for ${a.id}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("correlationIds are unique across runs", () => {
    const ids = AGENT_ACTIONS.map((a) => runAgentAction(a.id, VALID_INPUTS[a.id]).correlationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("navigation targets resolve to canonical routes", () => {
    for (const a of AGENT_ACTIONS) {
      const res = runAgentAction(a.id, VALID_INPUTS[a.id], { approved: true });
      if (res.navigationTarget) expect(ROUTE_PATHS.has(res.navigationTarget), `${a.id} → ${res.navigationTarget}`).toBe(true);
      for (const r of res.recommendations) {
        if (r.navigationTarget) expect(ROUTE_PATHS.has(r.navigationTarget), `${a.id} rec → ${r.navigationTarget}`).toBe(true);
      }
    }
  });
});

describe("S11.3 · mutation safety", () => {
  const READ_OR_PROPOSAL = AGENT_ACTIONS.filter(
    (a) => a.executionMode !== "LOCAL_DEMO_MUTATION_WITH_APPROVAL",
  );

  it("read-only and proposal-only actions never mutate the demo store", () => {
    for (const a of READ_OR_PROPOSAL) {
      runAgentAction(a.id, VALID_INPUTS[a.id]);
    }
    expect(appliedCorrectionCount()).toBe(0);
    expect(savedAutomationCount()).toBe(0);
  });

  it("approval-required actions do NOT mutate before approval", () => {
    const r1 = runAgentAction("fixer.apply-correction", { recordId: "dc-2" });
    const r2 = runAgentAction("flow.automation-proposal", { trigger: "missing-contact" });
    expect(r1.status).toBe("awaiting_approval");
    expect(r2.status).toBe("awaiting_approval");
    expect(appliedCorrectionCount()).toBe(0);
    expect(savedAutomationCount()).toBe(0);
  });

  it("an approved local mutation happens exactly once; duplicates are blocked", () => {
    const first = runAgentAction("fixer.apply-correction", { recordId: "dc-2" }, { approved: true });
    expect(first.status).toBe("applied");
    expect(appliedCorrectionCount()).toBe(1);
    const second = runAgentAction("fixer.apply-correction", { recordId: "dc-2" }, { approved: true });
    expect(second.status).toBe("applied");
    expect(second.summary).toContain("כפילות");
    expect(appliedCorrectionCount()).toBe(1); // still one — no double mutation
  });

  it("an approved automation saves once; duplicates are blocked", () => {
    runAgentAction("flow.automation-proposal", { trigger: "missing-contact" }, { approved: true });
    runAgentAction("flow.automation-proposal", { trigger: "missing-contact" }, { approved: true });
    expect(savedAutomationCount()).toBe(1);
  });
});

describe("S11.3 · validation + fail-closed", () => {
  it("invalid record id returns a safe Hebrew validation message (no mutation)", () => {
    const res = runAgentAction("fixer.propose-correction", { recordId: "nope" });
    expect(res.status).toBe("validation_error");
    expect(res.summary).toMatch(/[֐-׿]/); // contains Hebrew
    expect(appliedCorrectionCount()).toBe(0);
  });

  it("missing required input returns a safe Hebrew validation message", () => {
    const res = runAgentAction("nexa.system-question", {});
    expect(res.status).toBe("validation_error");
    expect(res.summary).toContain("להזין");
  });

  it("never reports success (ok/applied) for a validation error", () => {
    const res = runAgentAction("wiki.summarize-entry", { entryId: "missing" });
    const success: ActionStatus[] = ["ok", "applied"];
    expect(success).not.toContain(res.status);
  });
});

describe("S11.3 · honesty + observability", () => {
  it("every result declares the local rules engine (no remote model)", () => {
    for (const a of AGENT_ACTIONS) {
      expect(runAgentAction(a.id, VALID_INPUTS[a.id], { approved: true }).engineLabel).toBe(
        "מנוע חוקים מקומי — ללא מודל מרוחק",
      );
    }
  });

  it("running every action emits NO observability event with names, emails or payloads", () => {
    const events: SafeErrorEvent[] = [];
    setErrorReportProvider((e) => events.push(e));
    for (const a of AGENT_ACTIONS) {
      runAgentAction(a.id, VALID_INPUTS[a.id], { approved: true });
    }
    const serialized = JSON.stringify(events);
    for (const leak of ["@example.com", "מאפיית", "רות לוי", "dc-2"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("the remote AI provider is NEVER called (AI_REMOTE_ENABLED=false, local rules only)", async () => {
    const { RemoteAIProvider } = await import("@/ai/providers/RemoteAIProvider");
    const proto = RemoteAIProvider.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    const methods = ["summarize", "classify", "recommend", "explain", "generateStructured", "stream", "health"];
    const spies = methods
      .filter((m) => typeof proto[m] === "function")
      .map((m) => vi.spyOn(proto, m));
    for (const a of AGENT_ACTIONS) {
      runAgentAction(a.id, VALID_INPUTS[a.id], { approved: true });
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });
});
