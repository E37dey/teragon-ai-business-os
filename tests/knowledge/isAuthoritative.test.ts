// W6-C — the ONE authoritative predicate: full matrix of 7 states ×
// effectiveness variants (effective / not-yet-effective / no-date / expired /
// archived). Only מאושר+effective+not-expired+not-archived is authoritative.
import { describe, expect, it } from "vitest";
import { KNOWLEDGE_STATES, isAuthoritative, nonAuthoritativeReasonHe } from "@/domain/knowledge";
import { NOW, makeArticle } from "./helpers";

const EFFECTIVENESS_VARIANTS = [
  { name: "effective", effectiveDate: "2026-07-01", reviewDate: "2026-12-31", archived: false },
  { name: "effective-today", effectiveDate: NOW.slice(0, 10), reviewDate: NOW.slice(0, 10), archived: false },
  { name: "not-yet-effective", effectiveDate: "2026-08-01", reviewDate: "2026-12-31", archived: false },
  { name: "no-effective-date", effectiveDate: null, reviewDate: null, archived: false },
  { name: "expired", effectiveDate: "2026-01-01", reviewDate: "2026-06-01", archived: false },
  { name: "archived", effectiveDate: "2026-07-01", reviewDate: "2026-12-31", archived: true },
] as const;

describe("isAuthoritative matrix (7 states × 6 effectiveness variants)", () => {
  for (const state of KNOWLEDGE_STATES) {
    for (const variant of EFFECTIVENESS_VARIANTS) {
      const expected =
        state === "מאושר" && (variant.name === "effective" || variant.name === "effective-today");
      it(`${state} / ${variant.name} ⇒ ${expected}`, () => {
        const article = makeArticle({
          approval: { ...makeArticle().approval, state },
          effectiveDate: variant.effectiveDate,
          reviewDate: variant.reviewDate,
          archived: variant.archived,
        });
        expect(isAuthoritative(article, NOW)).toBe(expected);
      });
    }
  }

  it("draft is NEVER authoritative even with perfect dates", () => {
    const article = makeArticle({ approval: { ...makeArticle().approval, state: "טיוטה" } });
    expect(isAuthoritative(article, NOW)).toBe(false);
  });

  it("rejected is NEVER authoritative", () => {
    const article = makeArticle({ approval: { ...makeArticle().approval, state: "נדחה" } });
    expect(isAuthoritative(article, NOW)).toBe(false);
  });

  it("expired (reviewDate passed) is NEVER authoritative", () => {
    const article = makeArticle({ reviewDate: "2026-07-22" });
    expect(isAuthoritative(article, NOW)).toBe(false);
    expect(nonAuthoritativeReasonHe(article, NOW)).toContain("פג תוקף");
  });

  it("reason is null for an authoritative article", () => {
    expect(nonAuthoritativeReasonHe(makeArticle(), NOW)).toBeNull();
  });

  it("reason names the state for a pending article", () => {
    const article = makeArticle({ approval: { ...makeArticle().approval, state: "ממתין לבדיקה" } });
    expect(nonAuthoritativeReasonHe(article, NOW)).toContain("ממתין לבדיקה");
  });
});
