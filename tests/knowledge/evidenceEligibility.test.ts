// W6-C — evidence eligibility gate (Phase 6.12, W6-C side): only approved+
// effective articles may back recommendations; usage recording refuses
// ineligible articles; superseding marks without rewriting.
import { describe, expect, it } from "vitest";
import {
  markUsageSuperseded,
  mayUseAsEvidence,
  recordKnowledgeUsage,
} from "@/knowledge/evidenceEligibility";
import { NOW, fresh, makeArticle, makeClock } from "./helpers";

describe("mayUseAsEvidence (pure gate)", () => {
  it("approved + effective ⇒ eligible", () => {
    expect(mayUseAsEvidence(makeArticle(), NOW)).toEqual({ eligible: true, reasonHe: null });
  });

  const ineligible = [
    { name: "draft", overrides: { approval: { ...makeArticle().approval, state: "טיוטה" as const } } },
    { name: "rejected", overrides: { approval: { ...makeArticle().approval, state: "נדחה" as const } } },
    {
      name: "disputed",
      overrides: { approval: { ...makeArticle().approval, state: "שנוי במחלוקת" as const } },
    },
    { name: "archived", overrides: { archived: true } },
    { name: "expired", overrides: { reviewDate: "2026-06-01" } },
    { name: "not yet effective", overrides: { effectiveDate: "2026-09-01" } },
    { name: "no effective date", overrides: { effectiveDate: null } },
  ];
  for (const { name, overrides } of ineligible) {
    it(`${name} ⇒ NOT eligible, with a Hebrew reason`, () => {
      const gate = mayUseAsEvidence(makeArticle(overrides), NOW);
      expect(gate.eligible).toBe(false);
      expect(gate.reasonHe).toBeTruthy();
    });
  }
});

describe("recordKnowledgeUsage", () => {
  it("records article id + CURRENT version + agent + recommendation ref", async () => {
    const { stores } = fresh();
    await stores.articles.create(makeArticle({ id: "ka-a", version: 2 }));
    const usage = await recordKnowledgeUsage(
      stores,
      { articleId: "ka-a", byAgent: "ag-fixer", inRecommendation: "ai-envelope:env-9" },
      makeClock(NOW),
    );
    expect(usage.articleId).toBe("ka-a");
    expect(usage.articleVersion).toBe(2);
    expect(usage.byAgent).toBe("ag-fixer");
    expect(usage.inRecommendation).toBe("ai-envelope:env-9");
    expect(usage.supersededByVersion).toBeNull();
  });

  it("REFUSES to record usage of a non-eligible article", async () => {
    const { stores } = fresh();
    await stores.articles.create(
      makeArticle({ id: "ka-d", approval: { ...makeArticle().approval, state: "טיוטה" } }),
    );
    await expect(
      recordKnowledgeUsage(
        stores,
        { articleId: "ka-d", byAgent: "ag-wiki", inRecommendation: "rec-1" },
        makeClock(NOW),
      ),
    ).rejects.toThrow(/KNOWLEDGE_EVIDENCE_INELIGIBLE/);
    expect(await stores.usage.list()).toHaveLength(0);
  });

  it("refuses a missing article", async () => {
    const { stores } = fresh();
    await expect(
      recordKnowledgeUsage(
        stores,
        { articleId: "no-such", byAgent: "ag-wiki", inRecommendation: "rec-1" },
        makeClock(NOW),
      ),
    ).rejects.toThrow(/KNOWLEDGE_NOT_FOUND/);
  });
});

describe("markUsageSuperseded", () => {
  it("marks only older-version usage; original fields are never rewritten", async () => {
    const { stores } = fresh();
    await stores.articles.create(makeArticle({ id: "ka-a", version: 1 }));
    const clock = makeClock(NOW);
    const u1 = await recordKnowledgeUsage(
      stores,
      { articleId: "ka-a", byAgent: "ag-fixer", inRecommendation: "rec-old" },
      clock,
    );
    // simulate approval of version 3
    const marked = await markUsageSuperseded(stores, "ka-a", 3, clock);
    expect(marked).toHaveLength(1);
    const after = await stores.usage.get(u1.id);
    expect(after?.supersededByVersion).toBe(3);
    expect(after?.supersededAt).not.toBeNull();
    // original recording intact
    expect(after?.articleVersion).toBe(1);
    expect(after?.usedAt).toBe(u1.usedAt);
    expect(after?.byAgent).toBe("ag-fixer");
    expect(after?.inRecommendation).toBe("rec-old");
  });

  it("does not touch usage of the current version or already-marked records", async () => {
    const { stores } = fresh();
    await stores.articles.create(makeArticle({ id: "ka-a", version: 3 }));
    const clock = makeClock(NOW);
    const current = await recordKnowledgeUsage(
      stores,
      { articleId: "ka-a", byAgent: "ag-wiki", inRecommendation: "rec-current" },
      clock,
    );
    const marked = await markUsageSuperseded(stores, "ka-a", 3, clock);
    expect(marked).toHaveLength(0);
    expect((await stores.usage.get(current.id))?.supersededByVersion).toBeNull();
    // already-marked stays with its original superseding version
    await stores.usage.update(current.id, { supersededByVersion: 4, supersededAt: clock() });
    const again = await markUsageSuperseded(stores, "ka-a", 5, clock);
    expect(again).toHaveLength(0);
    expect((await stores.usage.get(current.id))?.supersededByVersion).toBe(4);
  });
});
