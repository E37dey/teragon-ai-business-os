// W6-C — knowledge approval lifecycle THROUGH the canonical ApprovalEngine
// ('permanent-knowledge-update'): draft → submit → approve/reject/
// request-changes; bypass attempts fail inside the engine; versions are
// snapshotted on approval; superseded usage is marked (never rewritten).
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { AgentGovernanceError } from "@/agents/errors";
import { isAuthoritative } from "@/domain/knowledge";
import { KnowledgeGovernanceError } from "@/knowledge/governance";
import { recordKnowledgeUsage } from "@/knowledge/evidenceEligibility";
import { fresh, makeDraftInput } from "./helpers";

describe("draft creation", () => {
  it("creates a valid draft (state טיוטה, version 1, not authoritative)", async () => {
    const { gov, clock } = fresh();
    const article = await gov.createDraft(makeDraftInput(), "u-tzachi");
    expect(article.approval.state).toBe("טיוטה");
    expect(article.version).toBe(1);
    expect(article.effectiveDate).toBeNull();
    expect(isAuthoritative(article, clock())).toBe(false);
  });

  it("rejects an invalid draft input (zod)", async () => {
    const { gov } = fresh();
    await expect(gov.createDraft(makeDraftInput({ title: "אב" }), "u-tzachi")).rejects.toThrow(
      ZodError,
    );
  });
});

describe("submit → approve", () => {
  it("creates a canonical Approval labeled 'עדכון קבוע במאגר הידע' and approves through the engine", async () => {
    const { gov, stores, engine, clock } = fresh();
    const draft = await gov.createDraft(makeDraftInput(), "u-tzachi");
    const review = await gov.submitForReview(draft.id, "u-tzachi");

    const pending = await stores.articles.get(draft.id);
    expect(pending?.approval.state).toBe("ממתין לבדיקה");
    expect(pending?.approval.approvalId).toBe(review.approvalId);

    // the canonical Approval record exists and is pending
    const { getRepository } = await import("@/repositories");
    const approvalsRepo = getRepository<import("@/domain/types").Approval>("approvals");
    const approval = await approvalsRepo.get(review.approvalId);
    expect(approval?.status).toBe("ממתין");
    expect(approval?.note).toContain("עדכון קבוע במאגר הידע");

    const approved = await gov.approve(draft.id, "u-tzachi");
    expect(approved.approval.state).toBe("מאושר");
    expect(approved.effectiveDate).not.toBeNull();
    expect(isAuthoritative(approved, clock())).toBe(true);

    // engine recorded the decision on the canonical record
    const decided = await approvalsRepo.get(review.approvalId);
    expect(decided?.status).toBe("אושר");
    const state = await engine.workflowState(`knowledge-gov-${draft.id}`, review.approvalId);
    expect(state).toBe("approved");

    // immutable version snapshot was appended
    const snapshot = await stores.versions.get(`${draft.id}-v1`);
    expect(snapshot?.version).toBe(1);
    expect(snapshot?.snapshot.title).toBe(draft.title);

    // the review record was closed
    const closed = (await stores.reviews.list()).find((r) => r.id === review.id);
    expect(closed?.decision).toBe("אושר");
    expect(closed?.decidedAt).not.toBeNull();
  });
});

describe("reject / request-changes", () => {
  it("reject requires a note", async () => {
    const { gov } = fresh();
    const draft = await gov.createDraft(makeDraftInput(), "u-tzachi");
    await gov.submitForReview(draft.id, "u-tzachi");
    await expect(gov.reject(draft.id, "u-tzachi", "  ")).rejects.toThrow(KnowledgeGovernanceError);
  });

  it("reject with a note moves the article to נדחה (never authoritative)", async () => {
    const { gov, stores, clock } = fresh();
    const draft = await gov.createDraft(makeDraftInput(), "u-tzachi");
    await gov.submitForReview(draft.id, "u-tzachi");
    const rejected = await gov.reject(draft.id, "u-tzachi", "המקור אינו מהימן");
    expect(rejected.approval.state).toBe("נדחה");
    expect(rejected.approval.noteHe).toBe("המקור אינו מהימן");
    expect(isAuthoritative(rejected, clock())).toBe(false);
    const review = (await stores.reviews.list())[0];
    expect(review?.decision).toBe("נדחה");
  });

  it("request-changes returns the article to the author as דורש עדכון", async () => {
    const { gov, stores } = fresh();
    const draft = await gov.createDraft(makeDraftInput(), "u-tzachi");
    await gov.submitForReview(draft.id, "u-tzachi");
    const back = await gov.requestChanges(draft.id, "u-tzachi", "להוסיף הערת בטיחות");
    expect(back.approval.state).toBe("דורש עדכון");
    const review = (await stores.reviews.list())[0];
    expect(review?.decision).toBe("דורש שינויים");
  });
});

