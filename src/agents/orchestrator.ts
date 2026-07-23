// TERAGON AI BUSINESS OS — bounded agent orchestrator (Wave 5, W5-C).
// Lifecycle: request → authorization → classify → select context → plan →
// select specialists (≤4) → bounded execution → verify evidence → detect
// conflicts → synthesize → human approval gate → (approved) execute → verify →
// audit. EVERY loop has a hard bound (limits.ts); exceeding one throws a
// structured AgentGovernanceError and cancels the run — no open loops, no
// silent degradation. Agents can never modify definitions at runtime
// (AGENT_DEFINITIONS is deeply frozen).
import {
  AIError,
  type AIProvider,
  type AIRelatedEntity,
  type AIRequest,
  type AIRequestParams,
} from "@/ai/contracts/AIProvider";
import type { ProviderRegistry } from "@/ai/providers/registry";
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import type { AgentConflict, AgentHandoff, AgentMessage, AgentTask, Approval, Evidence } from "@/domain/types";
import type {
  AgentOperation,
  AgentRun,
  ApprovalRequiredAction,
  ExecutionPayload,
  RunLimitConfig,
} from "@/domain/agents";
import type { CollectionKey } from "@/repositories/collections";
import type { AgentStores } from "@/repositories/agentStores";
import { AGENT_HARD_LIMITS, DEFAULT_RUN_LIMITS } from "./limits";
import { AgentGovernanceError } from "./errors";
import { canAgent, getAgentDefinition } from "./definitions";
import { appendEvent, writeAudit, type Clock } from "./runlog";
import { detectConflicts, type SpecialistOutput } from "./conflicts";
import { ApprovalEngine } from "./approvalEngine";

// ---------------------------------------------------------------------------
// request / result types (the W5-D driving surface)
// ---------------------------------------------------------------------------

export interface PlannedStep {
  agentId: string;
  /** provider operation key, e.g. "recommend.printer-match" */
  operation: string;
  /** primary domain for the deny-by-default permission check */
  domain: CollectionKey;
  titleHe: string;
  relatedEntities?: AIRelatedEntity[];
  params?: AIRequestParams;
}

export interface RunApprovalSpec {
  action: ApprovalRequiredAction;
  executionPayload: ExecutionPayload | null;
  previewHe: string;
}

export interface StartRunRequest {
  goal: string;
  requestedById: string;
  /** deterministic run id (demo / tests); default: run-<n> */
  runId?: string;
  /** explicit plan; absent ⇒ a safe default plan is derived */
  plan?: PlannedStep[];
  limits?: Partial<RunLimitConfig>;
  /** approval spec used when the run needs the human gate */
  approval?: RunApprovalSpec;
  demo?: boolean;
}

export interface RunResult {
  run: AgentRun;
  outputs: SpecialistOutput[];
  conflicts: AgentConflict[];
  approval: Approval | null;
  summaryHe: string;
}

export interface OrchestratorDeps {
  stores: AgentStores;
  registry: ProviderRegistry;
  approvalEngine?: ApprovalEngine;
  clock?: Clock;
  organizationId?: string;
  sessionId?: string;
}

const ORCHESTRATOR_ID = "ag-orchestrator";

// deterministic goal classification (keyword rules — not a model)
const CLASSIFICATION_RULES: readonly { pattern: RegExp; classification: string; domains: CollectionKey[] }[] = [
  { pattern: /מדפסת|דגם|חומרים|הדפסה/, classification: "רכישת מדפסת", domains: ["printerModels", "leads", "serviceTickets"] },
  { pattern: /קורס|תלמיד|הדרכה/, classification: "למידה והדרכה", domains: ["courses", "enrollments"] },
  { pattern: /קמפיין|שיווק|צמיחה/, classification: "שיווק וצמיחה", domains: ["leads", "activities"] },
  { pattern: /אוטומצי/, classification: "אוטומציות", domains: ["automations", "automationRuns"] },
  { pattern: /תקלה|שירות|קריאה/, classification: "שירות ותמיכה", domains: ["serviceTickets", "printerModels"] },
];

