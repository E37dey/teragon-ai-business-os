// W7-G (7.25) GAP-FILL — sensitivity-gated memory used as STAGE-GATE evidence.
//
// Existing coverage (gap analysis): tests/stage-gates/eligibility.test.ts pins
// draft knowledge articles + rejected training materials + ghost refs;
// tests/wave6-security pins the customer-360 / command-center / export
// projections. NOT covered anywhere: what happens when a "רגיש" Wave-6
// memory record is attached to a stage-gate criterion.
//
// HONEST STATE (documented in docs/WAVE_7_SECURITY_REPORT.md): there is no
// auth system — the demo runs as a single CEO user. What IS enforced today:
// (1) the evaluated evidence ref is a TITLE-ONLY projection — the record body
//     can never leak through the validator output that the UI renders;
// (2) sensitivity gating of BODIES lives at the projection layer
//     (HIDDEN_SENSITIVITIES: רגיש/מוגבל stay hidden behind reveal-with-reason).
// LIMITATION pinned here honestly: the validator itself does not (yet) refuse
// a sensitive record as evidence — that would require an auth/viewer model.
import { describe, expect, it } from "vitest";
import { evaluateEvidenceRef, validateGate } from "@/domain/stage-gates";
import { HIDDEN_SENSITIVITIES, isHiddenSensitivity } from "@/integration/customer360MemoryExtras";
import { defOf, makeCtx, makeGateV2, makeRef, NOW } from "../stage-gates/helpers";
import {
  asLegacyCollectionRecord,
  makeSensitiveMemoryV2,
  SENSITIVE_BODY_SENTINEL,
} from "./helpers";

const g1 = defOf("G1");
const g1Goal = g1.criteria.find((c) => c.key === "g1-goal");
if (!g1Goal) throw new Error("g1-goal criterion missing");

describe("W7-G 7.25 — sensitive memory record as gate evidence", () => {
  const sensitive = makeSensitiveMemoryV2();
  const ctx = makeCtx({ memoryRecords: [asLegacyCollectionRecord(sensitive)] });

  it("the evaluated evidence ref is a TITLE-ONLY projection — the sensitive body can never leak through it", () => {
    const out = evaluateEvidenceRef(
      makeRef({ refType: "memoryRecord", refId: sensitive.id, criterionKey: g1Goal.key }),
      g1Goal,
      ctx,
      NOW,
    );
    // structural: only ref/status/reasonHe/recordTitleHe — no body field exists
    expect(Object.keys(out).sort()).toEqual(["reasonHe", "recordTitleHe", "ref", "status"]);
    expect(JSON.stringify(out)).not.toContain(SENSITIVE_BODY_SENTINEL);
    expect(out.recordTitleHe).toBe(sensitive.title);
  });

  it("the FULL gate validation (what /stage-gates and /submission render) never carries the body", () => {
    const gate = makeGateV2("sg-1", {
      attachedEvidence: [
        makeRef({ refType: "memoryRecord", refId: sensitive.id, criterionKey: g1Goal.key }),
      ],
    });
    const v = validateGate(gate, g1, ctx, NOW);
    expect(JSON.stringify(v)).not.toContain(SENSITIVE_BODY_SENTINEL);
  });

  it("what IS enforced: רגיש/מוגבל are the hidden sensitivities at the projection layer", () => {
    expect([...HIDDEN_SENSITIVITIES]).toEqual(["רגיש", "מוגבל"]);
    expect(isHiddenSensitivity("רגיש")).toBe(true);
    expect(isHiddenSensitivity("מוגבל")).toBe(true);
    expect(isHiddenSensitivity("ציבורי")).toBe(false);
    expect(isHiddenSensitivity("פנימי")).toBe(false);
  });

  it("HONEST LIMITATION (pinned, not hidden): the validator accepts an existing sensitive record as valid evidence — no viewer/auth model exists in demo mode", () => {
    const out = evaluateEvidenceRef(
      makeRef({ refType: "memoryRecord", refId: sensitive.id, criterionKey: g1Goal.key }),
      g1Goal,
      ctx,
      NOW,
    );
    // If this ever starts failing because a sensitivity gate was ADDED to the
    // validator, that is an improvement: update this pin + the security report.
    expect(out.status).toBe("תקפה");
  });

  it("a sensitive record that does NOT exist in the collection is still rejected (what IS enforced)", () => {
    const out = evaluateEvidenceRef(
      makeRef({ refType: "memoryRecord", refId: "mrec-ghost-sensitive", criterionKey: g1Goal.key }),
      g1Goal,
      makeCtx(),
      NOW,
    );
    expect(out.status).toBe("פסולה");
    expect(out.reasonHe).toMatch(/לא נמצאה/);
  });
});
