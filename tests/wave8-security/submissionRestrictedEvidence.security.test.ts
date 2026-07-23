// W8-F (8.15) GAP-FILL — restricted records as SUBMISSION evidence.
//
// GAP ANALYSIS (existing, NOT re-tested):
//   tests/wave7-security/gateEvidenceMemorySensitivity — STAGE-GATE evidence
//     with a רגיש memory record (title-only projection);
//   tests/wave7-security/personalDataScan — submission print/one-pager scan;
//   tests/cross-module-wave8/wiring — Wave-8 evidence refs route/doc validity
//     + additive-only (readiness untouched).
// NOT covered anywhere before this file — the RESTRICTED-CONTENT angle of the
// submission evidence surface itself:
//   (a) SubmissionEvidenceRef is reference-only BY CONSTRUCTION — the closed
//       field set {collection, recordId, route} makes it impossible for a
//       deliverable's evidence to embed a restricted record BODY;
//   (b) every resolved evidence ref of every deliverable stays inside that
//       closed shape at runtime (no spec smuggles a payload field in);
//   (c) Wave8EvidenceRef (additive reviewer refs) is likewise reference-only —
//       label/route/collection/doc/note, no record content;
//   (d) the sensitivity-gated collections (memoryRecords / memoryVersions /
//       memoryUsage) are STRUCTURALLY outside the submission evidence surface —
//       no deliverable's evidence ever references them, so a restricted memory
//       record cannot be attached as submission evidence at all.
import { describe, expect, it } from "vitest";
import { evaluateAllDeliverables } from "@/domain/submission";
import { WAVE8_DELIVERABLE_EVIDENCE } from "@/domain/submission/wave8Evidence";
import { buildSources } from "../submission/helpers";

describe("W8-F 8.15 — submission evidence is reference-only (restricted bodies can't ride along)", () => {
  it("(a)+(b) every resolved evidence ref has EXACTLY {collection, recordId, route}", () => {
    const sources = buildSources();
    const evaluated = evaluateAllDeliverables(sources, []);
    let refsSeen = 0;
    for (const d of evaluated) {
      for (const ev of d.evidence) {
        if (ev.ref !== null) {
          refsSeen += 1;
          expect(Object.keys(ev.ref).sort()).toEqual(["collection", "recordId", "route"]);
        }
        // the resolution result carries a label + honest status — never a body
        expect(Object.keys(ev).sort()).toEqual(["label", "ref", "resolved", "statusHe"]);
      }
    }
    expect(refsSeen).toBeGreaterThan(0);
  });

  it("(c) Wave-8 reviewer refs are reference-only — closed field set, no content field", () => {
    expect(WAVE8_DELIVERABLE_EVIDENCE.length).toBeGreaterThan(0);
    for (const ref of WAVE8_DELIVERABLE_EVIDENCE) {
      expect(Object.keys(ref).sort()).toEqual([
        "collection",
        "deliverableKey",
        "docPath",
        "label",
        "noteHe",
        "route",
      ]);
    }
  });

  it("(d) no submission evidence ever references a sensitivity-gated memory collection", () => {
    const gated = new Set(["memoryRecords", "memoryVersions", "memoryUsage"]);
    const sources = buildSources();
    for (const d of evaluateAllDeliverables(sources, [])) {
      for (const ev of d.evidence) {
        if (ev.ref !== null) {
          expect(gated.has(ev.ref.collection), `${d.key} → ${ev.label}`).toBe(false);
        }
      }
    }
    for (const ref of WAVE8_DELIVERABLE_EVIDENCE) {
      if (ref.collection !== null) {
        expect(gated.has(ref.collection), ref.label).toBe(false);
      }
    }
  });
});