/** operation prefix → governed operation kind */
function operationKind(operation: string): AgentOperation | null {
  const prefix = operation.split(".")[0];
  switch (prefix) {
    case "summarize":
    case "classify":
    case "recommend":
    case "explain":
      return prefix;
    default:
      return null;
  }
}

export class AgentOrchestrator {
  private readonly stores: AgentStores;
  private readonly registry: ProviderRegistry;
  private readonly clock: Clock;
  private readonly organizationId: string;
  private readonly sessionId: string;
  readonly approvals: ApprovalEngine;

  constructor(deps: OrchestratorDeps) {
    this.stores = deps.stores;
    this.registry = deps.registry;
    this.clock = deps.clock ?? (() => new Date().toISOString());
    this.organizationId = deps.organizationId ?? "org-teragon";
    this.sessionId = deps.sessionId ?? "agent-engine";
    this.approvals =
      deps.approvalEngine ?? new ApprovalEngine({ stores: deps.stores, clock: this.clock });
  }

  // -------------------------------------------------------------------------
  // the run lifecycle
  // -------------------------------------------------------------------------

  async startRun(request: StartRunRequest): Promise<RunResult> {
    const runId = request.runId ?? (await this.nextRunId());
    const limits: RunLimitConfig = { ...DEFAULT_RUN_LIMITS, ...request.limits };
    const startedAt = this.clock();
    const run: AgentRun = {
      id: runId,
      createdAt: startedAt,
      updatedAt: startedAt,
      goal: request.goal,
      requestedById: request.requestedById,
      classification: null,
      status: "רץ",
      specialistAgentIds: [],
      taskIds: [],
      conflictIds: [],
      approvalIds: [],
      counters: { modelCalls: 0, transientRetries: 0, revisionCycles: 0, handoffs: 0 },
      limits,
      usageSpentILS: 0,
      startedAt,
      endedAt: null,
      correlationId: runId,
      demo: request.demo ?? false,
    };
    await this.stores.runs.create(run);
    await appendEvent(this.stores, runId, this.clock, request.requestedById, {
      type: "AgentRunCreated",
      goal: request.goal,
      requestedById: request.requestedById,
    });
    await writeAudit(this.stores, runId, this.clock, {
      actor: request.requestedById,
      action: "run.create",
      entityRef: `agent-run:${runId}`,
      detailsHe: `נוצרה ריצת סוכנים: ${request.goal}`,
    });

    try {
      return await this.executeLifecycle(run, request);
    } catch (err) {
      await this.cancelOnError(runId, err);
      throw err;
    }
  }

