// W7-G (7.25) GAP-FILL — the presenter-note ACCESS MODEL.
//
// HONEST STATE (documented in docs/WAVE_7_SECURITY_REPORT.md): there is no
// authentication/role system — presenter notes are demo-visible to whoever
// opens /submission/presentation and presses N. What this file pins is the
// STRUCTURAL access model that does exist:
// (1) presenter-note BODIES surface only on the presentation surfaces (notes
//     drawer / print handout) — the /submission deliverable evaluation and the
//     A4 print carry only a presence STATUS, never the note text;
// (2) the canonical notes contain no personal contact data (phones/emails);
// (3) the canonical notes keep the honesty notes (הערת כנות / טרם נמדד).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { NOTE_DEFINITIONS, SECTION_DEFINITIONS } from "@/presentation";
import { evaluateAllDeliverables } from "@/domain/submission";
import { runQualityValidation } from "@/validation/submission/qualityValidator";
import { SubmissionPrintView } from "@/modules/submission/printView";
import type { PresenterNoteLike } from "@/domain/submission";
import { buildSources, TEST_NOW_ISO } from "../submission/helpers";

const NOTE_SENTINEL = "W7G-NOTE-SENTINEL-הערת-מרצה-שאסור-שתודלף-להגשה";

function notesAsCollection(): PresenterNoteLike[] {
  const rows: PresenterNoteLike[] = NOTE_DEFINITIONS.map((n) => ({
    id: n.id,
    createdAt: TEST_NOW_ISO,
    updatedAt: TEST_NOW_ISO,
    sectionId: n.sectionId,
    text: n.textHe,
  }));
  // plus a sentinel note bound to a deliverable — the strongest leak probe
  rows.push({
    id: "pn-w7g-sentinel",
    createdAt: TEST_NOW_ISO,
    updatedAt: TEST_NOW_ISO,
    deliverableKey: "one-pager",
    text: NOTE_SENTINEL,
  });
  return rows;
}

describe("W7-G 7.25 — presenter-note access model", () => {
  it("submission evaluations expose only a presence STATUS — never the note text", () => {
    const sources = buildSources({ presenterNotes: notesAsCollection() });
    const evaluations = evaluateAllDeliverables(sources, runQualityValidation(sources));
    const onePager = evaluations.find((e) => e.key === "one-pager");
    expect(onePager?.presentationStatusHe).toBe("הערת מרצה קיימת");
    expect(JSON.stringify(evaluations)).not.toContain(NOTE_SENTINEL);
  });

  it("the A4 submission print never renders a presenter-note body", () => {
    const sources = buildSources({ presenterNotes: notesAsCollection() });
    const evaluations = evaluateAllDeliverables(sources, runQualityValidation(sources));
    const html = renderToStaticMarkup(
      createElement(SubmissionPrintView, { evaluations, dateISO: TEST_NOW_ISO }),
    );
    expect(html).not.toContain(NOTE_SENTINEL);
    for (const n of NOTE_DEFINITIONS) {
      expect(html).not.toContain(n.textHe);
    }
  });

  it("canonical presenter notes carry no phone numbers or email addresses", () => {
    const corpus = JSON.stringify(NOTE_DEFINITIONS) + JSON.stringify(SECTION_DEFINITIONS);
    expect(corpus).not.toMatch(/0\d{1,2}-?\d{7}/); // IL phone shapes
    expect(corpus).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/); // emails
  });

  it("the honesty notes survive in the canonical notes (הערת כנות / טרם נמדד)", () => {
    const emphases = NOTE_DEFINITIONS.map((n) => n.emphasis);
    expect(emphases).toContain("הערת כנות");
    const corpus = NOTE_DEFINITIONS.map((n) => n.textHe).join("\n");
    expect(corpus).toContain("טרם נמדד");
  });
});
