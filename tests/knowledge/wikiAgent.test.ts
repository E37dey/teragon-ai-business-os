// W6-C — governed Wiki agent hard rules: authoritative-only retrieval,
// the EXACT no-approved-source answer, per-state exclusion, citations always
// resolve, proposals carry their approval requirement, memory port seam.
import { describe, expect, it } from "vitest";
import {
  NO_APPROVED_SOURCE_HE,
  WikiAgent,
  makeWikiOps,
  type MemorySearchPort,
} from "@/agents/wiki";
import { RETRIEVAL_METHOD_HE } from "@/knowledge/search";
import { NOW, fresh, makeArticle, makeClock, makeDraftInput } from "./helpers";

function agentOn(stores: ReturnType<typeof fresh>["stores"]): WikiAgent {
  return new WikiAgent({ stores, now: makeClock(NOW) });
}

describe("authoritative-only retrieval", () => {
  it("retrieves an approved+effective article", async () => {
    const { stores } = fresh();
    await stores.articles.create(makeArticle({ id: "ka-a" }));
    const hits = await agentOn(stores).searchApproved("וורפינג PETG");
    expect(hits.map((h) => h.article.id)).toEqual(["ka-a"]);
  });

  const excluded = [
    { name: "draft", overrides: { approval: { ...makeArticle().approval, state: "טיוטה" as const } } },
    {
      name: "pending review",
      overrides: { approval: { ...makeArticle().approval, state: "ממתין לבדיקה" as const } },
    },
    { name: "rejected", overrides: { approval: { ...makeArticle().approval, state: "נדחה" as const } } },
    {
      name: "needs update",
      overrides: { approval: { ...makeArticle().approval, state: "דורש עדכון" as const } },
    },
    {
      name: "disputed",
      overrides: { approval: { ...makeArticle().approval, state: "שנוי במחלוקת" as const } },
    },
    {
      name: "archived",
      overrides: { approval: { ...makeArticle().approval, state: "בארכיון" as const }, archived: true },
    },
    { name: "expired (reviewDate passed)", overrides: { reviewDate: "2026-06-01" } },
    { name: "not yet effective", overrides: { effectiveDate: "2026-09-01" } },
  ];
  for (const { name, overrides } of excluded) {
    it(`NEVER retrieves a ${name} article`, async () => {
      const { stores } = fresh();
      await stores.articles.create(makeArticle({ id: "ka-x", ...overrides }));
      const hits = await agentOn(stores).searchApproved("וורפינג PETG");
      expect(hits).toHaveLength(0);
      const answer = await agentOn(stores).answerQuestion("איך פותרים וורפינג ב-PETG?");
      expect(answer.answer).toBe(NO_APPROVED_SOURCE_HE);
      expect(answer.sources).toHaveLength(0);
    });
  }
});

describe("no approved source ⇒ the EXACT honest answer", () => {
  it("returns exactly the canonical sentence — never a paraphrase or a guess", async () => {
    const { stores } = fresh();
    const answer = await agentOn(stores).answerQuestion("מהי מהירות ההדפסה המומלצת לניילון?");
    expect(answer.answer).toBe("לא נמצא מקור מאושר שמספיק למענה");
    expect(answer.answer).toBe(NO_APPROVED_SOURCE_HE);
    expect(answer.sources).toHaveLength(0);
    expect(answer.relevantExcerpts).toHaveLength(0);
    expect(answer.retrievalMethod).toBe(RETRIEVAL_METHOD_HE);
    expect(answer.approvalRequirement).toBeNull();
  });

  it("an unrelated query against real approved articles still gets the exact sentence", async () => {
    const { stores } = fresh();
    await stores.articles.create(makeArticle({ id: "ka-a" }));
    const answer = await agentOn(stores).answerQuestion("qqqzzz nonexistent");
    expect(answer.answer).toBe(NO_APPROVED_SOURCE_HE);
  });
});