  private async executeLifecycle(run: AgentRun, request: StartRunRequest): Promise<RunResult> {
    const runId = run.id;
    const startedMs = Date.parse(run.startedAt);

    const checkTime = () => {
      const elapsed = Date.parse(this.clock()) - startedMs;
      if (elapsed > run.limits.maxRunDurationMs) {
        throw new AgentGovernanceError("AGENT_TIMEOUT", {
          detail: `הריצה חרגה מ-${run.limits.maxRunDurationMs}ms`,
          limit: { name: "maxRunDurationMs", max: run.limits.maxRunDurationMs, attempted: elapsed },
          runId,
        });
      }
    };

    // --- authorization: the orchestrator itself must hold plan/dispatch/synthesize ---
    const orchestrator = getAgentDefinition(ORCHESTRATOR_ID);
    if (
      !orchestrator ||
      !canAgent(ORCHESTRATOR_ID, "plan", "agentRuns") ||
      !canAgent(ORCHESTRATOR_ID, "dispatch", "agentTasks") ||
      !canAgent(ORCHESTRATOR_ID, "synthesize", "agentRuns")
    ) {
      throw new AgentGovernanceError("AGENT_PERMISSION_DENIED", {
        detail: "מנהל התזמור אינו מורשה לתכנן/לנתב/לסנתז",
        runId,
        agentId: ORCHESTRATOR_ID,
      });
    }
    await appendEvent(this.stores, runId, this.clock, ORCHESTRATOR_ID, {
      type: "AgentRunAuthorized",
      agentId: ORCHESTRATOR_ID,
      operations: [...orchestrator.allowedOperations],
    });

    // --- classify ---
    const rule = CLASSIFICATION_RULES.find((r) => r.pattern.test(request.goal));
    const classification = rule?.classification ?? "בירור כללי";
    const matchedDomains = rule?.domains ?? ["leads"];
    await this.stores.runs.update(runId, { classification, updatedAt: this.clock() });
    await appendEvent(this.stores, runId, this.clock, ORCHESTRATOR_ID, {
      type: "TaskClassified",
      classification,
      matchedDomains: [...matchedDomains],
    });

    // --- plan (explicit or safe default) ---
    const plan: PlannedStep[] = request.plan ?? [
      {
        agentId: "ag-nexa",
        operation: "summarize.weekly-leads",
        domain: "leads",
        titleHe: "סיכום לידים שבועי",
      },
    ];

    // --- select context (record counts per planned domain — data minimization) ---
    checkTime();
    const contextCollections = [...new Set([...matchedDomains, ...plan.map((s) => s.domain)])];
    const recordCounts: Record<string, number> = {};
    for (const key of contextCollections) {
      recordCounts[key] = (await this.stores.collection(key).list()).length;
    }
    await appendEvent(this.stores, runId, this.clock, ORCHESTRATOR_ID, {
      type: "ContextSelected",
      collections: contextCollections,
      recordCounts,
    });

    // --- bound: specialists ≤ 4, permissions checked at plan time ---
    const specialistIds = [...new Set(plan.map((s) => s.agentId))];
    if (specialistIds.length > AGENT_HARD_LIMITS.maxSpecialists) {
      throw new AgentGovernanceError("AGENT_LIMIT_EXCEEDED", {
        detail: `התוכנית דורשת ${specialistIds.length} מומחים — המקסימום הוא ${AGENT_HARD_LIMITS.maxSpecialists}`,
        limit: {
          name: "maxSpecialists",
          max: AGENT_HARD_LIMITS.maxSpecialists,
          attempted: specialistIds.length,
        },
        runId,
      });
    }
    for (const step of plan) {
      const kind = operationKind(step.operation);
      if (!kind || !canAgent(step.agentId, kind, step.domain)) {
        throw new AgentGovernanceError("AGENT_PERMISSION_DENIED", {
          detail: `לסוכן ${step.agentId} אין הרשאת "${step.operation}" בתחום "${step.domain}"`,
          runId,
          agentId: step.agentId,
        });
      }
    }
    await appendEvent(this.stores, runId, this.clock, ORCHESTRATOR_ID, {
      type: "PlanCreated",
      steps: plan.map((s) => ({
        agentId: s.agentId,
        operation: s.operation,
        domain: s.domain,
        titleHe: s.titleHe,
      })),
    });
    await appendEvent(this.stores, runId, this.clock, ORCHESTRATOR_ID, {
      type: "SpecialistsSelected",
      agentIds: specialistIds,
    });
    await this.stores.runs.update(runId, {
      specialistAgentIds: specialistIds,
      updatedAt: this.clock(),
    });

    // --- provider selection (Mode A: local rules engine via the registry) ---
    const selection = await this.registry.select();
    if (!selection.provider) {
      throw new AgentGovernanceError("AGENT_INTERNAL_ERROR", {
        detail: `אין ספק AI זמין: ${selection.unavailable?.messageHe ?? "לא ידוע"}`,
        runId,
      });
    }
    const provider = selection.provider;

    // --- bounded execution of each specialist task ---
    const outputs: SpecialistOutput[] = [];
    const taskIds: string[] = [];
    let messageSeq = 0;
    for (let i = 0; i < plan.length; i += 1) {
      checkTime();
      const step = plan[i] as PlannedStep;
      const taskId = `${runId}-task-${i + 1}`;
      taskIds.push(taskId);
      const ts = this.clock();
      const task: AgentTask = {
        id: taskId,
        createdAt: ts,
        updatedAt: ts,
        agentId: step.agentId,
        title: step.titleHe,
        description: `${request.goal} — ${step.operation}`,
        status: "רץ",
        evidenceIds: [],
        approvalId: null,
      };
      await this.stores.tasks.create(task);
      await this.stores.runs.update(runId, { taskIds: [...taskIds], updatedAt: ts });

      // dispatch = a governed handoff from the orchestrator (depth 1)
      messageSeq += 1;
      await this.createMessage(runId, messageSeq, taskId, ORCHESTRATOR_ID, step.agentId,
        `נותב אליך: ${step.titleHe} (${step.operation})`);
      const handoff = await this.createHandoff(runId, taskId, ORCHESTRATOR_ID, step.agentId,
        `ניתוב מתוכנן — בתחום ההרשאה של ${step.agentId}`, request.goal);
      await appendEvent(this.stores, runId, this.clock, ORCHESTRATOR_ID, {
        type: "HandoffOccurred",
        handoffId: handoff.id,
        taskId,
        fromAgentId: ORCHESTRATOR_ID,
        toAgentId: step.agentId,
        depth: 1,
        reasonHe: handoff.reason,
      });
      await this.bumpCounter(runId, "handoffs");

      await appendEvent(this.stores, runId, this.clock, step.agentId, {
        type: "SpecialistTaskStarted",
        taskId,
        agentId: step.agentId,
        operation: step.operation,
      });

      // provider call with bounded retries + bounded revision cycles
      let envelope: AIResponseEnvelopeV2;
      try {
        envelope = await this.callWithBounds(runId, provider, step, checkTime);
      } catch (err) {
        const code = err instanceof AgentGovernanceError ? err.code
          : err instanceof AIError ? err.code : "AGENT_INTERNAL_ERROR";
        const detailHe = err instanceof AIError ? err.userMessageHe
          : err instanceof AgentGovernanceError ? err.userMessageHe : "שגיאה לא מזוהה";
        await this.stores.tasks.update(taskId, { status: "נכשל", updatedAt: this.clock() });
        await appendEvent(this.stores, runId, this.clock, step.agentId, {
          type: "SpecialistTaskFailed",
          taskId,
          agentId: step.agentId,
          errorCode: code,
          detailHe,
        });
        throw err;
      }

      // budget accounting — measured spend only (absent ≠ zero)
      if (envelope.usage.measured && envelope.usage.estimatedCost !== undefined) {
        const current = await this.stores.runs.get(runId);
        const spent = (current?.usageSpentILS ?? 0) + envelope.usage.estimatedCost;
        await this.stores.runs.update(runId, { usageSpentILS: spent, updatedAt: this.clock() });
        if (spent > run.limits.maxUsageBudgetILS) {
          throw new AgentGovernanceError("AGENT_BUDGET_EXCEEDED", {
            detail: `הוצאה נמדדת ${spent} ₪ מעל תקציב ${run.limits.maxUsageBudgetILS} ₪`,
            limit: { name: "maxUsageBudgetILS", max: run.limits.maxUsageBudgetILS, attempted: spent },
            runId,
          });
        }
      }

      // persist evidence records cited by the envelope
      const evidenceIds: string[] = [];
      for (let e = 0; e < envelope.evidence.length; e += 1) {
        const item = envelope.evidence[e];
        if (!item) continue;
        const evTs = this.clock();
        const evidence: Evidence = {
          id: `${taskId}-evd-${e + 1}`,
          createdAt: evTs,
          updatedAt: evTs,
          subjectRef: `agent-task:${taskId}`,
          sourceType: item.sourceType,
          sourceRef: item.sourceId,
          claim: item.relevantExcerpt,
          capturedAt: item.lastUpdated,
        };
        await this.stores.evidence.create(evidence);
        evidenceIds.push(evidence.id);
      }
      await this.stores.tasks.update(taskId, {
        status: "הושלם",
        evidenceIds,
        updatedAt: this.clock(),
      });
      await appendEvent(this.stores, runId, this.clock, step.agentId, {
        type: "SpecialistTaskCompleted",
        taskId,
        agentId: step.agentId,
        envelope,
      });
      messageSeq += 1;
      await this.createMessage(runId, messageSeq, taskId, step.agentId, ORCHESTRATOR_ID,
        `הושלם: ${envelope.recommendation.slice(0, 120)}`);

      // evidence verification — unverified citations never reach synthesis
      const missing = envelope.evidence.filter((e) => !e.verified).map((e) => e.sourceId);
      await appendEvent(this.stores, runId, this.clock, ORCHESTRATOR_ID, {
        type: "EvidenceVerified",
        taskId,
        verifiedCount: envelope.evidence.length - missing.length,
        missing,
      });
      if (missing.length > 0) {
        throw new AgentGovernanceError("AGENT_LIMIT_EXCEEDED", {
          detail: `ראיות לא מאומתות נותרו לאחר ${AGENT_HARD_LIMITS.maxRevisionCycles} סבבי תיקון`,
          limit: {
            name: "maxRevisionCycles",
            max: AGENT_HARD_LIMITS.maxRevisionCycles,
            attempted: AGENT_HARD_LIMITS.maxRevisionCycles + 1,
          },
          runId,
          agentId: step.agentId,
        });
      }

      outputs.push({ taskId, agentId: step.agentId, envelope });
    }

    // --- conflict detection (deterministic; never silently resolved) ---
    checkTime();
    const serviceTickets = await this.stores.serviceTickets.list();
    const detected = detectConflicts(outputs, { serviceTickets });
    const conflicts: AgentConflict[] = [];
    for (let c = 0; c < detected.length; c += 1) {
      const d = detected[c];
      if (!d) continue;
      const ts = this.clock();
      const conflict: AgentConflict = {
        id: `${runId}-conf-${c + 1}`,
        createdAt: ts,
        updatedAt: ts,
        taskId: d.taskId,
        agentIds: [...d.detail.participants],
        description: d.descriptionHe,
        resolution: null,
        resolvedById: null,
        resolvedAt: null,
      };
      await this.stores.conflicts.create(conflict);
      conflicts.push(conflict);
      await appendEvent(this.stores, runId, this.clock, ORCHESTRATOR_ID, {
        type: "ConflictDetected",
        conflictId: conflict.id,
        participants: [...d.detail.participants],
        descriptionHe: d.descriptionHe,
        detail: d.detail,
      });
      await writeAudit(this.stores, runId, this.clock, {
        actor: ORCHESTRATOR_ID,
        action: "conflict.detect",
        entityRef: `agent-conflict:${conflict.id}`,
        detailsHe: d.descriptionHe,
      });
    }
    if (conflicts.length > 0) {
      await this.stores.runs.update(runId, {
        conflictIds: conflicts.map((c) => c.id),
        updatedAt: this.clock(),
      });
    }

    // --- synthesis ---
    checkTime();
    if (!canAgent(ORCHESTRATOR_ID, "synthesize", "agentRuns")) {
      throw new AgentGovernanceError("AGENT_PERMISSION_DENIED", {
        detail: "סינתזה ללא הרשאה",
        runId,
        agentId: ORCHESTRATOR_ID,
      });
    }
    const summaryHe = [
      `יעד: ${request.goal}.`,
      ...outputs.map((o) => `${o.agentId}: ${o.envelope.recommendation}`),
      conflicts.length > 0
        ? `זוהו ${conflicts.length} קונפליקטים — נדרשת הכרעה אנושית.`
        : "לא זוהו קונפליקטים.",
    ].join(" ");
    await appendEvent(this.stores, runId, this.clock, ORCHESTRATOR_ID, {
      type: "SynthesisCompleted",
      summaryHe,
      envelopeIds: outputs.map((o) => o.envelope.id),
    });

    // --- human approval gate (conflict ⇒ gate, always) ---
    const needsApproval =
      conflicts.length > 0 || outputs.some((o) => o.envelope.approval.required);
    let approval: Approval | null = null;
    if (needsApproval) {
      const spec: RunApprovalSpec = request.approval ?? {
        action: "customer-message",
        executionPayload: null,
        previewHe: summaryHe.slice(0, 200),
      };
      approval = await this.approvals.requestApproval({
        runId,
        subjectRef: `agent-run:${runId}`,
        action: spec.action,
        requestedById: ORCHESTRATOR_ID,
        executionPayload: spec.executionPayload,
        previewHe: spec.previewHe,
      });
      await this.stores.runs.update(runId, { status: "ממתין לאישור", updatedAt: this.clock() });
    } else {
      const ts = this.clock();
      await this.stores.runs.update(runId, { status: "הושלם", endedAt: ts, updatedAt: ts });
      await appendEvent(this.stores, runId, this.clock, "system", {
        type: "AgentRunCompleted",
        status: "הושלם",
        envelopeIds: outputs.map((o) => o.envelope.id),
      });
      await writeAudit(this.stores, runId, this.clock, {
        actor: "system",
        action: "run.complete",
        entityRef: `agent-run:${runId}`,
        detailsHe: "הריצה הושלמה ללא צורך באישור",
      });
    }

    const finalRun = (await this.stores.runs.get(runId)) as AgentRun;
    return { run: finalRun, outputs, conflicts, approval, summaryHe };
  }

