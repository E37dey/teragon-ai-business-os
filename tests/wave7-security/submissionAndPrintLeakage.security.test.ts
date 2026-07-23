// W7-G (7.25) GAP-FILL — the /submission surfaces (deliverable evaluations,
// auditor findings, quality matrix) and the A4 PRINT view must never leak a
// sensitivity-gated memory body, even when such a record is attached as gate
// evidence upstream. This is the "restricted memory link in submission views"
// + "sensitive-export attempt from submission print" pair of checklist items.
//
// Existing coverage (gap analysis): tests/submission/** pins readiness/quality
// honesty but never feeds a sensitive record through; tests/wave6-security
// pins the Wave-6 export/import paths only. This file closes both gaps.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  CANONICAL_STAGE_GATES,
  validateGate,
  type GateWithValidation,
} from "@/domain/stage-gates";
import { buildAuditFindings, evaluateAllDeliverables } from "@/domain/submission";
import { runQualityValidation } from "@/validation/submission/qualityValidator";
import { SubmissionPrintView } from "@/modules/submission/printView";
import { buildSources, TEST_NOW_ISO } from "../submission/helpers";
import { makeCtx, makeGateV2, makeRef } from "../stage-gates/helpers";
import {
  asLegacyCollectionRecord,
  makeSensitiveMemoryV2,
  SENSITIVE_BODY_SENTINEL,
} from "./helpers";

const sensitive = makeSensitiveMemoryV2();

/** all six canonical gates, with the SENSITIVE record attached to G1 */
function gateValidationsWithSensitiveEvidence(): GateWithValidation[] {
  const ctx = makeCtx({ memoryRecords: [asLegacyCollectionRecord(sensitive)] });
  return CANONICAL_STAGE_GATES.map((def) => {
    const gate = makeGateV2(
      def.legacyId,
      def.gateKey === "G1"
        ? {
            attachedEvidence: [
              makeRef({ refType: "memoryRecord", refId: sensitive.id, criterionKey: "g1-goal" }),
            ],
          }
        : {},
    );
    return { gate, def, validation: validateGate(gate, def, ctx, TEST_NOW_ISO) };
  });
}

describe("W7-G 7.25 — submission views never carry a sensitive memory body", () => {
  const sources = buildSources({ gateValidations: gateValidationsWithSensitiveEvidence() });
  const quality = runQualityValidation(sources);
  const evaluations = evaluateAllDeliverables(sources, quality);
  const findings = buildAuditFindings(sources, evaluations);

  it("deliverable evaluations (the 12 cards) — no sentinel anywhere in the serialization", () => {
    expect(evaluations).toHaveLength(12);
    expect(JSON.stringify(evaluations)).not.toContain(SENSITIVE_BODY_SENTINEL);
  });

  it("auditor findings (מבקר ההגשה) — no sentinel", () => {
    expect(JSON.stringify(findings)).not.toContain(SENSITIVE_BODY_SENTINEL);
  });

  it("quality matrix results (12×8) — no sentinel", () => {
    expect(JSON.stringify(quality)).not.toContain(SENSITIVE_BODY_SENTINEL);
  });

  it("evidence rows reference records by collection/recordId ONLY (link, not content)", () => {
    for (const ev of evaluations) {
      for (const e of ev.evidence) {
        // structural: an evidence row is a label + status + optional typed ref
        const keys = Object.keys(e).sort();
        expect(keys.every((k) => ["label", "statusHe", "resolved", "ref"].includes(k))).toBe(true);
        if (e.ref) {
          expect(Object.keys(e.ref).sort()).toEqual(["collection", "recordId", "route"]);
        }
      }
    }
  });
});

describe("W7-G 7.25 — sensitive-export attempt via the submission PRINT view", () => {
  it("the full rendered A4 print markup contains no sensitive body — print is evaluations-only", () => {
    const sources = buildSources({ gateValidations: gateValidationsWithSensitiveEvidence() });
    const quality = runQualityValidation(sources);
    const evaluations = evaluateAllDeliverables(sources, quality);
    const html = renderToStaticMarkup(
      createElement(SubmissionPrintView, { evaluations, dateISO: TEST_NOW_ISO }),
    );
    expect(html.length).toBeGreaterThan(1000); // the print view actually rendered
    expect(html).not.toContain(SENSITIVE_BODY_SENTINEL);
    // and it does not render the record title either — print carries deliverable
    // metadata + typed evidence refs, not memory-record content
    expect(html).not.toContain(sensitive.title);
  });

  it("rejected material NEVER counts complete at the submission level (checklist item)", () => {
    // a deliverable whose canonical-engine approval is "נדחה" cannot be מלא
    const base = buildSources();
    const rejected = {
      id: "ap-w7g-rej",
      createdAt: TEST_NOW_ISO,
      updatedAt: TEST_NOW_ISO,
      subjectRef: "submission-deliverable:training-matrix",
      requestedById: "u-tzachi",
      requestedAt: TEST_NOW_ISO,
      status: "נדחה",
      decidedById: "u-tzachi",
      decidedAt: TEST_NOW_ISO,
      note: "נדחה בבדיקת W7-G",
    } as (typeof base.approvals)[number];
    const sources = buildSources({ approvals: [...base.approvals, rejected] });
    const quality = runQualityValidation(sources);
    const evaluations = evaluateAllDeliverables(sources, quality);
    const tm = evaluations.find((e) => e.key === "training-matrix");
    expect(tm).toBeDefined();
    expect(tm?.state).not.toBe("מלא");
    expect(tm?.approvalStatusHe).toContain("נדחה");
  });
});
