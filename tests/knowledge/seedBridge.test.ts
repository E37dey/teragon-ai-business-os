// W6-C — idempotent seed bridge: the 5 Wave-1 knowledgeNotes become governed
// articles with honest states; demo conflict/question/usage records exist;
// re-running creates nothing new.
import { describe, expect, it } from "vitest";
import { isAuthoritative } from "@/domain/knowledge";
import { ensureKnowledgeSeed } from "@/knowledge/seedBridge";
import { searchArticles } from "@/knowledge/search";
import { NOW, fresh, makeClock } from "./helpers";

describe("ensureKnowledgeSeed", () => {
  it("bridges the 5 seed notes + demo records, idempotently", async () => {
    const { stores } = fresh();
    const first = await ensureKnowledgeSeed(stores, makeClock(NOW));
    expect(first.created).toBeGreaterThan(0);

    const articles = await stores.articles.list();
    // 5 bridged notes + 2 disputed demo + 1 expired demo
    expect(articles).toHaveLength(8);
    for (const a of articles) expect(a.demo).toBe(true);

    const second = await ensureKnowledgeSeed(stores, makeClock(NOW));
    expect(second.created).toBe(0);
    expect(await stores.articles.list()).toHaveLength(8);
  });

  it("approved notes become authoritative articles; the unapproved note stays a draft", async () => {
    const { stores } = fresh();
    await ensureKnowledgeSeed(stores, makeClock(NOW));
    const kn1 = await stores.articles.get("ka-kn-1");
    expect(kn1?.approval.state).toBe("מאושר");
    expect(kn1?.category).toBe("פתרון תקלות");
    expect(isAuthoritative(kn1!, NOW)).toBe(true);
    // kn-4 was approved:false in the Wave-1 seed
    const kn4 = await stores.articles.get("ka-kn-4");
    expect(kn4?.approval.state).toBe("טיוטה");
    expect(isAuthoritative(kn4!, NOW)).toBe(false);
  });

  it("honest demo states: disputed pair is NOT authoritative and has an open conflict; the expired article is NOT authoritative", async () => {
    const { stores } = fresh();
    await ensureKnowledgeSeed(stores, makeClock(NOW));
    for (const id of ["ka-demo-1", "ka-demo-2"]) {
      const a = await stores.articles.get(id);
      expect(a?.approval.state).toBe("שנוי במחלוקת");
      expect(isAuthoritative(a!, NOW)).toBe(false);
    }
    const conflict = await stores.conflicts.get("kc-demo-1");
    expect(conflict?.status).toBe("פתוח");
    expect(conflict?.articleIds).toEqual(["ka-demo-1", "ka-demo-2"]);

    const expired = await stores.articles.get("ka-demo-3");
    expect(expired?.approval.state).toBe("מאושר");
    expect(isAuthoritative(expired!, NOW)).toBe(false);
  });

  it("creates source records for notes citing real refs, version snapshots, an open question and one real usage record", async () => {
    const { stores } = fresh();
    await ensureKnowledgeSeed(stores, makeClock(NOW));
    const src = await stores.sources.get("ks-kn-1");
    expect(src?.ref).toBe("ticket:t-9");
    expect(src?.articleId).toBe("ka-kn-1");

    expect(await stores.versions.get("ka-kn-1-v1")).toBeDefined();
    // the draft has no snapshot — versions are created at approval
    expect(await stores.versions.get("ka-kn-4-v1")).toBeUndefined();

    const question = await stores.questions.get("kq-demo-1");
    expect(question?.status).toBe("פתוחה");

    const usage = await stores.usage.get("ku-demo-1");
    expect(usage?.articleId).toBe("ka-kn-1");
    expect(usage?.byAgent).toBe("ag-fixer");
    expect(usage?.inRecommendation).toBe("aiRecommendation:rec-2");
  });

  it("deterministic search finds the bridged warping article", async () => {
    const { stores } = fresh();
    await ensureKnowledgeSeed(stores, makeClock(NOW));
    const articles = await stores.articles.list();
    const authoritative = articles.filter((a) => isAuthoritative(a, NOW));
    const hits = searchArticles(authoritative, "וורפינג PETG");
    expect(hits[0]?.article.id).toBe("ka-kn-1");
    // repeat run — identical ranking (determinism)
    const again = searchArticles(authoritative, "וורפינג PETG");
    expect(again.map((h) => h.article.id)).toEqual(hits.map((h) => h.article.id));
  });
});
