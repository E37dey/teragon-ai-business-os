// TERAGON AI BUSINESS OS — governed memory proposal workflow (Wave 6, W6-A).
//
// observation → MemoryProposal → source validation → duplicate check →
// contradiction check → sensitivity check → NAMED human approval via the
// canonical Wave-5 ApprovalEngine (action "permanent-memory-update") →
// approved MemoryRecordV2 → immutable MemoryVersion → AuditEvent.
//
// NO BYPASS PATH: the ONLY code that writes an approved MemoryRecordV2 is the
// engine-invoked external handler below, and ApprovalEngine.execute() throws
// AGENT_EXECUTION_WITHOUT_APPROVAL unless a real approval was decided by a
// named human. The workflow exposes no direct record write.
//
// The 7 reviewer controls (each audited):
//   אשר לזיכרון · ערוך ואשר · בקש מקור נוסף · מזג עם פריט קיים · דחה ·
//   סמן כרגיש · בטל הצעה
import { ApprovalEngine } from "@/agents/approvalEngine";
import { writeAudit, type Clock } from "@/agents/runlog";
import type { AgentStores } from "@/repositories/agentStores";
import { nextId } from "@/repositories/Repository";
import { unavailableConfidence } from "@/domain/ai/envelope";
import type {
  MemoryCheckResult,
  MemoryConflict,
  MemoryLink,
  MemoryProposal,
  MemoryProposalDraft,
  MemoryRecordV2,
  MemorySensitivity,
  MemoryVersion,
} from "@/domain/memory";
import { SENSITIVITY_ORDER } from "@/domain/memory";
import { memoryProposalDraftSchema } from "@/domain/memory";
import type { MemoryStores } from "@/memory/repositories/memoryStores";
import { deepFreeze } from "@/memory/repositories/memoryStores";
import { fromLegacyMemoryRecord, isMemoryRecordV2, DEFAULT_ORG_ID } from "@/memory/adapters/legacyBridge";
import {
  extractClaims,
  extractWikiLinks,
  slugify,
  stripMarkdown,
  suggestedSensitivity,
  titleSimilarity,
} from "./text";
import { diffRecordFields } from "./versioning";

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

/** deterministic duplicate threshold (Jaccard over title tokens) */
export const DUPLICATE_TITLE_THRESHOLD = 0.6;

export const MEMORY_ACTION = "permanent-memory-update" as const;

