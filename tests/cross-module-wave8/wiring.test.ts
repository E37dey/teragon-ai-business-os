// W8-E — tests for the Wave-8 cross-module WIRING itself:
// (a) ai.fallback audit from the ProviderRegistry fallback path
// (b) automation-execution-disable emergency gate
// (c) health incidents split + close on the governance surface
// (d) applyUiSettings at boot
// (e) the Command-Center management band derivation
// (f) additive submission Wave-8 evidence refs (readiness gate untouched)
import { beforeEach, describe, expect, it } from "vitest";
import { getRepository } from "@/repositories";
import type { AuditEvent } from "@/domain/types";
import { ProviderRegistry, FALLBACK_AUDIT_ACTION } from "@/ai/providers/registry";
import { computeBucket, metricByKey, wholeRange } from "@/analytics";
import { isEmergencyFlagActive, setEmergencyFlag } from "@/administration";
import {
  AUTOMATION_EXECUTION_DISABLED_HE,
  automationExecutionGate,
  evaluateAutomationExecutionGate,
} from "@/integration/wave8/automationExecutionGuard";
import {
  closeHealthIncident,
  openHealthIncidents,
  splitGovernanceIncidents,
} from "@/integration/wave8/healthIncidents";
import { applyUiSettingsAtBoot } from "@/integration/wave8/applyUiSettings";
import {
  deriveManagementBand,
  POLICY_EXPIRY_WINDOW_DAYS,
} from "@/integration/wave8/managementBand";
import { governanceStores } from "@/repositories/governanceStores";
import { openIncident } from "@/governance/incidents";
import { openHealthIncident } from "@/system-health/incidents";
import type { SystemComponentHealth } from "@/domain/system-health";
import { HEALTH_COMPONENT_NAMES_HE } from "@/domain/system-health";
import {
  productionSettingsStores,
  readSettingsRecord,
  setSetting,
} from "@/modules/settings/settingsStore";
import { APP_ROUTES } from "@/app/routes";
import {
  REGISTRY_DELIVERABLE_KEYS,
  WAVE8_DELIVERABLE_EVIDENCE,
  WAVE8_PENDING_APPROVAL_HE,
  evaluateAllDeliverables,
  wave8EvidenceFor,
  wave8EvidenceSummaryHe,
} from "@/domain/submission";
import { ADMIN_DEMO_LABEL_HE, type AccessReviewRecord } from "@/domain/administration";
import type { GovernancePolicy, GovernanceRisk } from "@/domain/governance";
import type { SystemHealthSnapshot } from "@/domain/system-health";
import { fakeProvider } from "../system-health/helpers";
import { buildSources as buildSubmissionSources } from "../submission/helpers";
import { base, liveAnalyticsSources, makeClock, NOW_ISO, resetRepos } from "./helpers";

const CEO = { id: "u-tzachi", name: "צחי זוסטייהם" } as const;

beforeEach(() => {
  resetRepos();
  setEmergencyFlag("automation-execution-disable", false);
});

function attentionComponent(): SystemComponentHealth {
  return {
    componentId: "migrations",
    nameHe: HEALTH_COMPONENT_NAMES_HE.migrations,
    state: "דורש תשומת לב",
    lastCheck: NOW_ISO,
    checkMethodHe: "בדיקת מיגרציות (fixture)",
    responseTimeMs: 3,
    lastSuccess: null,
    lastFailure: NOW_ISO,
    limitationHe: null,
    recommendedActionHe: "רעננו את האפליקציה",
    detailHe: "מיגרציות ממתינות",
  };
}