  // -------------------------------------------------------------------------
  // handoffs between specialists — depth-capped + loop-proof
  // -------------------------------------------------------------------------

  async requestHandoff(
    runId: string,
    taskId: string,
    fromAgentId: string,
    toAgentId: string,
    reasonHe: string,
    contextSummaryHe: string,
  ): Promise<AgentHandoff> {
    if (!getAgentDefinition(fromAgentId) || !getAgentDefinition(toAgentId)) {
      throw new AgentGovernanceError("AGENT_PERMISSION_DENIED", {
        detail: `העברה בין סוכנים לא מוכרים (${fromAgentId} → ${toAgentId})`,
        runId,
      });
    }
    const existing = (await this.stores.handoffs.list())
      .filter((h) => h.taskId === taskId)
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const depth = existing.length + 1;
    if (depth > AGENT_HARD_LIMITS.maxHandoffDepth) {
      throw new AgentGovernanceError("AGENT_LIMIT_EXCEEDED", {
        detail: `עומק שרשרת ההעברות (${depth}) חורג מהמקסימום`,
        limit: { name: "maxHandoffDepth", max: AGENT_HARD_LIMITS.maxHandoffDepth, attempted: depth },
        runId,
        agentId: fromAgentId,
      });
    }
    const chain = new Set<string>();
    for (const h of existing) {
      chain.add(h.fromAgentId);
      chain.add(h.toAgentId);
    }
    if (chain.has(toAgentId)) {
      throw new AgentGovernanceError("AGENT_LOOP_DETECTED", {
        detail: `הסוכן ${toAgentId} כבר הופיע בשרשרת ההעברות של המשימה — לולאה נחסמה`,
        runId,
        agentId: toAgentId,
      });
    }
    const handoff = await this.createHandoff(runId, taskId, fromAgentId, toAgentId, reasonHe, contextSummaryHe);
    await appendEvent(this.stores, runId, this.clock, fromAgentId, {
      type: "HandoffOccurred",
      handoffId: handoff.id,
      taskId,
      fromAgentId,
      toAgentId,
      depth,
      reasonHe,
    });
    await this.bumpCounter(runId, "handoffs");
    await writeAudit(this.stores, runId, this.clock, {
      actor: fromAgentId,
      action: "handoff",
      entityRef: `agent-handoff:${handoff.id}`,
      detailsHe: `העברה ${fromAgentId} → ${toAgentId}: ${reasonHe}`,
    });
    return handoff;
  }