export class MemoryWorkflowError extends Error {
  readonly code: string;
  constructor(code: string, detailHe: string) {
    super(detailHe);
    this.name = "MemoryWorkflowError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------

export interface SubmitProposalInput {
  observationHe: string;
  proposedById: string;
  proposedByName: string;
  draft: Omit<MemoryProposalDraft, "slug"> & { slug?: string };
  /** restore mode: the record+version this proposal restores (versioning.ts) */
  restore?: { recordId: string; versionId: string };
}

export interface DeciderIdentity {
  deciderId: string;
  deciderName: string;
}

export interface WorkflowDeps {
  stores: MemoryStores;
  agentStores: AgentStores;
  clock?: Clock;
}

type ExecMode = "create" | "merge" | "restore";

// ---------------------------------------------------------------------------
// the workflow
// ---------------------------------------------------------------------------

export class MemoryProposalWorkflow {
  readonly engine: ApprovalEngine;
  private readonly stores: MemoryStores;
  private readonly agentStores: AgentStores;
  private readonly clock: Clock;

  constructor(deps: WorkflowDeps) {
    this.stores = deps.stores;
    this.agentStores = deps.agentStores;
    this.clock = deps.clock ?? (() => new Date().toISOString());
    this.engine = new ApprovalEngine({
      stores: deps.agentStores,
      clock: this.clock,
      externalHandlers: {
        [MEMORY_ACTION]: (payload) => this.executeApproved(payload.data),
      },
    });
  }

  // -------------------------------------------------------------------------
  // bridged reads
  // -------------------------------------------------------------------------

  /** all memory records, legacy Wave-1 shapes bridged to V2 (read-only). */
  async listBridgedRecords(): Promise<MemoryRecordV2[]> {
    const raw = await this.stores.records.list();
    return raw.map((r) => (isMemoryRecordV2(r) ? r : fromLegacyMemoryRecord(r as never)));
  }

  // -------------------------------------------------------------------------
  // submit: observation → proposal with deterministic checks → approval request
  // -------------------------------------------------------------------------

  async submitProposal(input: SubmitProposalInput): Promise<MemoryProposal> {
    const ts = this.clock();
    const draft: MemoryProposalDraft = {
      ...input.draft,
      slug: input.draft.slug ?? slugify(input.draft.title),
    };
    const parsed = memoryProposalDraftSchema.safeParse(draft);
    if (!parsed.success) {
      throw new MemoryWorkflowError(
        "MEMORY_PROPOSAL_INVALID",
        `טיוטת ההצעה אינה תקינה: ${parsed.error.issues.map((i) => i.message).join(" · ")}`,
      );
    }
    const existing = await this.stores.proposals.list();
    const id = nextId("memp", existing.map((p) => p.id));
    const records = await this.listBridgedRecords();

    const sourceValidation = await this.validateSources(draft);
    const duplicateCheck = this.checkDuplicates(draft, records);
    const contradiction = this.checkContradictions(draft, records);
    const sensitivityCheck = this.checkSensitivity(draft);

    const submittable = sourceValidation.outcome !== "נכשל";
    const proposal: MemoryProposal = {
      id,
      createdAt: ts,
      updatedAt: ts,
      organizationId: DEFAULT_ORG_ID,
      observationHe: input.observationHe,
      proposedById: input.proposedById,
      proposedByName: input.proposedByName,
      draft,
      status: submittable ? "ממתין לאישור" : "טיוטה",
      checks: {
        sourceValidation,
        duplicateCheck,
        contradictionCheck: contradiction.check,
        sensitivityCheck,
      },
      approvalId: null,
      runId: id,
      resultRecordId: null,
      decidedById: null,
      decidedByName: null,
      decidedAt: null,
      mergeTargetId: input.restore?.recordId ?? null,
      moreSourcesRequestHe: null,
    };
    await this.stores.proposals.create(proposal);

    // persist contradiction records (open conflicts) — honest, deterministic
    const existingConflicts = await this.stores.conflicts.list();
    let cn = existingConflicts.length;
    for (const conflict of contradiction.conflicts) {
      cn += 1;
      await this.stores.conflicts.create({
        ...conflict,
        id: `mconf-${cn}`,
        proposalId: id,
        claimA: { ...conflict.claimA, holderId: id },
      });
    }

    if (!submittable) {
      await this.audit(id, input.proposedById, "memory.proposal.blocked", `proposal:${id}`,
        `ההצעה נותרה טיוטה — אימות מקורות נכשל: ${sourceValidation.detailHe}`);
      return proposal;
    }

    const mode: ExecMode = input.restore ? "restore" : "create";
    const approval = await this.engine.requestApproval({
      runId: id,
      subjectRef: `memory-proposal:${id}`,
      action: MEMORY_ACTION,
      requestedById: input.proposedById,
      executionPayload: {
        kind: "external",
        action: MEMORY_ACTION,
        descriptionHe:
          mode === "restore"
            ? `שחזור גרסה קודמת של פריט הזיכרון ${input.restore?.recordId ?? ""} כגרסה חדשה`
            : `כתיבת פריט זיכרון קבוע חדש: «${draft.title}» (${draft.memoryLayer})`,
        data: {
          proposalId: id,
          mode,
          ...(input.restore ? { targetId: input.restore.recordId, versionId: input.restore.versionId } : {}),
        },
      },
      previewHe: `«${draft.title}» — ${stripMarkdown(draft.bodyMarkdown).slice(0, 160)}`,
    });
    const updated = await this.stores.proposals.update(id, { approvalId: approval.id, updatedAt: this.clock() });
    await this.audit(id, input.proposedById, "memory.proposal.submit", `proposal:${id}`,
      `הוגשה הצעת זיכרון «${draft.title}» — ממתינה לאישור אנושי בשם`);
    return updated;
  }

  // -------------------------------------------------------------------------
  // the 7 controls
  // -------------------------------------------------------------------------

  /** 1 — אשר לזיכרון */
  async approve(proposalId: string, who: DeciderIdentity, noteHe?: string): Promise<MemoryRecordV2> {
    const proposal = await this.requirePending(proposalId);
    await this.engine.decide({
      runId: proposal.runId,
      approvalId: this.requireApprovalId(proposal),
      kind: "approve",
      decidedById: who.deciderId,
      noteHe,
    });
    await this.recordDecision(proposalId, who);
    await this.engine.execute(proposal.runId, this.requireApprovalId(proposal), who.deciderId);
    return this.requireResultRecord(proposalId);
  }

  /** 2 — ערוך ואשר: the human-edited draft is what gets written */
  async editAndApprove(
    proposalId: string,
    who: DeciderIdentity,
    editedDraft: MemoryProposalDraft,
    noteHe?: string,
  ): Promise<MemoryRecordV2> {
    const proposal = await this.requirePending(proposalId);
    const parsed = memoryProposalDraftSchema.safeParse(editedDraft);
    if (!parsed.success) {
      throw new MemoryWorkflowError(
        "MEMORY_PROPOSAL_INVALID",
        `הטיוטה הערוכה אינה תקינה: ${parsed.error.issues.map((i) => i.message).join(" · ")}`,
      );
    }
    await this.stores.proposals.update(proposalId, { draft: editedDraft, updatedAt: this.clock() });
    await this.engine.decide({
      runId: proposal.runId,
      approvalId: this.requireApprovalId(proposal),
      kind: "edit",
      decidedById: who.deciderId,
      noteHe: noteHe ?? "אושר עם עריכה אנושית",
      editedPayload: {
        kind: "external",
        action: MEMORY_ACTION,
        descriptionHe: `כתיבת פריט זיכרון (לאחר עריכה אנושית): «${editedDraft.title}»`,
        data: { proposalId, mode: "create", edited: "true" },
      },
    });
    await this.recordDecision(proposalId, who);
    await this.engine.execute(proposal.runId, this.requireApprovalId(proposal), who.deciderId);
    return this.requireResultRecord(proposalId);
  }

  /** 3 — בקש מקור נוסף (ההצעה נשארת ממתינה; הבקשה מתועדת) */
  async requestMoreSources(proposalId: string, requesterId: string, requestHe: string): Promise<MemoryProposal> {
    const proposal = await this.requirePending(proposalId);
    const updated = await this.stores.proposals.update(proposalId, {
      moreSourcesRequestHe: requestHe,
      updatedAt: this.clock(),
    });
    await this.audit(proposal.runId, requesterId, "memory.proposal.request-sources",
      `proposal:${proposalId}`, `נדרש מקור נוסף: ${requestHe}`);
    return updated;
  }

  /** 4 — מזג עם פריט קיים: יוצר גרסה חדשה על הפריט הקיים (לא רשומה חדשה) */
  async mergeWithExisting(
    proposalId: string,
    targetRecordId: string,
    who: DeciderIdentity,
    noteHe?: string,
  ): Promise<MemoryRecordV2> {
    const proposal = await this.requirePending(proposalId);
    const target = await this.getBridged(targetRecordId);
    if (!target) {
      throw new MemoryWorkflowError("MEMORY_MERGE_TARGET_MISSING", `פריט היעד למיזוג "${targetRecordId}" לא נמצא`);
    }
    await this.stores.proposals.update(proposalId, { mergeTargetId: targetRecordId, updatedAt: this.clock() });
    await this.engine.decide({
      runId: proposal.runId,
      approvalId: this.requireApprovalId(proposal),
      kind: "edit",
      decidedById: who.deciderId,
      noteHe: noteHe ?? `מיזוג עם הפריט הקיים «${target.title}»`,
      editedPayload: {
        kind: "external",
        action: MEMORY_ACTION,
        descriptionHe: `מיזוג ההצעה אל הפריט הקיים «${target.title}» (גרסה חדשה)`,
        data: { proposalId, mode: "merge", targetId: targetRecordId },
      },
    });
    await this.recordDecision(proposalId, who);
    await this.engine.execute(proposal.runId, this.requireApprovalId(proposal), who.deciderId);
    return this.requireResultRecord(proposalId);
  }

  /** 5 — דחה (נימוק חובה — נאכף גם על ידי המנוע) */
  async reject(proposalId: string, who: DeciderIdentity, reasonHe: string): Promise<MemoryProposal> {
    const proposal = await this.requirePending(proposalId);
    await this.engine.decide({
      runId: proposal.runId,
      approvalId: this.requireApprovalId(proposal),
      kind: "reject",
      decidedById: who.deciderId,
      noteHe: reasonHe,
    });
    const updated = await this.stores.proposals.update(proposalId, {
      status: "נדחה",
      decidedById: who.deciderId,
      decidedByName: who.deciderName,
      decidedAt: this.clock(),
      updatedAt: this.clock(),
    });
    await this.audit(proposal.runId, who.deciderId, "memory.proposal.reject",
      `proposal:${proposalId}`, `ההצעה נדחתה: ${reasonHe}`);
    return updated;
  }

  /** 6 — סמן כרגיש (מעלה רגישות בלבד — לעולם לא מוריד) */
  async markSensitive(
    proposalId: string,
    actorId: string,
    sensitivity: MemorySensitivity,
  ): Promise<MemoryProposal> {
    const proposal = await this.requirePending(proposalId);
    if (SENSITIVITY_ORDER[sensitivity] < SENSITIVITY_ORDER[proposal.draft.sensitivity]) {
      throw new MemoryWorkflowError(
        "MEMORY_SENSITIVITY_DOWNGRADE",
        `לא ניתן להוריד רגישות מ"${proposal.draft.sensitivity}" ל"${sensitivity}" דרך בקרה זו`,
      );
    }
    const updated = await this.stores.proposals.update(proposalId, {
      draft: { ...proposal.draft, sensitivity },
      updatedAt: this.clock(),
    });
    await this.audit(proposal.runId, actorId, "memory.proposal.mark-sensitive",
      `proposal:${proposalId}`, `ההצעה סומנה ברגישות "${sensitivity}"`);
    return updated;
  }

  /** 7 — בטל הצעה */
  async cancelProposal(proposalId: string, actorId: string): Promise<MemoryProposal> {
    const proposal = await this.stores.proposals.get(proposalId);
    if (!proposal) {
      throw new MemoryWorkflowError("MEMORY_PROPOSAL_NOT_FOUND", `הצעה "${proposalId}" לא נמצאה`);
    }
    if (proposal.status === "ממתין לאישור" && proposal.approvalId) {
      await this.engine.cancel(proposal.runId, proposal.approvalId, actorId);
    } else if (proposal.status !== "טיוטה") {
      throw new MemoryWorkflowError(
        "MEMORY_PROPOSAL_STATE_INVALID",
        `לא ניתן לבטל הצעה במצב "${proposal.status}"`,
      );
    }
    const updated = await this.stores.proposals.update(proposalId, {
      status: "בוטל",
      decidedById: actorId,
      decidedAt: this.clock(),
      updatedAt: this.clock(),
    });
    await this.audit(proposal.runId, actorId, "memory.proposal.cancel",
      `proposal:${proposalId}`, "ההצעה בוטלה");
    return updated;
  }

  // -------------------------------------------------------------------------
  // deterministic checks
  // -------------------------------------------------------------------------

  private async validateSources(draft: MemoryProposalDraft): Promise<MemoryCheckResult> {
    if (draft.sourceIds.length === 0) {
      return { outcome: "נכשל", detailHe: "אין מקורות — זיכרון קבוע מחייב לפחות מקור אחד", relatedIds: [] };
    }
    const missing: string[] = [];
    const unverified: string[] = [];
    for (const sid of draft.sourceIds) {
      const source = await this.stores.sources.get(sid);
      if (!source) missing.push(sid);
      else if (!source.verified) unverified.push(sid);
    }
    if (missing.length > 0) {
      return { outcome: "נכשל", detailHe: `מקורות חסרים במאגר: ${missing.join(", ")}`, relatedIds: missing };
    }
    if (unverified.length > 0) {
      return {
        outcome: "אזהרה",
        detailHe: `מקורות שטרם אומתו מול הרשומה המקורית: ${unverified.join(", ")}`,
        relatedIds: unverified,
      };
    }
    return { outcome: "עבר", detailHe: `${draft.sourceIds.length} מקורות קיימים ומאומתים`, relatedIds: [] };
  }

  private checkDuplicates(draft: MemoryProposalDraft, records: readonly MemoryRecordV2[]): MemoryCheckResult {
    const active = records.filter((r) => r.archivedAt === null);
    const slugHit = active.filter((r) => r.slug === draft.slug);
    const similar = active.filter(
      (r) => r.slug !== draft.slug && titleSimilarity(r.title, draft.title) >= DUPLICATE_TITLE_THRESHOLD,
    );
    if (slugHit.length > 0) {
      return {
        outcome: "אזהרה",
        detailHe: `slug זהה לפריט קיים (${slugHit.map((r) => r.id).join(", ")}) — שקלו מיזוג`,
        relatedIds: slugHit.map((r) => r.id),
      };
    }
    if (similar.length > 0) {
      return {
        outcome: "אזהרה",
        detailHe: `כותרת דומה (דמיון ≥ ${DUPLICATE_TITLE_THRESHOLD}) לפריטים: ${similar.map((r) => r.id).join(", ")}`,
        relatedIds: similar.map((r) => r.id),
      };
    }
    return { outcome: "עבר", detailHe: "לא נמצא כפל", relatedIds: [] };
  }

  private checkContradictions(
    draft: MemoryProposalDraft,
    records: readonly MemoryRecordV2[],
  ): { check: MemoryCheckResult; conflicts: MemoryConflict[] } {
    const draftClaims = extractClaims(stripMarkdown(draft.bodyMarkdown));
    const conflicts: MemoryConflict[] = [];
    const ts = this.clock();
    let n = 0;
    for (const record of records) {
      if (record.approvalState !== "מאושר" || record.archivedAt !== null) continue;
      if (record.memoryLayer !== draft.memoryLayer) continue;
      const recordClaims = extractClaims(record.plainText);
      for (const dc of draftClaims) {
        for (const rc of recordClaims) {
          if (dc.key === rc.key && dc.value !== rc.value) {
            n += 1;
            conflicts.push({
              id: `mconf-pending-${n}`,
              createdAt: ts,
              updatedAt: ts,
              proposalId: "", // filled by submitProposal
              recordId: record.id,
              claimA: { holderId: "proposal", holderKind: "proposal", claimKey: dc.key, claimValue: dc.value },
              claimB: { holderId: record.id, holderKind: "record", claimKey: rc.key, claimValue: rc.value },
              status: "פתוח",
              resolutionHe: null,
              detectedAt: ts,
            });
          }
        }
      }
    }
    // deterministic ids once the proposal id is known — re-key in submitProposal
    const check: MemoryCheckResult =
      conflicts.length === 0
        ? { outcome: "עבר", detailHe: "לא נמצאה סתירה מול פריטים מאושרים", relatedIds: [] }
        : {
            outcome: "אזהרה",
            detailHe: `נמצאו ${conflicts.length} סתירות מול פריטים מאושרים — נפתחו רשומות קונפליקט`,
            relatedIds: [...new Set(conflicts.map((c) => c.recordId))],
          };
    return { check, conflicts };
  }

  private checkSensitivity(draft: MemoryProposalDraft): MemoryCheckResult {
    const suggested = suggestedSensitivity(`${draft.title}\n${draft.bodyMarkdown}`);
    if (suggested && SENSITIVITY_ORDER[suggested] > SENSITIVITY_ORDER[draft.sensitivity]) {
      return {
        outcome: "אזהרה",
        detailHe: `התוכן מרמז על רגישות "${suggested}" אך ההצעה מסומנת "${draft.sensitivity}" — שקלו "סמן כרגיש"`,
        relatedIds: [],
      };
    }
    return { outcome: "עבר", detailHe: `רגישות מוצהרת: "${draft.sensitivity}"`, relatedIds: [] };
  }

  // -------------------------------------------------------------------------
  // engine-invoked execution (the ONLY writer of approved memory)
  // -------------------------------------------------------------------------

  private async executeApproved(
    data: Record<string, string | number | boolean | null | string[]>,
  ): Promise<{ resultRef: string | null; detailHe: string }> {
    const proposalId = typeof data.proposalId === "string" ? data.proposalId : "";
    const mode = (typeof data.mode === "string" ? data.mode : "create") as ExecMode;
    const proposal = await this.stores.proposals.get(proposalId);
    if (!proposal) {
      throw new MemoryWorkflowError("MEMORY_PROPOSAL_NOT_FOUND", `הצעה "${proposalId}" לא נמצאה בביצוע`);
    }
    const ts = this.clock();
    const approver = {
      id: proposal.decidedById ?? "לא ידוע",
      name: proposal.decidedByName ?? "לא ידוע",
    };

    if (mode === "merge" || mode === "restore") {
      const targetId =
        typeof data.targetId === "string" && data.targetId ? data.targetId : proposal.mergeTargetId;
      if (!targetId) {
        throw new MemoryWorkflowError("MEMORY_MERGE_TARGET_MISSING", "חסר פריט יעד לביצוע מיזוג/שחזור");
      }
      const record = await this.applyVersionedChange(proposal, targetId, mode, approver, ts);
      await this.stores.proposals.update(proposalId, {
        status: mode === "merge" ? "מוזג" : "מאושר",
        resultRecordId: record.id,
        updatedAt: this.clock(),
      });
      return {
        resultRef: `memoryRecords:${record.id}`,
        detailHe:
          mode === "merge"
            ? `ההצעה מוזגה אל «${record.title}» — נוצרה גרסה ${record.version}`
            : `שוחזרה גרסה קודמת של «${record.title}» כגרסה חדשה ${record.version}`,
      };
    }

    // create — new approved record + immutable version 1
    const rawIds = (await this.stores.records.list()).map((r) => r.id);
    const recordId = nextId("memr", rawIds);
    const draft = proposal.draft;
    const bodyMarkdown = draft.bodyMarkdown;
    const record: MemoryRecordV2 = {
      id: recordId,
      createdAt: ts,
      updatedAt: ts,
      organizationId: proposal.organizationId,
      title: draft.title,
      slug: draft.slug,
      bodyMarkdown,
      plainText: stripMarkdown(bodyMarkdown),
      memoryLayer: draft.memoryLayer,
      folder: draft.folder,
      entityLinks: draft.entityLinks,
      tags: draft.tags,
      wikiLinks: extractWikiLinks(bodyMarkdown),
      backlinks: [],
      sourceIds: draft.sourceIds,
      ownerId: proposal.proposedById,
      ownerName: proposal.proposedByName,
      sensitivity: draft.sensitivity,
      verificationState: "לא נבדק",
      approvalState: "מאושר",
      confidence: unavailableConfidence("לא נמדד — נוצר מהצעה שאושרה על ידי אדם בשם"),
      approvedAt: ts,
      approvedBy: approver.name,
      version: 1,
      supersedesId: null,
      retentionPolicy: draft.retentionPolicy,
      reviewDate: draft.reviewDate,
      archivedAt: null,
      origin: "proposal",
    };
    await this.stores.records.create(record);
    await this.createVersion(record, null, [], approver, `אושר מהצעה ${proposal.id}`);
    await this.resolveLinksFor(record);
    await this.stores.proposals.update(proposalId, {
      status: "מאושר",
      resultRecordId: recordId,
      updatedAt: this.clock(),
    });
    return {
      resultRef: `memoryRecords:${recordId}`,
      detailHe: `נכתב פריט זיכרון קבוע «${record.title}» (גרסה 1) — מאושר על ידי ${approver.name}`,
    };
  }

  /** merge/restore ⇒ NEW immutable version on an existing record. */
  private async applyVersionedChange(
    proposal: MemoryProposal,
    targetId: string,
    mode: Extract<ExecMode, "merge" | "restore">,
    approver: { id: string; name: string },
    ts: string,
  ): Promise<MemoryRecordV2> {
    const before = await this.getBridged(targetId);
    if (!before) {
      throw new MemoryWorkflowError("MEMORY_MERGE_TARGET_MISSING", `פריט היעד "${targetId}" לא נמצא`);
    }
    // legacy targets get their pre-change state captured as version 1 first
    const versions = (await this.stores.versions.list()).filter((v) => v.recordId === targetId);
    let previous = versions.sort((a, b) => a.versionNumber - b.versionNumber)[versions.length - 1] ?? null;
    if (!previous) {
      previous = await this.createVersion(
        { ...before, version: 1 },
        null,
        [],
        { id: "system", name: "system" },
        "תיעוד מצב קיים לפני שינוי מנוהל ראשון",
        null,
      );
    }
    const draft = proposal.draft;
    const bodyMarkdown =
      mode === "merge"
        ? `${before.bodyMarkdown}\n\n---\n\n## מיזוג מהצעה ${proposal.id}\n\n${draft.bodyMarkdown}`
        : draft.bodyMarkdown;
    const after: MemoryRecordV2 = {
      ...before,
      bodyMarkdown,
      plainText: stripMarkdown(bodyMarkdown),
      wikiLinks: extractWikiLinks(bodyMarkdown),
      tags: [...new Set([...before.tags, ...draft.tags])],
      entityLinks:
        mode === "merge"
          ? [
              ...before.entityLinks,
              ...draft.entityLinks.filter(
                (l) => !before.entityLinks.some((b) => b.collection === l.collection && b.entityId === l.entityId),
              ),
            ]
          : draft.entityLinks,
      sourceIds: [...new Set([...before.sourceIds, ...draft.sourceIds])],
      sensitivity:
        SENSITIVITY_ORDER[draft.sensitivity] > SENSITIVITY_ORDER[before.sensitivity]
          ? draft.sensitivity
          : before.sensitivity,
      approvalState: "מאושר",
      approvedAt: ts,
      approvedBy: approver.name,
      version: previous.versionNumber + 1,
      updatedAt: ts,
    };
    const changedFields = diffRecordFields(before, after);
    // write through the records store (create when the raw store held legacy shape)
    const existingRaw = await this.stores.records.get(targetId);
    if (existingRaw && isMemoryRecordV2(existingRaw)) {
      const { id: _id, ...patch } = after;
      await this.stores.records.update(targetId, patch);
    } else if (existingRaw) {
      // legacy shape — replace with the bridged+changed V2 record
      await this.stores.records.remove(targetId);
      await this.stores.records.create(after);
    } else {
      await this.stores.records.create(after);
    }
    await this.createVersion(
      after,
      previous.id,
      changedFields,
      approver,
      mode === "merge" ? `מיזוג הצעה ${proposal.id}` : `שחזור גרסה קודמת דרך הצעה ${proposal.id}`,
    );
    await this.resolveLinksFor(after);
    return after;
  }

  private async createVersion(
    record: MemoryRecordV2,
    previousVersionId: string | null,
    changedFields: string[],
    approver: { id: string; name: string },
    reasonHe: string,
    approverOverride?: null,
  ): Promise<MemoryVersion> {
    const ts = this.clock();
    const version: MemoryVersion = deepFreeze({
      id: `${record.id}-v-${record.version}`,
      createdAt: ts,
      updatedAt: ts,
      recordId: record.id,
      versionNumber: record.version,
      previousVersionId,
      snapshot: { ...record },
      changedFields,
      authorId: record.ownerId,
      authorName: record.ownerName,
      approverId: approverOverride === null ? null : approver.id,
      approverName: approverOverride === null ? null : approver.name,
      reasonHe,
      timestamp: ts,
      rollbackEligible: true,
    });
    return this.stores.versions.create(version);
  }

  /** resolve the record's wikiLinks against titles/slugs → MemoryLink rows. */
  private async resolveLinksFor(record: MemoryRecordV2): Promise<void> {
    const all = await this.listBridgedRecords();
    const existingLinks = await this.stores.links.list();
    const ts = this.clock();
    let n = existingLinks.length;
    for (const target of record.wikiLinks) {
      const already = existingLinks.find((l) => l.fromRecordId === record.id && l.targetText === target);
      if (already) continue;
      const matches = all.filter(
        (r) => r.id !== record.id && (r.title === target || r.slug === slugify(target)),
      );
      n += 1;
      const link: MemoryLink = {
        id: `mlink-${n}`,
        createdAt: ts,
        updatedAt: ts,
        fromRecordId: record.id,
        targetText: target,
        resolution: matches.length === 1 ? "resolved" : matches.length > 1 ? "ambiguous" : "unresolved",
        resolvedRecordId: matches.length === 1 ? (matches[0]?.id ?? null) : null,
        candidateIds: matches.length > 1 ? matches.map((m) => m.id) : [],
      };
      await this.stores.links.create(link);
      // cache backlink on a uniquely resolved target
      if (link.resolvedRecordId) {
        const targetRaw = await this.stores.records.get(link.resolvedRecordId);
        if (targetRaw && isMemoryRecordV2(targetRaw) && !targetRaw.backlinks.includes(record.id)) {
          await this.stores.records.update(link.resolvedRecordId, {
            backlinks: [...targetRaw.backlinks, record.id],
            updatedAt: ts,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private async getBridged(id: string): Promise<MemoryRecordV2 | undefined> {
    const raw = await this.stores.records.get(id);
    if (!raw) return undefined;
    return isMemoryRecordV2(raw) ? raw : fromLegacyMemoryRecord(raw as never);
  }

  private async requirePending(proposalId: string): Promise<MemoryProposal> {
    const proposal = await this.stores.proposals.get(proposalId);
    if (!proposal) {
      throw new MemoryWorkflowError("MEMORY_PROPOSAL_NOT_FOUND", `הצעה "${proposalId}" לא נמצאה`);
    }
    if (proposal.status !== "ממתין לאישור") {
      throw new MemoryWorkflowError(
        "MEMORY_PROPOSAL_STATE_INVALID",
        `ההצעה במצב "${proposal.status}" — הבקרה זמינה רק בהמתנה לאישור`,
      );
    }
    return proposal;
  }

  private requireApprovalId(proposal: MemoryProposal): string {
    if (!proposal.approvalId) {
      throw new MemoryWorkflowError(
        "MEMORY_PROPOSAL_STATE_INVALID",
        "להצעה אין רשומת אישור — אין נתיב עוקף למנוע האישורים",
      );
    }
    return proposal.approvalId;
  }

  private async recordDecision(proposalId: string, who: DeciderIdentity): Promise<void> {
    await this.stores.proposals.update(proposalId, {
      decidedById: who.deciderId,
      decidedByName: who.deciderName,
      decidedAt: this.clock(),
      updatedAt: this.clock(),
    });
  }

  private async requireResultRecord(proposalId: string): Promise<MemoryRecordV2> {
    const proposal = await this.stores.proposals.get(proposalId);
    const record = proposal?.resultRecordId ? await this.getBridged(proposal.resultRecordId) : undefined;
    if (!record) {
      throw new MemoryWorkflowError("MEMORY_EXECUTION_INCOMPLETE", "הביצוע לא הותיר רשומת זיכרון — אין הצלחה מזויפת");
    }
    return record;
  }

  private audit(
    runId: string,
    actor: string,
    action: string,
    entityRef: string,
    detailsHe: string,
  ): Promise<unknown> {
    return writeAudit(this.agentStores, runId, this.clock, { actor, action, entityRef, detailsHe });
  }
}
