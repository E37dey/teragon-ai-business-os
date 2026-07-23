// W6-F — Phase 6.21 GAP-FILL: source removal AFTER AI use.
//
// Existing coverage proves version-supersede marking (markUsageSuperseded)
// and eligibility refusal per state. The checklist item left open: when a
// knowledge source is REMOVED (archived — the only removal the system allows;
// hard deletion does not exist by design) after an AI answer already used it,
// the usage record must SURVIVE, stay linked, and the article must be marked
// so future use is refused.
import { describe, expect, it } from "vitest";
import { mayUseAsEvidence, recordKnowledgeUsage } from "@/knowledge/evidenceEligibility";
import { fresh, makeArticle } from "../knowledge/helpers";

describe("W6-F GAP-FILL — usage survives source removal (archive-after-use)", () => {
  it("archive after AI use: usage record survives + article marked; future use refused", async () => {
    const { stores, gov, clock } = fresh();
    const article = makeArticle({ id: "ka-used" });
    await stores.articles.create(article);

    // 1 — AI answer uses the approved article (recorded honestly)
    const usage = await recordKnowledgeUsage(
      stores,
      {
        articleId: "ka-used",
        byAgent: "ag-wiki",
        inRecommendation: "ai-envelope:env-w6f",
      },
      clock,
    );
    expect(usage.articleId).toBe("ka-used");

    // 2 — the human archives (removes) the source
    const archived = await gov.archive("ka-used", "u-tzachi", "המקור הוסר לאחר שימוש");
    expect(archived.archived).toBe(true);

    // 3 — the usage record SURVIVES, still linked to the article + version
    const usageAfter = await stores.usage.get(usage.id);
    expect(usageAfter).not.toBeNull();
    expect(usageAfter?.articleId).toBe("ka-used");
    expect(usageAfter?.articleVersion).toBe(usage.articleVersion);
    expect(usageAfter?.inRecommendation).toBe("ai-envelope:env-w6f");

    // 4 — the article record itself is preserved (marked, never hard-deleted)
    const stored = await stores.articles.get("ka-used");
    expect(stored).not.toBeNull();
    expect(stored?.archived).toBe(true);

    // 5 — future evidence use is refused with a Hebrew reason
    const eligibility = mayUseAsEvidence(archived, clock());
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasonHe).toBeTruthy();

    // 6 — recording NEW usage of the removed source throws (fail closed)
    await expect(
      recordKnowledgeUsage(
        stores,
        {
          articleId: "ka-used",
          byAgent: "ag-wiki",
          inRecommendation: "ai-envelope:env-late",
        },
        clock,
      ),
    ).rejects.toThrow();
    // and the surviving usage list still has exactly the original record
    expect((await stores.usage.list()).map((u) => u.id)).toEqual([usage.id]);
  });
});