  // -------------------------------------------------------------------------
  // user cancellation
  // -------------------------------------------------------------------------

  async cancelRun(runId: string, byId: string, reasonHe: string): Promise<AgentRun> {
    const run = await this.stores.runs.get(runId);
    if (!run) {
      throw new AgentGovernanceError("AGENT_RUN_NOT_FOUND", { detail: runId, runId });
    }
    if (run.status === "הושלם" || run.status === "בוטל" || run.status === "נכשל") {
      throw new AgentGovernanceError("AGENT_APPROVAL_STATE_INVALID", {
        detail: `הריצה כבר הסתיימה (${run.status})`,
        runId,
      });
    }
    const ts = this.clock();
    const updated = await this.stores.runs.update(runId, {
      status: "בוטל",
      endedAt: ts,
      updatedAt: ts,
    });
    await appendEvent(this.stores, runId, this.clock, byId, {
      type: "AgentRunCancelled",
      kind: "משתמש",
      reasonHe,
      errorId: null,
    });
    await writeAudit(this.stores, runId, this.clock, {
      actor: byId,
      action: "run.cancel",
      entityRef: `agent-run:${runId}`,
      detailsHe: `הריצה בוטלה: ${reasonHe}`,
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /** provider call with bounded transient retries + bounded revision cycles */
  private async callWithBounds(
    runId: string,
    provider: AIProvider,
    step: PlannedStep,
    checkTime: () => void,
  ): Promise<AIResponseEnvelopeV2> {
    let envelope: AIResponseEnvelopeV2 | null = null;
    // revision loop: bounded by maxRevisionCycles (0 = first attempt)
    for (let revision = 0; revision <= AGENT_HARD_LIMITS.maxRevisionCycles; revision += 1) {
      if (revision > 0) await this.bumpCounter(runId, "revisionCycles");
      // retry loop: bounded by maxTransientRetries
      let lastError: unknown = null;
      envelope = null;
      for (let attempt = 0; attempt <= AGENT_HARD_LIMITS.maxTransientRetries; attempt += 1) {
        checkTime();
        await this.consumeModelCall(runId);
        if (attempt > 0) await this.bumpCounter(runId, "transientRetries");
        try {
          envelope = await this.invokeProvider(provider, step, runId);
          break;
        } catch (err) {
          lastError = err;
          if (err instanceof AIError && err.recoverable) continue;
          throw err;
        }
      }
      if (!envelope) {
        // retries exhausted on a recoverable error — structured stop
        if (lastError instanceof AIError) throw lastError;
        throw new AgentGovernanceError("AGENT_LIMIT_EXCEEDED", {
          detail: "מספר הניסיונות החוזרים מוצה",
          limit: {
            name: "maxTransientRetries",
            max: AGENT_HARD_LIMITS.maxTransientRetries,
            attempted: AGENT_HARD_LIMITS.maxTransientRetries + 1,
          },
          runId,
          agentId: step.agentId,
        });
      }
      const unverified = envelope.evidence.some((e) => !e.verified);
      if (!unverified) return envelope;
      // unverified evidence ⇒ ask for a revision (bounded)
    }
    // revisions exhausted — return the last envelope; the caller's
    // EvidenceVerified step converts remaining unverified citations into a
    // structured stop (no unverified evidence ever reaches synthesis).
    return envelope as AIResponseEnvelopeV2;
  }

  private invokeProvider(
    provider: AIProvider,
    step: PlannedStep,
    runId: string,
  ): Promise<AIResponseEnvelopeV2> {
    const req: AIRequest = {
      operation: step.operation,
      organizationId: this.organizationId,
      userId: step.agentId,
      sessionId: this.sessionId,
      correlationId: runId,
      relatedEntities: step.relatedEntities ?? [],
      boundedContext: {},
      outputSchemaVersion: "v1",
      ...(step.params ? { params: step.params } : {}),
    };
    const kind = operationKind(step.operation);
    switch (kind) {
      case "summarize":
        return provider.summarize(req);
      case "classify":
        return provider.classify(req);
      case "recommend":
        return provider.recommend(req);
      case "explain":
        return provider.explain(req);
      default:
        throw new AgentGovernanceError("AGENT_PERMISSION_DENIED", {
          detail: `פעולה לא ממופה: ${step.operation}`,
          runId,
          agentId: step.agentId,
        });
    }
  }

  /** hard cap on provider calls per run — throws BEFORE the excess call */
  private async consumeModelCall(runId: string): Promise<void> {
    const run = await this.stores.runs.get(runId);
    const calls = (run?.counters.modelCalls ?? 0) + 1;
    if (calls > AGENT_HARD_LIMITS.maxModelCallsPerRun) {
      throw new AgentGovernanceError("AGENT_LIMIT_EXCEEDED", {
        detail: `קריאת מודל מספר ${calls} חורגת מהמקסימום`,
        limit: {
          name: "maxModelCallsPerRun",
          max: AGENT_HARD_LIMITS.maxModelCallsPerRun,
          attempted: calls,
        },
        runId,
      });
    }
    if (run) {
      await this.stores.runs.update(runId, {
        counters: { ...run.counters, modelCalls: calls },
        updatedAt: this.clock(),
      });
    }
  }

  private async bumpCounter(
    runId: string,
    key: "handoffs" | "transientRetries" | "revisionCycles",
  ): Promise<void> {
    const run = await this.stores.runs.get(runId);
    if (!run) return;
    await this.stores.runs.update(runId, {
      counters: { ...run.counters, [key]: run.counters[key] + 1 },
      updatedAt: this.clock(),
    });
  }

  private async createMessage(
    runId: string,
    seq: number,
    taskId: string,
    fromAgentId: string,
    toAgentId: string | null,
    content: string,
  ): Promise<AgentMessage> {
    const ts = this.clock();
    const message: AgentMessage = {
      id: `${runId}-msg-${seq}`,
      createdAt: ts,
      updatedAt: ts,
      taskId,
      fromAgentId,
      toAgentId,
      role: "agent",
      content,
      sentAt: ts,
    };
    return this.stores.messages.create(message);
  }

  private async createHandoff(
    runId: string,
    taskId: string,
    fromAgentId: string,
    toAgentId: string,
    reasonHe: string,
    contextSummaryHe: string,
  ): Promise<AgentHandoff> {
    const existing = (await this.stores.handoffs.list()).filter((h) =>
      h.id.startsWith(`${runId}-ho-`),
    );
    const ts = this.clock();
    const handoff: AgentHandoff = {
      id: `${runId}-ho-${existing.length + 1}`,
      createdAt: ts,
      updatedAt: ts,
      taskId,
      fromAgentId,
      toAgentId,
      reason: reasonHe,
      contextSummary: contextSummaryHe,
      at: ts,
    };
    return this.stores.handoffs.create(handoff);
  }

  private async cancelOnError(runId: string, err: unknown): Promise<void> {
    const run = await this.stores.runs.get(runId);
    if (!run || run.status === "בוטל" || run.status === "נכשל") return;
    const isGovernance = err instanceof AgentGovernanceError;
    const isLimit =
      isGovernance &&
      (err.code === "AGENT_LIMIT_EXCEEDED" ||
        err.code === "AGENT_TIMEOUT" ||
        err.code === "AGENT_BUDGET_EXCEEDED" ||
        err.code === "AGENT_LOOP_DETECTED");
    const detailHe = isGovernance
      ? err.userMessageHe
      : err instanceof AIError
        ? err.userMessageHe
        : "שגיאה לא מזוהה";
    const code = isGovernance ? err.code : err instanceof AIError ? err.code : "UNKNOWN";
    const ts = this.clock();
    const errors = (await this.stores.errors.list()).filter((e) => e.runId === runId);
    const errorRecord = await this.stores.errors.create({
      id: `${runId}-err-${errors.length + 1}`,
      createdAt: ts,
      updatedAt: ts,
      runId,
      agentId: isGovernance ? err.agentId : null,
      code,
      detailHe,
      at: ts,
    });
    await this.stores.runs.update(runId, {
      status: isLimit ? "בוטל" : "נכשל",
      endedAt: ts,
      updatedAt: ts,
    });
    await appendEvent(this.stores, runId, this.clock, "system", {
      type: "AgentRunCancelled",
      kind: isLimit ? "מגבלה" : "שגיאה",
      reasonHe: detailHe,
      errorId: errorRecord.id,
    });
    await writeAudit(this.stores, runId, this.clock, {
      actor: "system",
      action: isLimit ? "run.cancel-limit" : "run.fail",
      entityRef: `agent-run:${runId}`,
      detailsHe: detailHe,
    });
  }

  private async nextRunId(): Promise<string> {
    const runs = await this.stores.runs.list();
    let max = 0;
    const re = /^run-(\d+)$/;
    for (const r of runs) {
      const m = re.exec(r.id);
      if (m?.[1]) {
        const n = Number.parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return `run-${max + 1}`;
  }
}