describe("citations always resolve to real records", () => {
  it("every cited source id+version matches a stored article", async () => {
    const { stores } = fresh();
    await stores.articles.create(makeArticle({ id: "ka-a", version: 3 }));
    await stores.articles.create(
      makeArticle({ id: "ka-b", title: "מדריך וורפינג נוסף", content: "וורפינג נפתר עם Brim." }),
    );
    const answer = await agentOn(stores).answerQuestion("וורפינג");
    expect(answer.sources.length).toBeGreaterThan(0);
    for (const src of answer.sources) {
      const stored = await stores.articles.get(src.articleId);
      expect(stored).toBeDefined();
      expect(stored?.version).toBe(src.version);
      expect(stored?.title).toBe(src.titleHe);
      expect(answer.sourceStates[src.articleId]).toBe("מאושר");
    }
  });

  it("bounded context restricts retrieval but never bypasses the authority gate", async () => {
    const { stores } = fresh();
    const draft = makeArticle({
      id: "ka-d",
      approval: { ...makeArticle().approval, state: "טיוטה" },
    });
    await stores.articles.create(draft);
    const answer = await agentOn(stores).answerQuestion("וורפינג", { articles: [draft] });
    expect(answer.answer).toBe(NO_APPROVED_SOURCE_HE);
  });
});

describe("proposals require approval — the agent never applies changes", () => {
  it("draft-article proposal carries 'permanent-knowledge-update' and persists NOTHING", async () => {
    const { stores } = fresh();
    const agent = agentOn(stores);
    const proposal = agent.proposeDraftArticle(makeDraftInput(), "חסר מאמר על ניקוי חוד");
    expect(proposal.requiresApproval).toBe(true);
    expect(proposal.approvalRequirement).toBe("permanent-knowledge-update");
    expect(proposal.proposedBy).toBe("ag-wiki");
    expect(await stores.articles.list()).toHaveLength(0);
  });

  it("memory-update proposal carries 'permanent-memory-update'", () => {
    const { stores } = fresh();
    const proposal = agentOn(stores).proposeMemoryUpdate("לעדכן את הקשר העסקה");
    expect(proposal.approvalRequirement).toBe("permanent-memory-update");
    expect(proposal.requiresApproval).toBe(true);
  });
});

describe("memory port seam", () => {
  it("defaults to a no-op (empty hits) until integration", async () => {
    const { stores } = fresh();
    await stores.articles.create(makeArticle({ id: "ka-a" }));
    const answer = await agentOn(stores).answerQuestion("וורפינג");
    expect(answer.memoryHits).toEqual([]);
  });

  it("an injected port's approved-memory hits flow into the answer", async () => {
    const { stores } = fresh();
    await stores.articles.create(makeArticle({ id: "ka-a" }));
    const port: MemorySearchPort = {
      searchApprovedMemory: () =>
        Promise.resolve([{ recordId: "mem-1", titleHe: "עסקת אפיק", relevantExcerpt: "הקשר" }]),
    };
    const agent = new WikiAgent({ stores, memoryPort: port, now: makeClock(NOW) });
    const answer = await agent.answerQuestion("וורפינג");
    expect(answer.memoryHits).toHaveLength(1);
    expect(answer.memoryHits[0]?.recordId).toBe("mem-1");
  });
});

describe("wikiOps surface", () => {
  it("exposes exactly searchApproved / showContradictions / answerQuestion", async () => {
    const { stores } = fresh();
    await stores.articles.create(makeArticle({ id: "ka-a" }));
    const ops = makeWikiOps(agentOn(stores));
    expect(Object.keys(ops).sort()).toEqual([
      "answerQuestion",
      "searchApproved",
      "showContradictions",
    ]);
    const hits = await ops.searchApproved("וורפינג");
    expect(hits).toHaveLength(1);
    const answer = await ops.answerQuestion("וורפינג");
    expect(answer.sources).toHaveLength(1);
  });
});
