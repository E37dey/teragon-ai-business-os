// W8-E — Phase 8.12: the 10 MANDATED Wave-8 cross-module flows, exercised at
// the canonical layer (repositories + engines + selectors — the same functions
// the screens render from). Every assertion reads back REAL records.
import { beforeEach, describe, expect, it } from "vitest";
import { getRepository } from "@/repositories";
import { agentStores } from "@/repositories/agentStores";
import { governanceStores } from "@/repositories/governanceStores";
import { roleStores } from "@/repositories/roleStores";
import { userStores } from "@/repositories/userStores";
import type {
  AIRecommendation,
  Approval,
  AuditEvent,
  Lead,
  ServiceTicket,
} from "@/domain/types";
import { ApprovalEngine } from "@/agents/approvalEngine";
import { assertAgentsEnabled } from "@/components/ai";
import { agentQueueSizes } from "@/agents/selectors";
import {
  aggregateValue,
  computeBucket,
  drilldownRecords,
  metricByKey,
  wholeRange,
} from "@/analytics";
import { deriveNotifications } from "@/app/notifications/deriveNotifications";
import { filterAuditEvents, deriveAuditSeverity } from "@/governance/auditExplorer";
import { EMPTY_AUDIT_QUERY } from "@/domain/governance";
import { bootstrapRisks } from "@/governance/riskRegister";
import { openIncident } from "@/governance/incidents";
import { deriveObservations } from "@/learning/loop";
import {
  approveProposal,
  submitProposal,
  LEARNING_RUN_ID,
  type ProposalDraft,
} from "@/learning/loop";
import { applyRule, RULE_APPLY_AUDIT_ACTION } from "@/learning/ruleEngine";
import { learningStores } from "@/learning/stores";
import { ruleEffectSchema } from "@/domain/learning";
import { KnowledgeGovernanceService } from "@/knowledge/governance";
import { knowledgeStores } from "@/knowledge/stores";
import { WikiAgent } from "@/agents/wiki/wikiAgent";
import { isAuthoritative, type KnowledgeUsage } from "@/domain/knowledge";
import { AdministrationService, type EmergencyFlagPort } from "@/administration";
import type { EmergencyFlagKind } from "@/administration";
import {
  runMigrations,
  productionMigrationStores,
  type Migration,
  type MigrationEnv,
} from "@/migrations/framework";
import { checkMigrations, collectMigrationHealth } from "@/system-health/checks";
import { openHealthIncident } from "@/system-health/incidents";
import type { HealthIncident } from "@/domain/system-health";
import {
  approvalSubjectRef,
  evaluateAllDeliverables,
  overallReadiness,
  buildAuditFindings,
} from "@/domain/submission";
import { deriveManagementBand } from "@/integration/wave8/managementBand";
import { makeEnv } from "../system-health/helpers";
import { buildSources as buildSubmissionSources } from "../submission/helpers";
import { base, liveAnalyticsSources, makeClock, NOW_ISO, resetRepos } from "./helpers";

const CEO = { id: "u-tzachi", name: "צחי זוסטייהם" } as const;

function memFlags(): EmergencyFlagPort {
  const map = new Map<EmergencyFlagKind, boolean>();
  return {
    isActive: (kind) => map.get(kind) === true,
    set: (kind, active) => {
      map.set(kind, active);
    },
  };
}

function makeEngine(clock: () => string): ApprovalEngine {
  return new ApprovalEngine({ stores: agentStores(), clock });
}

beforeEach(() => {
  resetRepos();
});