describe("(a) ProviderRegistry fallback → ai.fallback audit → ai_fallbacks metric", () => {
  it("a disclosed remote→local fallback writes ONE ai.fallback audit event", async () => {
    const local = fakeProvider({ state: "מחובר", checkedAt: NOW_ISO, detail: "" });
    const registry = new ProviderRegistry(
      { remoteEnabled: true, localFallbackPermitted: true },
      { remote: fakeProvider({ state: "לא זמין", checkedAt: NOW_ISO, detail: "נפל" }), local },
    );
    const auditBefore = (await getRepository<AuditEvent>("auditEvents").list()).filter(
      (e) => e.action === FALLBACK_AUDIT_ACTION,
    ).length;

    const selection = await registry.select();
    expect(selection.provider).toBe(local);
    expect(selection.fallback).not.toBeNull();

    const audit = await getRepository<AuditEvent>("auditEvents").list();
    const fallbackEvents = audit.filter((e) => e.action === FALLBACK_AUDIT_ACTION);
    expect(fallbackEvents.length).toBe(auditBefore + 1);
    expect(fallbackEvents[fallbackEvents.length - 1]?.details).toContain("מנוע המקומי");

    // the ai_fallbacks metric now counts a REAL recorded event (not declared 0)
    const def = metricByKey("ai_fallbacks");
    expect(def).toBeDefined();
    if (!def) return;
    // the production sink stamps the REAL clock — measure over a range ending
    // just after the actual write moment
    const liveNow = new Date(Date.now() + 60_000).toISOString();
    const bucket = computeBucket(
      def,
      await liveAnalyticsSources(liveNow),
      wholeRange(liveNow, "30d"),
    );
    expect(bucket.value).not.toBeNull();
    expect(bucket.value ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("Mode A (remote disabled) stays PRIMARY-local — no fallback, no audit", async () => {
    const local = fakeProvider({ state: "מחובר", checkedAt: NOW_ISO, detail: "" });
    const registry = new ProviderRegistry(
      { remoteEnabled: false, localFallbackPermitted: true },
      { remote: local, local },
    );
    const before = (await getRepository<AuditEvent>("auditEvents").list()).filter(
      (e) => e.action === FALLBACK_AUDIT_ACTION,
    ).length;
    const selection = await registry.select();
    expect(selection.fallback).toBeNull();
    const after = (await getRepository<AuditEvent>("auditEvents").list()).filter(
      (e) => e.action === FALLBACK_AUDIT_ACTION,
    ).length;
    expect(after).toBe(before);
  });
});

describe("(b) automation-execution-disable emergency gate", () => {
  it("pure gate: flag active ⇒ blocked with the honest Hebrew reason", () => {
    expect(evaluateAutomationExecutionGate(false)).toEqual({ allowed: true, reasonHe: null });
    const blocked = evaluateAutomationExecutionGate(true);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reasonHe).toBe(AUTOMATION_EXECUTION_DISABLED_HE);
  });

  it("production gate mirrors the real W8-C flag reader (and never throws)", () => {
    // In this test environment localStorage is non-functional (Node global),
    // so the W8-C reader fail-opens to false — the gate must mirror it exactly
    // and never throw. The flag→refusal semantics are covered by the pure gate.
    const gate = automationExecutionGate();
    expect(gate).toEqual(
      evaluateAutomationExecutionGate(isEmergencyFlagActive("automation-execution-disable")),
    );
  });
});

describe("(c) governance surface — system-health incidents", () => {
  it("splits the shared collection by the source discriminant", async () => {
    const clock = makeClock();
    const stores = governanceStores();
    await openIncident(
      stores,
      {
        titleHe: "תקרית ממשל רגילה",
        descriptionHe: "בדיקה",
        severity: "נמוכה",
        reportedById: CEO.id,
        reportedByName: CEO.name,
      },
      clock,
    );
    await openHealthIncident(
      { collection: (k) => getRepository(k) },
      attentionComponent(),
      "system-health",
      () => NOW_ISO,
    );

    const raw = await getRepository("governanceIncidents").list();
    const split = splitGovernanceIncidents(raw);
    expect(split.governance.length).toBe(1);
    expect(split.health.length).toBe(1);
    expect(split.health[0]?.source).toBe("system-health");
    expect(openHealthIncidents(raw).length).toBe(1);
  });

  it("closeHealthIncident closes the record and writes a governance audit event", async () => {
    const clock = makeClock();
    const stores = governanceStores();
    const incident = await openHealthIncident(
      { collection: (k) => getRepository(k) },
      attentionComponent(),
      "system-health",
      () => NOW_ISO,
    );
    const closed = await closeHealthIncident(
      stores,
      { incidentId: incident.id, byId: CEO.id, byName: CEO.name },
      clock,
    );
    expect(closed.status).toBe("סגור");
    const audit = await stores.audit.list();
    expect(
      audit.some(
        (e) =>
          e.action === "governance.health-incident-closed" &&
          e.entityRef === `governance-incident:${incident.id}`,
      ),
    ).toBe(true);
    // closing twice is refused honestly
    await expect(
      closeHealthIncident(stores, { incidentId: incident.id, byId: CEO.id, byName: CEO.name }, clock),
    ).rejects.toThrow("כבר סגור");
  });
});

describe("(d) applyUiSettings at boot", () => {
  it("applies the persisted density to the document root at boot", async () => {
    const stores = productionSettingsStores();
    await readSettingsRecord(stores);
    await setSetting(stores, "interface.density", "צפוף", CEO.id);
    document.documentElement.style.fontSize = "";
    const applied = await applyUiSettingsAtBoot(stores, document);
    expect(applied).toBe(true);
    expect(document.documentElement.style.fontSize).toBe("93.75%");
    // restore the default for other tests
    await setSetting(stores, "interface.density", "רגיל", CEO.id);
    await applyUiSettingsAtBoot(stores, document);
    expect(document.documentElement.style.fontSize).toBe("");
  });

  it("never throws at boot — a broken store reports false honestly", async () => {
    const broken = {
      collection: () => {
        throw new Error("storage down");
      },
      agentStores: () => {
        throw new Error("storage down");
      },
      now: () => NOW_ISO,
    } as unknown as Parameters<typeof applyUiSettingsAtBoot>[0];
    await expect(applyUiSettingsAtBoot(broken, document)).resolves.toBe(false);
  });
});

describe("(e) management band derivation (Phase 8.13)", () => {
  const openRisk = (id: string, severity: GovernanceRisk["severity"]): GovernanceRisk =>
    ({
      ...base(id),
      key: id,
      titleHe: "סיכון",
      descriptionHe: "סיכון",
      severity,
      status: "פתוח",
      ownerId: CEO.id,
      ownerName: CEO.name,
      controlIds: [],
      mitigationHe: null,
      sourceRef: null,
      history: [],
      reviewDueAt: null,
    }) as GovernanceRisk;

  it("derives the 7 items from real records, click-through routes included", () => {
    const snapshot = {
      ...base("hs-1"),
      takenAt: NOW_ISO,
      components: [attentionComponent()],
      storage: { usageBytes: null, quotaBytes: null, measured: false, detailHe: "" },
      migration: {
        schemaVersion: 1,
        registeredMigrations: 1,
        appliedMigrations: 1,
        pendingMigrations: [],
        detailHe: "",
      },
      build: {} as SystemHealthSnapshot["build"],
      tallies: {},
    } as unknown as SystemHealthSnapshot;
    const review: AccessReviewRecord = {
      ...base("arv-x"),
      userId: "u-maya",
      userName: "מאיה ברק",
      roleId: "crole-sales",
      status: "ממתין",
      dueAt: NOW_ISO,
      decidedById: null,
      decidedByName: null,
      decidedAt: null,
      noteHe: "",
      demoLabelHe: ADMIN_DEMO_LABEL_HE,
    } as AccessReviewRecord;
    const policy = {
      ...base("gp-1"),
      key: "correct-use",
      titleHe: "מדיניות",
      summaryHe: "מדיניות",
      ownerId: CEO.id,
      ownerName: CEO.name,
      currentVersion: 1,
      status: "פעילה",
      approvalId: "ap-x",
      approvedById: CEO.id,
      approvedByName: CEO.name,
      effectiveAt: NOW_ISO,
      nextReviewAt: new Date(
        Date.parse(NOW_ISO) + (POLICY_EXPIRY_WINDOW_DAYS - 1) * 86_400_000,
      ).toISOString(),
      affectedAgentIds: [],
      affectedOperations: [],
    } as GovernancePolicy;

    const band = deriveManagementBand({
      risks: [openRisk("gr-a", "קריטית"), openRisk("gr-b", "נמוכה")],
      incidents: [],
      accessReviews: [review],
      healthSnapshots: [snapshot],
      approvals: [],
      policies: [policy],
      nowISO: NOW_ISO,
    });

    expect(band).toHaveLength(7);
    const byKey = new Map(band.map((b) => [b.key, b]));
    expect(byKey.get("operational-risks")?.count).toBe(2);
    expect(byKey.get("operational-risks")?.route).toBe("/governance");
    expect(byKey.get("pending-access-reviews")?.count).toBe(1);
    expect(byKey.get("pending-access-reviews")?.route).toBe("/administration");
    expect(byKey.get("health-attention")?.count).toBe(1);
    expect(byKey.get("health-attention")?.recordIds).toContain("migrations");
    expect(byKey.get("expiring-policies")?.count).toBe(1);
    expect(byKey.get("missing-baselines")?.route).toBe("/analytics");
    expect(byKey.get("submission-approvals")?.count).toBe(REGISTRY_DELIVERABLE_KEYS.length);
    // every route is a REAL app route
    for (const item of band) {
      expect(APP_ROUTES.some((r) => r.path === item.route)).toBe(true);
    }
  });

  it("no health snapshot ⇒ health item honestly unmeasured (null, never 0)", () => {
    const band = deriveManagementBand({
      risks: [],
      incidents: [],
      accessReviews: [],
      healthSnapshots: [],
      approvals: [],
      policies: [],
      nowISO: NOW_ISO,
    });
    const health = band.find((b) => b.key === "health-attention");
    expect(health?.count).toBeNull();
    expect(health?.detailHe).toContain("טרם הורצה");
  });
});

describe("(f) submission Wave-8 evidence refs (Phase 8.14)", () => {
  it("every ref points at a real route, a registered deliverable and an existing doc", () => {
    expect(WAVE8_DELIVERABLE_EVIDENCE.length).toBeGreaterThanOrEqual(4);
    for (const ref of WAVE8_DELIVERABLE_EVIDENCE) {
      expect(REGISTRY_DELIVERABLE_KEYS).toContain(ref.deliverableKey);
      expect(APP_ROUTES.some((r) => r.path === ref.route)).toBe(true);
      if (ref.docPath !== null) {
        // repo-relative doc reference (existence is enforced by the docs tree)
        expect(ref.docPath.startsWith("docs/")).toBe(true);
        expect(ref.docPath.endsWith(".md")).toBe(true);
      }
    }
    // the four Wave-8 artifact families are all referenced
    const routes = new Set(WAVE8_DELIVERABLE_EVIDENCE.map((r) => r.route));
    for (const route of ["/analytics", "/governance", "/administration", "/system-health"]) {
      expect(routes.has(route)).toBe(true);
    }
  });

  it("refs are ADDITIVE — the readiness gate and states are untouched; approval stays human", () => {
    const evaluations = evaluateAllDeliverables(buildSubmissionSources(), []);
    // no deliverable is auto-מלא: no approvals ⇒ none complete
    expect(evaluations.every((e) => e.state !== "מלא")).toBe(true);
    // the wave8 refs never leak into the gate's evidence list
    const metricLevels = evaluations.find((e) => e.key === "metric-levels");
    expect(metricLevels?.evidence.length).toBe(1);
    expect(wave8EvidenceFor("metric-levels").length).toBe(2);
    // the mandated pending-approval label is surfaced
    expect(wave8EvidenceSummaryHe("metric-levels")).toContain(WAVE8_PENDING_APPROVAL_HE);
    expect(wave8EvidenceSummaryHe("one-pager")).toBeNull();
  });
});
