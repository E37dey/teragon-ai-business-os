// W6-C — deterministic contradiction detection + the disputed-state flow:
// conflict records are persisted, both articles drop out of "מאושר" (fail-
// closed), re-detection is idempotent, resolution requires a note and the way
// back to authority is the full review cycle.
import { describe, expect, it } from "vitest";
import { WikiAgent, detectContradictions, extractClaims } from "@/agents/wiki";
import { isAuthoritative } from "@/domain/knowledge";
import { NOW, fresh, makeArticle, makeClock } from "./helpers";

function absArticle(id: string, content: string) {
  return makeArticle({
    id,
    title: `הגדרות ABS ${id}`,
    category: "חומרי גלם",
    supportedMaterials: ["ABS"],
    content,
  });
}

describe("claim extraction (pure)", () => {
  it("extracts a numeric parameter claim deterministically", () => {
    const article = absArticle("ka-1", "להדפסה טובה: טמפ' מיטה 100°C ותא סגור.");
    const claims = extractClaims(article);
    expect(claims).toEqual([
      { keyHe: "טמפ' מיטה", value: 100, textHe: expect.stringContaining("טמפ' מיטה") },
    ]);
  });

  it("extracts nothing when no known parameter appears", () => {
    expect(extractClaims(makeArticle({ content: "טקסט כללי ללא פרמטרים" }))).toEqual([]);
  });
});

describe("detectContradictions (pure)", () => {
  it("flags two articles claiming different values for the same parameter in shared scope", () => {
    const a = absArticle("ka-1", "טמפ' מיטה 100°C ותא סגור.");
    const b = absArticle("ka-2", "מספיקה טמפ' מיטה 80°C עם דבק.");
    const out = detectContradictions([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]?.keyHe).toBe("טמפ' מיטה");
    expect(out[0]?.claimA.value).toBe(100);
    expect(out[0]?.claimB.value).toBe(80);
  });

  it("same value ⇒ no contradiction", () => {
    const a = absArticle("ka-1", "טמפ' מיטה 100°C.");
    const b = absArticle("ka-2", "מומלץ טמפ' מיטה 100°C.");
    expect(detectContradictions([a, b])).toHaveLength(0);
  });

  it("different scope (category+materials disjoint) ⇒ no contradiction", () => {
    const a = absArticle("ka-1", "טמפ' מיטה 100°C.");
    const b = makeArticle({
      id: "ka-2",
      category: "קורסים",
      supportedMaterials: ["PLA"],
      content: "טמפ' מיטה 60°C ל-PLA.",
    });
    expect(detectContradictions([a, b])).toHaveLength(0);
  });
});

describe("flagContradictions — persisted flow", () => {
  it("creates a conflict record and moves BOTH articles to שנוי במחלוקת", async () => {
    const { stores, gov } = fresh();
    await stores.articles.create(absArticle("ka-1", "טמפ' מיטה 100°C."));
    await stores.articles.create(absArticle("ka-2", "טמפ' מיטה 80°C."));
    const agent = new WikiAgent({ stores, governance: gov, now: makeClock(NOW) });

    const created = await agent.flagContradictions();
    expect(created).toHaveLength(1);
    expect(created[0]?.status).toBe("פתוח");
    expect(created[0]?.overlapKeyHe).toBe("טמפ' מיטה");
    expect(created[0]?.claims).toHaveLength(2);

    for (const id of ["ka-1", "ka-2"]) {
      const article = await stores.articles.get(id);
      expect(article?.approval.state).toBe("שנוי במחלוקת");
      expect(isAuthoritative(article!, NOW)).toBe(false);
    }
  });

  it("is idempotent — a second scan creates no duplicate conflicts", async () => {
    const { stores, gov } = fresh();
    await stores.articles.create(absArticle("ka-1", "טמפ' מיטה 100°C."));
    await stores.articles.create(absArticle("ka-2", "טמפ' מיטה 80°C."));
    const agent = new WikiAgent({ stores, governance: gov, now: makeClock(NOW) });
    await agent.flagContradictions();
    const second = await agent.flagContradictions();
    expect(second).toHaveLength(0);
    expect(await stores.conflicts.list()).toHaveLength(1);
  });

  it("disputed articles surface in answers as unresolved conflicts only via still-approved sources", async () => {
    const { stores, gov } = fresh();
    await stores.articles.create(absArticle("ka-1", "טמפ' מיטה 100°C."));
    await stores.articles.create(absArticle("ka-2", "טמפ' מיטה 80°C."));
    const agent = new WikiAgent({ stores, governance: gov, now: makeClock(NOW) });
    await agent.flagContradictions();
    // both are disputed now ⇒ not retrievable ⇒ honest no-source answer
    const answer = await agent.answerQuestion("טמפ' מיטה ABS");
    expect(answer.sources).toHaveLength(0);
  });

  it("requires an injected governance service", async () => {
    const { stores } = fresh();
    const agent = new WikiAgent({ stores, now: makeClock(NOW) });
    await expect(agent.flagContradictions()).rejects.toThrow(/WIKI_GOVERNANCE_MISSING/);
  });
});

describe("conflict resolution", () => {
  it("resolution requires a note; articles return to authority ONLY via re-review", async () => {
    const { stores, gov } = fresh();
    await stores.articles.create(absArticle("ka-1", "טמפ' מיטה 100°C."));
    await stores.articles.create(absArticle("ka-2", "טמפ' מיטה 80°C."));
    const agent = new WikiAgent({ stores, governance: gov, now: makeClock(NOW) });
    const [conflict] = await agent.flagContradictions();

    await expect(gov.resolveConflict(conflict!.id, " ")).rejects.toThrow(/נימוק/);

    const resolved = await gov.resolveConflict(conflict!.id, "ka-1 נכון — נבדק מול היצרן");
    expect(resolved.status).toBe("נפתר");
    expect(resolved.resolutionNoteHe).toContain("נבדק מול היצרן");

    // still disputed until the full review cycle brings them back
    const a = await stores.articles.get("ka-1");
    expect(a?.approval.state).toBe("שנוי במחלוקת");
    await gov.submitForReview("ka-1", "u-tzachi");
    await gov.approve("ka-1", "u-tzachi");
    const back = await stores.articles.get("ka-1");
    expect(back?.approval.state).toBe("מאושר");
  });
});