describe("W8-E — the 10 mandated cross-module flows", () => {
  it("1. create lead → activity metric (analytics series) updates → drilldown contains the lead id", async () => {
    const def = metricByKey("leads_new");
    expect(def).toBeDefined();
    if (!def) return;
    const range = wholeRange(NOW_ISO, "30d");

    const before = await liveAnalyticsSources();
    const beforeValue = aggregateValue(def, before, range) ?? 0;

    // inside the range: period ends are EXCLUSIVE, so the record sits 1h back
    const at = new Date(Date.parse(NOW_ISO) - 3_600_000).toISOString();
    await getRepository<Lead>("leads").create({
      ...base("ld-w8e-1", at),
      name: "ליד אינטגרציה גל 8",
      phone: "050-8887766",
      email: "w8e@teragon.co.il",
      interest: "רכישת מדפסת",
      status: "חדש",
      source: "אתר",
      ownerId: CEO.id,
      history: [],
    } as unknown as Lead);

    const after = await liveAnalyticsSources();
    expect(aggregateValue(def, after, range)).toBe(beforeValue + 1);

    const drill = drilldownRecords(def, after, range);
    expect(drill.some((r) => r.collection === "leads" && r.id === "ld-w8e-1")).toBe(true);
    // the drilldown links to the owning screen — a real route, not a label
    expect(drill.find((r) => r.id === "ld-w8e-1")?.route).toBe("/crm");
  });

  it("2. approve recommendation (ApprovalEngine) → approval-rate metric updates → audit visible to the governance explorer", async () => {
    const clock = makeClock();
    const engine = makeEngine(clock);
    const def = metricByKey("rec_approved_rate");
    expect(def).toBeDefined();
    if (!def) return;
    const range = wholeRange(NOW_ISO, "30d");
    const beforeSample = computeBucket(def, await liveAnalyticsSources(), range).sampleSize ?? 0;

    const approval = await engine.requestApproval({
      runId: "w8e-run-2",
      subjectRef: "lead:ld-1",
      action: "customer-message",
      requestedById: "ag-hunter",
      executionPayload: null,
      previewHe: "טיוטת הודעת מעקב לליד",
    });
    await engine.decide({
      runId: "w8e-run-2",
      approvalId: approval.id,
      kind: "approve",
      decidedById: CEO.id,
    });

    // metric: one more DECIDED approval in the sample
    const afterBucket = computeBucket(def, await liveAnalyticsSources(), range);
    expect(afterBucket.sampleSize).toBe(beforeSample + 1);

    // governance audit explorer finds the decision through its real filters
    const audit = await getRepository<AuditEvent>("auditEvents").list();
    const matched = filterAuditEvents(audit, {
      ...EMPTY_AUDIT_QUERY,
      operation: "approval.approved",
      approvalsOnly: true,
    });
    const event = matched.find((e) => e.entityRef === `approval:${approval.id}`);
    expect(event).toBeDefined();
    if (event) expect(deriveAuditSeverity(event)).toBe("בינונית");
  });

  it("3. reject recommendation → rejection metric updates → learning observation eligible (deriveObservations)", async () => {
    const clock = makeClock();
    const engine = makeEngine(clock);
    const def = metricByKey("rec_rejected_rate");
    expect(def).toBeDefined();
    if (!def) return;
    const range = wholeRange(NOW_ISO, "30d");
    const sources0 = await liveAnalyticsSources();
    const rejected0 = sources0.approvals.filter((a) => a.status === "נדחה").length;

    const approval = await engine.requestApproval({
      runId: "w8e-run-3",
      subjectRef: "lead:ld-2",
      action: "customer-message",
      requestedById: "ag-hunter",
      executionPayload: null,
      previewHe: "טיוטה לדחייה",
    });
    await engine.decide({
      runId: "w8e-run-3",
      approvalId: approval.id,
      kind: "reject",
      decidedById: CEO.id,
      noteHe: "הנוסח אינו מתאים ללקוח",
    });
    const rec = await getRepository<AIRecommendation>("aiRecommendations").create({
      ...base("rec-w8e-3"),
      agentId: "ag-hunter",
      title: "המלצת מעקב שנדחתה",
      reason: "ליד ללא מענה",
      evidenceIds: [],
      confidenceMethod: null,
      nextAction: "שליחת הודעה",
      approvalRequired: true,
      approvalId: approval.id,
      entityRef: "lead:ld-2",
    });

    const sources1 = await liveAnalyticsSources();
    expect(sources1.approvals.filter((a) => a.status === "נדחה").length).toBe(rejected0 + 1);
    const bucket = computeBucket(def, sources1, range);
    expect(bucket.value).not.toBeNull();

    // the learning loop derives an observation from the SAME records
    const observations = deriveObservations(sources1.aiRecommendations, sources1.approvals);
    const mine = observations.find((o) => o.sourceRef === `ai-recommendation:${rec.id}`);
    expect(mine?.origin).toBe("recommendation-rejected");
  });

  it("4. service SLA breach → operations metric updates → notification derivation → governance risk linkable", async () => {
    const openedAt = new Date(Date.parse(NOW_ISO) - 10 * 86_400_000).toISOString();
    const def = metricByKey("open_tickets");
    expect(def).toBeDefined();
    if (!def) return;
    const range = wholeRange(NOW_ISO, "30d");
    const beforeValue = aggregateValue(def, await liveAnalyticsSources(), range) ?? 0;

    await getRepository<ServiceTicket>("serviceTickets").create({
      ...base("tk-w8e-4", openedAt),
      subject: "תקלת חימום חוזרת",
      issue: "תקלת חימום חוזרת",
      customerId: "cu-1",
      printerId: null,
      status: "נפתחה",
      priority: "גבוהה",
      openedAt,
    } as unknown as ServiceTicket);

    const after = await liveAnalyticsSources();
    expect(aggregateValue(def, after, range)).toBe(beforeValue + 1);

    // notification derivation: the ticket breaches the priority SLA
    const notifications = deriveNotifications(
      {
        leads: after.leads,
        tasks: after.tasks,
        quotations: after.quotations,
        tickets: after.serviceTickets,
        aiRecommendations: after.aiRecommendations,
        approvals: after.approvals,
        enrollments: after.enrollments,
        automationRuns: after.automationRuns,
        agentTasks: [],
      },
      new Date(NOW_ISO),
    );
    expect(notifications.some((n) => n.id === "ntf-ticket-sla-tk-w8e-4")).toBe(true);

    // governance: the breach is linkable to a REAL risk-register record
    const clock = makeClock();
    const stores = governanceStores();
    await bootstrapRisks(stores, clock);
    const audit = await stores.audit.list();
    const incident = await openIncident(
      stores,
      {
        titleHe: "חריגת SLA בקריאת שירות tk-w8e-4",
        descriptionHe: "קריאה בעדיפות גבוהה פתוחה מעל יעד ה-SLA — נפתח אירוע ממשל",
        severity: "גבוהה",
        reportedById: CEO.id,
        reportedByName: CEO.name,
        relatedRiskIds: ["gr-audit-coverage-gap"],
        relatedAuditEventIds: audit[0] ? [audit[0].id] : [],
      },
      clock,
    );
    expect(incident.relatedRiskIds).toContain("gr-audit-coverage-gap");
    const risk = await stores.risks.get("gr-audit-coverage-gap");
    expect(risk).toBeDefined();
  });

  it("5. approve knowledge article → knowledge metric updates → audit → isAuthoritative ⇒ Wiki retrieval eligible", async () => {
    const clock = makeClock();
    const engine = makeEngine(clock);
    const service = new KnowledgeGovernanceService({
      stores: knowledgeStores(),
      engine,
      clock,
    });

    const draft = await service.createDraft(
      {
        title: "כיול מיטת הדפסה W8E",
        category: "פתרון תקלות",
        summary: "סדר פעולות לכיול מיטה לפני הדפסת PETG",
        content: "1. חימום מיטה · 2. כיול ארבע פינות · 3. הדפסת שכבת בדיקה",
        supportedPrinterModels: [],
        supportedMaterials: ["PETG"],
        troubleshootingCategories: ["הידבקות"],
        safetyNotes: [],
      },
      "u-oren",
      "ka-w8e-5",
    );
    await service.submitForReview(draft.id, "u-oren");
    const approved = await service.approve(draft.id, CEO.id, { noteHe: "אושר לבדיקת אינטגרציה" });
    expect(approved.approval.state).toBe("מאושר");

    // audit — the canonical engine recorded the human decision
    const audit = await getRepository<AuditEvent>("auditEvents").list();
    expect(
      audit.some(
        (e) =>
          e.action === "approval.approved" &&
          e.entityRef === `approval:${approved.approval.approvalId}`,
      ),
    ).toBe(true);

    // authoritative ⇒ eligible for Wiki retrieval (the ONE predicate)
    expect(isAuthoritative(approved, NOW_ISO)).toBe(true);
    const wiki = new WikiAgent({ stores: knowledgeStores(), now: () => NOW_ISO });
    const hits = await wiki.searchApproved("כיול");
    expect(hits.some((h) => h.article.id === "ka-w8e-5")).toBe(true);

    // knowledge metric — a recorded usage of the approved version counts
    const def = metricByKey("knowledge_usage_count");
    expect(def).toBeDefined();
    if (!def) return;
    const range = wholeRange(NOW_ISO, "30d");
    const before = aggregateValue(def, await liveAnalyticsSources(), range) ?? 0;
    const usedAt = new Date(Date.parse(NOW_ISO) - 3_600_000).toISOString();
    await getRepository<KnowledgeUsage>("knowledgeUsage").create({
      ...base("ku-w8e-5", usedAt),
      articleId: "ka-w8e-5",
      articleVersion: approved.version,
      usedAt,
      byAgent: "ag-wiki",
      inRecommendation: "rec-w8e-5",
      supersededByVersion: null,
      supersededAt: null,
    });
    const after = await liveAnalyticsSources();
    expect(aggregateValue(def, after, range)).toBe(before + 1);
    expect(
      drilldownRecords(def, after, range).some((r) => r.id === "ku-w8e-5"),
    ).toBe(true);
  });

  it("6. approve learning rule (named manager) → RuleEffect governance check passes → learning metric updates → audit", async () => {
    const clock = makeClock();
    const engine = makeEngine(clock);
    const stores = learningStores();
    const def = metricByKey("rec_approved_rate");
    expect(def).toBeDefined();
    if (!def) return;
    const range = wholeRange(NOW_ISO, "30d");
    const beforeSample = computeBucket(def, await liveAnalyticsSources(), range).sampleSize ?? 0;

    const draft: ProposalDraft = {
      proposal: {
        id: "lp-w8e-6",
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        proposedInsightHe:
          "וורפינג ב-PETG נפתר שוב ושוב באותו סדר פעולות — Brim ואז חימום מיטה.",
        businessDomain: "שירות",
        sampleSize: 2,
        supportingRecordIds: ["approval:ap-1", "knowledge:kn-1"],
        contraryRecordIds: [],
        possibleBiasHe: ["מדגם קטן ממקור אחד"],
        limitationsHe: ["מדגם קטן — 2 רשומות", "קורלציה בלבד"],
        affectedAgentIds: ["ag-fixer"],
        affectedWorkflowsHe: ["אבחון קריאת שירות"],
        proposedEffect: {
          kind: "troubleshooting-order",
          symptomHe: "וורפינג בהדפסת PETG",
          orderedActionsHe: ['הוספת Brim 5 מ"מ', "חימום מיטה ל-70°C"],
        },
        evidenceBasis: "correlation",
        causationEvidenceRef: null,
        singleCaseMarkerHe: null,
        namedReviewerId: CEO.id,
        namedReviewerName: CEO.name,
        approvalId: null,
        approvalState: "pending",
        reviewDueAt: null,
      },
      evidence: [
        {
          id: "lp-w8e-6-ev-1",
          createdAt: NOW_ISO,
          updatedAt: NOW_ISO,
          proposalId: "lp-w8e-6",
          sourceType: "entity",
          sourceRef: "approval:ap-1",
          claimHe: "פתרון חוזר שאושר",
          direction: "supporting",
          capturedAt: NOW_ISO,
        },
      ],
    };
    await submitProposal(stores, engine, draft);
    const rule = await approveProposal(
      stores,
      engine,
      { proposalId: "lp-w8e-6", decidedById: CEO.id, decidedByName: CEO.name },
      clock,
    );
    expect(rule.status).toBe("active");
    expect(rule.approvedByName).toBe(CEO.name);

    // RuleEffect governance check — the effect lives INSIDE the closed union
    expect(ruleEffectSchema.safeParse(rule.effect).success).toBe(true);

    // learning metric — one more decided approval in the canonical collection
    const afterSample = computeBucket(def, await liveAnalyticsSources(), range).sampleSize ?? 0;
    expect(afterSample).toBe(beforeSample + 1);

    // audit — activation + a recorded application
    const application = await applyRule(stores, rule.id, "ticket:t-1", "ag-fixer", clock);
    const audit = await getRepository<AuditEvent>("auditEvents").list();
    expect(audit.some((e) => e.action === "learning.rule-activated")).toBe(true);
    expect(
      audit.some((e) => e.id === application.auditId && e.action === RULE_APPLY_AUDIT_ACTION),
    ).toBe(true);
    // the learning-loop approval never observes itself
    const observations = deriveObservations([], await getRepository<Approval>("approvals").list());
    expect(observations.some((o) => o.sourceRef.includes(LEARNING_RUN_ID))).toBe(false);
  });

  it("7. permission change request → approval → user access updates (read-back) → audit explorer finds it", async () => {
    const clock = makeClock();
    const service = new AdministrationService({
      stores: userStores(),
      roles: roleStores(),
      agentStores: agentStores(),
      clock,
      flags: memFlags(),
    });
    await service.ensureBaseline();

    const request = await service.requestPermissionChange({
      kind: "user-override",
      targetId: "u-maya",
      domain: "service",
      newLevel: "write",
      requestedById: CEO.id,
      requestedByName: CEO.name,
      approverId: "u-noa",
      approverName: "נעה פרידמן",
    });
    expect(request.status).toBe("ממתין");

    const decided = await service.approveChangeRequest(request.id, "u-noa");
    expect(decided.status).toBe("בוצע");
    expect(decided.verifiedAt).not.toBeNull();

    // read-back: the EFFECTIVE grants really changed
    const effective = await service.effectiveGrants("u-maya");
    expect(effective.grants.service).toBe("write");

    // the governance audit explorer finds the execution through real filters
    const audit = await getRepository<AuditEvent>("auditEvents").list();
    const matched = filterAuditEvents(audit, {
      ...EMPTY_AUDIT_QUERY,
      operation: "admin.permission.execute",
    });
    expect(
      matched.some((e) => e.entityRef === `access-change-request:${request.id}`),
    ).toBe(true);
  });

  it("8. disable agent (emergency) → agents repo status → queue/engine gate reflects → audit", async () => {
    const clock = makeClock();
    const stores = userStores();
    const agents = agentStores();
    const service = new AdministrationService({
      stores,
      roles: roleStores(),
      agentStores: agents,
      clock,
      flags: memFlags(),
    });

    const record = await service.activateEmergencyControl({
      control: "agent-disable",
      targetAgentId: "ag-hunter",
      actorId: CEO.id,
      actorName: CEO.name,
      reasonHe: "השבתת חירום לבדיקת אינטגרציה",
    });
    expect(record.state).toBe("פעיל");
    expect(record.targetRef).toBe("agent:ag-hunter");

    // repo state — the persisted agent record is disabled
    const agent = await agents.agents.get("ag-hunter");
    expect(agent?.status).toBe("מושבת");

    // the run/queue gate refuses new assignments for the disabled agent
    await expect(assertAgentsEnabled(agents, ["ag-hunter"])).rejects.toThrow("השבתת חירום");
    // queue sizes remain a pure function of the task records (health check input)
    const sizes = agentQueueSizes(await agents.tasks.list());
    expect(typeof sizes).toBe("object");

    // audit
    const audit = await getRepository<AuditEvent>("auditEvents").list();
    expect(
      audit.some(
        (e) => e.action === "admin.emergency.activate" && e.entityRef === `emergency:${record.id}`,
      ),
    ).toBe(true);

    // deactivation restores the agent — reversible, audited
    await service.deactivateEmergencyControl(record.id, CEO.id, CEO.name);
    expect((await agents.agents.get("ag-hunter"))?.status).toBe("פעיל");
  });

  it("9. migration failure (malformed record) → MigrationHealth degrades → incident creatable → ZERO record loss", async () => {
    const env = await makeEnv(); // fresh factory + injectable health env
    const leads = getRepository<Lead>("leads");
    await leads.create({ ...base("ld-broken-w8e") } as unknown as Lead); // malformed: no name
    const countBefore = (await leads.list()).length;

    const testMigration: Migration = {
      id: "m900",
      description: "בדיקת אינטגרציה — לידים חייבים שדה name",
      collections: ["leads"],
      idempotencyKey: "w8e-m900",
      up: (record) =>
        typeof (record as { name?: unknown }).name === "string" ? record : null,
    };
    const migEnv: MigrationEnv = {
      stores: productionMigrationStores(),
      localStorage: null,
      now: () => NOW_ISO,
    };
    const report = await runMigrations([testMigration], migEnv);

    // the malformed record was SKIPPED + audited — not dropped, not app-fatal
    expect(report.results[0]?.status).toBe("applied");
    expect(report.results[0]?.skipped).toContainEqual({
      collection: "leads",
      id: "ld-broken-w8e",
    });
    const audit = await getRepository<AuditEvent>("auditEvents").list();
    expect(
      audit.some(
        (e) => e.action === "migration:m900" && e.details.includes("ld-broken-w8e"),
      ),
    ).toBe(true);

    // ZERO record loss — the malformed record is still there, untouched
    expect((await leads.list()).length).toBe(countBefore);
    expect(await leads.get("ld-broken-w8e")).toBeDefined();

    // MigrationHealth degrades: the registered migrations are still pending
    const health = await collectMigrationHealth(env);
    expect(health.pendingMigrations.length).toBeGreaterThan(0);
    const component = await checkMigrations(env);
    expect(component.state).toBe("דורש תשומת לב");

    // an incident is creatable from the degraded component — a REAL record
    const incident = await openHealthIncident(
      { collection: (k) => getRepository(k) },
      component,
      "system-health",
      () => NOW_ISO,
    );
    expect(incident.status).toBe("פתוח");
    const stored = await getRepository<HealthIncident>("governanceIncidents").get(incident.id);
    expect(stored?.source).toBe("system-health");
  });

  it("10. submission deliverable approval (canonical Approval) → state recalculates → readiness analytics update → NO unrelated changes", async () => {
    const clock = makeClock();
    const engine = makeEngine(clock);

    const before = evaluateAllDeliverables(buildSubmissionSources(), []);
    const quickStartBefore = before.find((e) => e.key === "quick-start");
    expect(quickStartBefore?.approvalStatusHe).toBe("אין רשומת אישור");
    expect(quickStartBefore?.state).not.toBe("מלא");

    // the canonical engine records the request AND the NAMED human decision
    const approval = await engine.requestApproval({
      runId: "w8e-run-10",
      subjectRef: approvalSubjectRef("quick-start"),
      action: "permanent-knowledge-update",
      requestedById: "u-oren",
      executionPayload: null,
      previewHe: "אישור תוצר ההגשה: התחלה מהירה",
    });
    await engine.decide({
      runId: "w8e-run-10",
      approvalId: approval.id,
      kind: "approve",
      decidedById: CEO.id,
      noteHe: "נבדק מול המסך החי",
    });

    const liveApprovals = await getRepository<Approval>("approvals").list();
    const after = evaluateAllDeliverables(buildSubmissionSources({ approvals: liveApprovals }), []);
    const quickStartAfter = after.find((e) => e.key === "quick-start");
    expect(quickStartAfter?.approvalStatusHe).toBe("מאושר");
    expect(quickStartAfter?.approvalId).toBe(approval.id);
    expect(
      quickStartAfter?.stateReasonsHe.some((r) => r.includes("אישור")),
    ).toBe(false);

    // NO unrelated deliverable changed — deep-equal for the other 11
    for (const evaluation of after) {
      if (evaluation.key === "quick-start") continue;
      expect(evaluation).toEqual(before.find((e) => e.key === evaluation.key));
    }

    // submission-readiness analytics update: the management band's pending
    // submission-approvals item drops by one (12 → 11 pending)
    const band = deriveManagementBand({
      risks: [],
      incidents: [],
      accessReviews: [],
      healthSnapshots: [],
      approvals: liveApprovals,
      policies: [],
      nowISO: NOW_ISO,
    });
    const item = band.find((b) => b.key === "submission-approvals");
    expect(item?.count).toBe(11);
    expect(item?.recordIds).not.toContain("quick-start");

    // overall readiness stays HONEST — one approval never fakes readiness
    const findings = buildAuditFindings(buildSubmissionSources({ approvals: liveApprovals }), after);
    expect(overallReadiness(after, findings)).not.toBe("מוכן להגשה");
  });
});
