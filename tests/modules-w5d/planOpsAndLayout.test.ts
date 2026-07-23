// W5-D — automations planning ops (honest envelopes) + collaboration graph
// layout (deterministic, no overlaps, edges bound to positioned nodes).
import { describe, expect, it } from "vitest";
import type { Automation, AutomationRun } from "@/domain/types";
import {
  classifyTriggerOp,
  detectFailurePathsOp,
  draftContentOp,
  hasExternalStep,
  identifyMissingOp,
  proposeConditionsOp,
  suggestNextActionOp,
} from "@/modules/automations/planOps";
import { layoutRunGraph, NODE_H, NODE_W } from "@/modules/agents-ui/graphLayout";
import type { RunGraph } from "@/agents";

const TS = "2026-07-20T08:00:00.000Z";
const meta = { createdAt: TS, updatedAt: TS };

const external: Automation = {
  id: "auto-3",
  ...meta,
  name: "ברכת סיום קורס",
  description: "נשלחת הודעת סיכום — דורש אישור.",
  trigger: "קורס הסתיים",
  steps: ["ניסוח הודעה", "המתנה לאישור אנושי", "שליחה"],
  enabled: true,
  requiresApproval: true,
};

const internal: Automation = {
  id: "auto-4",
  ...meta,
  name: "דוח בוקר",
  description: "סיכום יומי במרכז הפיקוד.",
  trigger: "כל יום ב-07:00",
  steps: ["איסוף נתונים", "בניית סיכום"],
  enabled: true,
  requiresApproval: false,
};

const failedRun: AutomationRun = {
  id: "ar-9",
  ...meta,
  automationId: "auto-3",
  startedAt: TS,
  endedAt: TS,
  outcome: "כישלון",
  stepsLog: ["שלב נכשל"],
  triggeredBy: "מתזמן",
};

describe("automation planning ops (5.12)", () => {
  it("all six ops produce honest local-rules envelopes", () => {
    const envelopes = [
      classifyTriggerOp(external),
      identifyMissingOp(external, []),
      proposeConditionsOp(external),
      draftContentOp(external),
      suggestNextActionOp(external, [failedRun]),
      detectFailurePathsOp(external, [failedRun]),
    ];
    for (const env of envelopes) {
      expect(env.provider).toBe("local-rules");
      expect(env.model).toBeNull();
      expect(env.usage.measured).toBe(false);
      expect(env.confidence.status).toBe("unavailable");
      expect(env.limitations.length).toBeGreaterThan(0);
      expect(env.operation.startsWith("automation.plan.")).toBe(true);
    }
  });

  it("external-step detection drives the approval requirement", () => {
    expect(hasExternalStep(external)).toBe(true);
    expect(hasExternalStep(internal)).toBe(false);
    expect(draftContentOp(external).approval.required).toBe(true);
    expect(classifyTriggerOp(internal).approval.required).toBe(false);
  });

  it("failure-path detection reflects real failed runs", () => {
    const env = detectFailurePathsOp(external, [failedRun]);
    expect(env.recommendation).toContain("1 ריצות עבר הסתיימו בכישלון");
    const clean = detectFailurePathsOp(internal, []);
    expect(clean.recommendation).toContain("לא נרשמו ריצות כושלות");
  });

  it("classify distinguishes scheduled from event triggers", () => {
    expect(classifyTriggerOp(internal).recommendation).toContain("מתוזמן");
    expect(classifyTriggerOp(external).recommendation).toContain("אירוע");
  });
});

describe("collaboration graph layout (5.11)", () => {
  const demoLikeGraph: RunGraph = {
    nodes: [
      { id: "run-1", kind: "run", labelHe: "יעד", status: "ממתין לאישור" },
      { id: "ag-orchestrator", kind: "agent", labelHe: "ag-orchestrator", status: "" },
      { id: "ag-hunter", kind: "agent", labelHe: "ag-hunter", status: "" },
      { id: "ag-wiki", kind: "agent", labelHe: "ag-wiki", status: "" },
      { id: "ag-fixer", kind: "agent", labelHe: "ag-fixer", status: "" },
      { id: "t-1", kind: "task", labelHe: "משימה 1", status: "הושלם" },
      { id: "t-2", kind: "task", labelHe: "משימה 2", status: "הושלם" },
      { id: "t-3", kind: "task", labelHe: "משימה 3", status: "הושלם" },
      { id: "conf-1", kind: "conflict", labelHe: "קונפליקט", status: "ממתין להחלטה" },
      { id: "ap-1", kind: "approval", labelHe: "אישור", status: "ממתין" },
    ],
    edges: [
      { from: "ag-hunter", to: "t-1", kind: "dispatch", labelHe: "משימה" },
      { from: "ag-hunter", to: "conf-1", kind: "conflict", labelHe: "צד" },
      { from: "run-1", to: "ap-1", kind: "approval", labelHe: "בקשה" },
      { from: "ghost", to: "t-1", kind: "message", labelHe: "קשת יתומה" },
    ],
  };

  it("~10 demo nodes: deterministic positions with zero overlaps", () => {
    const a = layoutRunGraph(demoLikeGraph);
    const b = layoutRunGraph(demoLikeGraph);
    expect(a).toEqual(b); // deterministic
    // no two nodes overlap (axis-aligned rectangles)
    for (let i = 0; i < a.nodes.length; i += 1) {
      for (let j = i + 1; j < a.nodes.length; j += 1) {
        const n1 = a.nodes[i]!;
        const n2 = a.nodes[j]!;
        const overlap =
          n1.x < n2.x + NODE_W &&
          n2.x < n1.x + NODE_W &&
          n1.y < n2.y + NODE_H &&
          n2.y < n1.y + NODE_H;
        expect(overlap, `חפיפה בין ${n1.id} ל-${n2.id}`).toBe(false);
      }
    }
    // bounds
    for (const n of a.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x + NODE_W).toBeLessThanOrEqual(a.width);
      expect(n.y + NODE_H).toBeLessThanOrEqual(a.height);
    }
  });

  it("column order follows the lifecycle: run → agents → tasks → conflicts → approvals", () => {
    const layout = layoutRunGraph(demoLikeGraph);
    const x = (id: string): number => layout.nodes.find((n) => n.id === id)!.x;
    expect(x("run-1")).toBeLessThan(x("ag-hunter"));
    expect(x("ag-hunter")).toBeLessThan(x("t-1"));
    expect(x("t-1")).toBeLessThan(x("conf-1"));
    expect(x("conf-1")).toBeLessThan(x("ap-1"));
  });

  it("edges to unknown nodes are dropped (never invented endpoints)", () => {
    const layout = layoutRunGraph(demoLikeGraph);
    expect(layout.edges).toHaveLength(3);
    expect(layout.edges.some((e) => e.from === "ghost")).toBe(false);
  });
});