describe("bypass attempts fail", () => {
  it("approve without submit (no pending approval) throws", async () => {
    const { gov } = fresh();
    const draft = await gov.createDraft(makeDraftInput(), "u-tzachi");
    await expect(gov.approve(draft.id, "u-tzachi")).rejects.toThrow(KnowledgeGovernanceError);
  });

  it("double decision on the same approval throws inside the engine", async () => {
    const { gov, engine, stores } = fresh();
    const draft = await gov.createDraft(makeDraftInput(), "u-tzachi");
    const review = await gov.submitForReview(draft.id, "u-tzachi");
    await gov.approve(draft.id, "u-tzachi");
    await expect(
      engine.decide({
        runId: `knowledge-gov-${draft.id}`,
        approvalId: review.approvalId,
        kind: "approve",
        decidedById: "u-tzachi",
      }),
    ).rejects.toThrow(AgentGovernanceError);
    // and the article itself refuses a second approve (no longer pending)
    const article = await stores.articles.get(draft.id);
    expect(article?.approval.state).toBe("מאושר");
    await expect(gov.approve(draft.id, "u-tzachi")).rejects.toThrow(KnowledgeGovernanceError);
  });

  it("engine.execute on a knowledge approval is blocked (recommendation-only, no payload)", async () => {
    const { gov, engine } = fresh();
    const draft = await gov.createDraft(makeDraftInput(), "u-tzachi");
    const review = await gov.submitForReview(draft.id, "u-tzachi");
    await gov.approve(draft.id, "u-tzachi");
    await expect(
      engine.execute(`knowledge-gov-${draft.id}`, review.approvalId, "u-tzachi"),
    ).rejects.toThrow(AgentGovernanceError);
  });

  it("execute on a MISSING approval throws AGENT_EXECUTION_WITHOUT_APPROVAL", async () => {
    const { engine } = fresh();
    await expect(engine.execute("knowledge-gov-x", "no-such-approval", "u-tzachi")).rejects.toThrow(
      /AGENT_EXECUTION_WITHOUT_APPROVAL|אין רשומת אישור/,
    );
  });
});

describe("edit-after-approval versioning + superseded usage", () => {
  it("editing an approved article requires request-changes first; re-approval bumps the version and marks old usage superseded", async () => {
    const { gov, stores, clock } = fresh();
    const draft = await gov.createDraft(makeDraftInput(), "u-tzachi");
    await gov.submitForReview(draft.id, "u-tzachi");
    await gov.approve(draft.id, "u-tzachi");

    // editing while מאושר is refused
    await expect(
      gov.updateDraft(draft.id, makeDraftInput({ content: "תוכן חדש" }), "u-tzachi"),
    ).rejects.toThrow(KnowledgeGovernanceError);

    // record a real usage of version 1
    const usage = await recordKnowledgeUsage(
      stores,
      { articleId: draft.id, byAgent: "ag-wiki", inRecommendation: "rec-test-1" },
      clock,
    );
    expect(usage.articleVersion).toBe(1);
    expect(usage.supersededByVersion).toBeNull();

    // pull the approved article back for editing (authority removed) —
    // markNeedsUpdate requires a note
    await expect(gov.markNeedsUpdate(draft.id, "u-tzachi", " ")).rejects.toThrow(/נימוק/);
    const pulled = await gov.markNeedsUpdate(draft.id, "u-tzachi", "לעדכן תוכן");
    expect(pulled.approval.state).toBe("דורש עדכון");
    expect(isAuthoritative(pulled, clock())).toBe(false);

    // edit (version bumps to 2 because v1 is snapshotted)
    const edited = await gov.updateDraft(
      draft.id,
      makeDraftInput({ content: "תוכן מעודכן לגמרי" }),
      "u-tzachi",
    );
    expect(edited.version).toBe(2);

    await gov.submitForReview(draft.id, "u-tzachi");
    await gov.approve(draft.id, "u-tzachi");

    // v2 snapshot exists; v1 snapshot untouched
    expect((await stores.versions.get(`${draft.id}-v2`))?.snapshot.content).toBe(
      "תוכן מעודכן לגמרי",
    );
    expect((await stores.versions.get(`${draft.id}-v1`))?.snapshot.content).toBe(
      makeDraftInput().content,
    );

    // the OLD usage record: original fields intact, superseded markers set
    const after = await stores.usage.get(usage.id);
    expect(after?.articleVersion).toBe(1);
    expect(after?.inRecommendation).toBe("rec-test-1");
    expect(after?.supersededByVersion).toBe(2);
    expect(after?.supersededAt).not.toBeNull();
  });
});
