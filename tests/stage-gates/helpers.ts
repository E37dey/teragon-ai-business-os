// Shared fixtures for the W7-C stage-gate tests: deterministic clock, fresh
// factory-backed stores (InMemory pre-seeded with the canonical seed in jsdom)
// and a real StageGateService.
import type { ISODate } from "@/domain/types";
import {
  CANONICAL_STAGE_GATES,
  StageGateService,
  type StageGateEvidenceRef,
  type StageGateV2,
  type StageGateV2Fields,
} from "@/domain/stage-gates";
import type { StageGateContext } from "@/domain/stage-gates";
import { __resetRepositoriesForTests } from "@/repositories";
import { stageGateStores, type StageGateStores } from "@/repositories/stageGateStores";

export const NOW = "2026-07-23T12:00:00.000Z";

/** Deterministic clock: each call advances by stepMs (default 10ms). */
export function makeClock(startISO = NOW, stepMs = 10): () => string {
  let t = Date.parse(startISO);
  return () => {
    const iso = new Date(t).toISOString();
    t += stepMs;
    return iso;
  };
}

export interface Fixture {
  stores: StageGateStores;
  svc: StageGateService;
  clock: () => string;
}

/** Fresh everything per test — factory reset ⇒ seeded InMemory collections. */
export function fresh(): Fixture {
  __resetRepositoriesForTests();
  const clock = makeClock();
  const stores = stageGateStores();
  const svc = new StageGateService({ stores, clock });
  return { stores, svc, clock };
}

/** Fixture with the idempotent bridge already applied. */
export async function freshBridged(): Promise<Fixture> {
  const f = fresh();
  await f.svc.ensureBridge();
  return f;
}

export function defOf(gateKey: string) {
  const def = CANONICAL_STAGE_GATES.find((d) => d.gateKey === gateKey);
  if (!def) throw new Error(`unknown gate key ${gateKey}`);
  return def;
}

/** Empty validator context — pure-function tests override what they need. */
export function makeCtx(overrides: Partial<StageGateContext> = {}): StageGateContext {
  return {
    personas: [],
    trainingMaterials: [],
    metricDefinitions: [],
    metricObservations: [],
    memoryRecords: [],
    knowledgeArticles: [],
    documents: [],
    implementationEvidence: [],
    pilotDefinitions: [],
    pilotResults: [],
    rolloutWaves: [],
    users: [],
    ...overrides,
  };
}

let refSeq = 0;

export function makeRef(overrides: Partial<StageGateEvidenceRef> = {}): StageGateEvidenceRef {
  refSeq += 1;
  return {
    id: `sge-test-${refSeq}`,
    refType: "persona",
    refId: "per-1",
    criterionKey: "g1-personas",
    attachedAt: NOW,
    attachedById: "u-tzachi",
    noteHe: "",
    ...overrides,
  };
}

/** A synthetic bridged gate record for pure validator tests. */
export function makeGateV2(
  legacyId: string,
  v2Overrides: Partial<StageGateV2Fields> = {},
  legacyStatus: "לא התחיל" | "בתהליך" | "עבר" | "נכשל" = "לא התחיל",
): StageGateV2 {
  const def = CANONICAL_STAGE_GATES.find((d) => d.legacyId === legacyId);
  if (!def) throw new Error(`not a canonical gate id: ${legacyId}`);
  const meta: { createdAt: ISODate; updatedAt: ISODate } = { createdAt: NOW, updatedAt: NOW };
  return {
    id: legacyId,
    ...meta,
    order: Number(legacyId.slice(3)),
    name: `legacy ${legacyId}`,
    criteria: [],
    evidenceIds: [],
    status: legacyStatus,
    decidedAt: null,
    decidedById: null,
    v2: {
      gateKey: def.gateKey,
      nameHe: def.nameHe,
      attachedEvidence: [],
      ownerId: "u-tzachi",
      reviewerId: "u-noa",
      decision: null,
      decisionDate: null,
      decidedById: null,
      decisionNoteHe: "",
      reopened: false,
      reopenNoteHe: "",
      completionRequests: [],
      targetDecisionDate: null,
      bridgedAt: NOW,
      ...v2Overrides,
    },
  };
}
