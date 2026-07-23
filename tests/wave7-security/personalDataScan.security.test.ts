// W7-G (7.25) GAP-FILL — "presentation / print / backup contain no real
// personal data beyond the synthetic seed".
//
// Method (honest): every phone / email PATTERN found in the presentation
// content, the submission A4 print output and the quick-start/one-pager
// content must belong to the synthetic seed's own set (seedData.ts — the demo
// identities). Finding a contact string that is NOT in the seed would mean
// real personal data leaked into a deliverable. Binary backup images cannot
// be text-scanned — that limitation is reported honestly in
// docs/WAVE_7_SECURITY_REPORT.md (they are captures of the seeded app).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import * as seed from "@/repositories/seed";
import { NOTE_DEFINITIONS, SECTION_DEFINITIONS } from "@/presentation";
import { evaluateAllDeliverables, ONE_PAGER } from "@/domain/submission";
import { runQualityValidation } from "@/validation/submission/qualityValidator";
import { SubmissionPrintView } from "@/modules/submission/printView";
import {
  CORRECT_USE_RULES,
  QUICK_START_ACTIONS,
} from "@/domain/training-materials";
import { buildSources, TEST_NOW_ISO } from "../submission/helpers";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /0\d{1,2}-\d{6,7}/g;

function matches(re: RegExp, text: string): string[] {
  return [...text.matchAll(new RegExp(re.source, "g"))].map((m) => m[0]);
}

/** every phone/email string the synthetic seed itself defines (the allowlist) */
function seedContactSet(): Set<string> {
  const corpus = JSON.stringify(seed);
  return new Set([...matches(EMAIL_RE, corpus), ...matches(PHONE_RE, corpus)]);
}

function deliverableCorpora(): { name: string; text: string }[] {
  const sources = buildSources();
  const evaluations = evaluateAllDeliverables(sources, runQualityValidation(sources));
  return [
    { name: "presentation sections", text: JSON.stringify(SECTION_DEFINITIONS) },
    { name: "presenter notes", text: JSON.stringify(NOTE_DEFINITIONS) },
    {
      name: "submission A4 print",
      text: renderToStaticMarkup(
        createElement(SubmissionPrintView, { evaluations, dateISO: TEST_NOW_ISO }),
      ),
    },
    { name: "one-pager", text: JSON.stringify(ONE_PAGER) },
    { name: "quick-start actions", text: JSON.stringify(QUICK_START_ACTIONS) },
    { name: "correct-use rules", text: JSON.stringify(CORRECT_USE_RULES) },
  ];
}

describe("W7-G 7.25 — personal-data scan of the deliverable surfaces", () => {
  const allowed = seedContactSet();

  it("the seed allowlist is non-empty (the scan has something real to compare against)", () => {
    expect(allowed.size).toBeGreaterThan(5);
  });

  it("every phone/email in presentation/print/quick-start content belongs to the synthetic seed set", () => {
    const offenders: { surface: string; value: string }[] = [];
    for (const c of deliverableCorpora()) {
      for (const value of [...matches(EMAIL_RE, c.text), ...matches(PHONE_RE, c.text)]) {
        if (!allowed.has(value)) offenders.push({ surface: c.name, value });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the presentation deck content itself carries NO contact strings at all (stronger than the allowlist)", () => {
    const deck = JSON.stringify(SECTION_DEFINITIONS) + JSON.stringify(NOTE_DEFINITIONS);
    expect(matches(EMAIL_RE, deck)).toEqual([]);
    expect(matches(PHONE_RE, deck)).toEqual([]);
  });
});
