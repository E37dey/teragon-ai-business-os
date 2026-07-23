// W6-A — duplicate + contradiction detection are DETERMINISTIC: same inputs
// twice ⇒ byte-identical check results; thresholds are stable.
import { describe, expect, it } from "vitest";
import {
  extractClaims,
  extractWikiLinks,
  slugify,
  stripMarkdown,
  suggestedSensitivity,
  titleSimilarity,
} from "@/memory/core/text";
import { freshWorkflow, makeDraft, seedSource, TZACHI } from "./helpers";

describe("deterministic text utilities", () => {
  it("slugify is stable and Hebrew-safe", () => {
    expect(slugify("העדפת תקשורת — סטודיו דגש")).toBe("העדפת-תקשורת-סטודיו-דגש");
    expect(slugify("  Multi  Word Title! ")).toBe("multi-word-title");
    expect(slugify('ד"ר יעל')).toBe("דר-יעל");
  });

  it("titleSimilarity is symmetric, bounded and rounded", () => {
    const a = titleSimilarity("העדפת תקשורת סטודיו", "העדפת תקשורת משרד");
    const b = titleSimilarity("העדפת תקשורת משרד", "העדפת תקשורת סטודיו");
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(1);
    expect(titleSimilarity("אבג", "אבג")).toBe(1);
    expect(titleSimilarity("אחד שתיים", "שלוש ארבע")).toBe(0);
  });

  it("extractClaims normalizes key/value pairs deterministically", () => {
    const text = "ערוץ מועדף: וואטסאפ\nהערה כללית ללא מפתח\nזמן אספקה: 3 ימים";
    const claims = extractClaims(text);
    expect(claims).toEqual(extractClaims(text));
    expect(claims).toContainEqual({ key: "ערוץ מועדף", value: "וואטסאפ" });
    expect(claims).toContainEqual({ key: "זמן אספקה", value: "ימים" });
  });

  it("extractWikiLinks de-dupes and keeps order", () => {
    expect(extractWikiLinks("[[א]] וגם [[ב|כינוי]] ושוב [[א]]")).toEqual(["א", "ב"]);
  });

  it("stripMarkdown removes syntax but keeps content", () => {
    const plain = stripMarkdown("# כותרת\n\n- **מודגש** ו[[קישור|כינוי]]\n`קוד`");
    expect(plain).toContain("כותרת");
    expect(plain).toContain("מודגש");
    expect(plain).toContain("כינוי");
    expect(plain).not.toContain("#");
    expect(plain).not.toContain("[[");
    expect(plain).not.toContain("**");
  });

  it("suggestedSensitivity is a deterministic keyword scan", () => {
    expect(suggestedSensitivity("מספר ת.ז של הלקוח")).toBe("מוגבל");
    expect(suggestedSensitivity("טלפון ישיר 052-1234567")).toBe("רגיש");
    expect(suggestedSensitivity("תמחור העסקה 5,000 ₪")).toBe("פנימי");
    expect(suggestedSensitivity("סיכום פגישה כללי")).toBeNull();
  });
});

describe("duplicate + contradiction checks (via workflow)", () => {
  it("flags a similar title as duplicate warning with related ids", async () => {
    const { stores, workflow } = freshWorkflow();
    await seedSource(stores);
    // seed record mem-2 title: "העדפות תקשורת — סטודיו דגש"
    const proposal = await workflow.submitProposal({
      observationHe: "בדיקת כפילות",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({ title: "העדפות תקשורת — סטודיו דגש (עדכון)" }),
    });
    expect(proposal.checks.duplicateCheck.outcome).toBe("אזהרה");
    expect(proposal.checks.duplicateCheck.relatedIds).toContain("mem-2");
  });

  it("detects a contradiction against an approved record and opens a conflict", async () => {
    const { stores, workflow } = freshWorkflow();
    await seedSource(stores);
    const first = await workflow.submitProposal({
      observationHe: "עובדה בסיס",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({
        title: "עובדת בסיס לערוץ",
        bodyMarkdown: "ערוץ מועדף: מייל",
      }),
    });
    const base = await workflow.approve(first.id, TZACHI);

    const contradicting = await workflow.submitProposal({
      observationHe: "עובדה סותרת",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({
        title: "עובדה חדשה שונה לגמרי בנושא",
        bodyMarkdown: "ערוץ מועדף: וואטסאפ",
      }),
    });
    expect(contradicting.checks.contradictionCheck.outcome).toBe("אזהרה");
    expect(contradicting.checks.contradictionCheck.relatedIds).toContain(base.id);
    const conflicts = await stores.conflicts.list();
    expect(conflicts.length).toBeGreaterThan(0);
    const conflict = conflicts.find((c) => c.proposalId === contradicting.id);
    expect(conflict?.recordId).toBe(base.id);
    expect(conflict?.status).toBe("פתוח");
    expect(conflict?.claimA.claimValue).not.toBe(conflict?.claimB.claimValue);
    expect(conflict?.claimA.claimKey).toBe(conflict?.claimB.claimKey);
  });

  it("is deterministic: identical submissions produce identical check outcomes", async () => {
    const run = async () => {
      const { stores, workflow } = freshWorkflow();
      await seedSource(stores);
      const p = await workflow.submitProposal({
        observationHe: "דטרמיניזם",
        proposedById: "agent-memory",
        proposedByName: "סוכן זיכרון",
        draft: makeDraft({ title: "העדפות תקשורת — סטודיו דגש (עדכון)" }),
      });
      return p.checks;
    };
    const a = await run();
    const b = await run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("no contradiction across different layers (scope is per-layer)", async () => {
    const { stores, workflow } = freshWorkflow();
    await seedSource(stores);
    const first = await workflow.submitProposal({
      observationHe: "בסיס",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({ title: "עובדת שכבה אחת", bodyMarkdown: "ערוץ מועדף: מייל", memoryLayer: "customer" }),
    });
    await workflow.approve(first.id, TZACHI);
    const other = await workflow.submitProposal({
      observationHe: "שכבה אחרת",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({
        title: "עובדה טכנית נפרדת",
        bodyMarkdown: "ערוץ מועדף: וואטסאפ",
        memoryLayer: "technical",
        folder: "תפעול",
      }),
    });
    expect(other.checks.contradictionCheck.outcome).toBe("עבר");
  });
});
