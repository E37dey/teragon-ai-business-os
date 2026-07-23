// W6-C — version immutability + deterministic comparison.
import { describe, expect, it } from "vitest";
import { appendVersionSnapshot, compareVersions } from "@/knowledge/stores";
import { NOW, fresh, makeArticle, makeClock } from "./helpers";

describe("version immutability", () => {
  it("appends a snapshot once; re-appending the same version THROWS", async () => {
    const { stores } = fresh();
    const article = makeArticle({ id: "ka-a", version: 1 });
    await stores.articles.create(article);
    const clock = makeClock(NOW);
    const v1 = await appendVersionSnapshot(stores, article, "גרסה ראשונה", "u-tzachi", clock);
    expect(v1.id).toBe("ka-a-v1");
    await expect(
      appendVersionSnapshot(stores, article, "ניסיון שכתוב", "u-tzachi", clock),
    ).rejects.toThrow(/KNOWLEDGE_VERSION_IMMUTABLE/);
    // the stored snapshot kept its original note
    expect((await stores.versions.get("ka-a-v1"))?.changeNoteHe).toBe("גרסה ראשונה");
  });

  it("different versions of the same article append cleanly", async () => {
    const { stores } = fresh();
    const clock = makeClock(NOW);
    const v1Article = makeArticle({ id: "ka-a", version: 1, content: "תוכן ישן" });
    await stores.articles.create(v1Article);
    await appendVersionSnapshot(stores, v1Article, "v1", "u-tzachi", clock);
    const v2Article = { ...v1Article, version: 2, content: "תוכן חדש" };
    await appendVersionSnapshot(stores, v2Article, "v2", "u-tzachi", clock);
    expect((await stores.versions.list()).map((v) => v.id).sort()).toEqual(["ka-a-v1", "ka-a-v2"]);
  });
});

describe("compareVersions", () => {
  it("returns field-level diffs for changed fields only, in deterministic order", async () => {
    const { stores } = fresh();
    const clock = makeClock(NOW);
    const a1 = makeArticle({ id: "ka-a", version: 1, content: "תוכן ישן", supportedMaterials: ["PETG"] });
    await stores.articles.create(a1);
    const v1 = await appendVersionSnapshot(stores, a1, "v1", "u-tzachi", clock);
    const v2 = await appendVersionSnapshot(
      stores,
      { ...a1, version: 2, content: "תוכן חדש", supportedMaterials: ["PETG", "ABS"] },
      "v2",
      "u-tzachi",
      clock,
    );
    const diffs = compareVersions(v1, v2);
    expect(diffs.map((d) => d.field)).toEqual(["content", "supportedMaterials"]);
    expect(diffs[0]?.before).toBe("תוכן ישן");
    expect(diffs[0]?.after).toBe("תוכן חדש");
    expect(diffs[1]?.after).toBe("PETG · ABS");
  });

  it("identical snapshots produce an empty diff", async () => {
    const { stores } = fresh();
    const clock = makeClock(NOW);
    const a = makeArticle({ id: "ka-a", version: 1 });
    await stores.articles.create(a);
    const v1 = await appendVersionSnapshot(stores, a, "v1", "u-tzachi", clock);
    expect(compareVersions(v1, v1)).toEqual([]);
  });
});
