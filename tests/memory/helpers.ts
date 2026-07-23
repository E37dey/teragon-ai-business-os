// Shared fixtures for the W6-A memory tests: deterministic clock, fresh
// factory-backed stores (InMemory in jsdom — no indexedDB), draft builders.
import { __resetRepositoriesForTests } from "@/repositories";
import { agentStores, type AgentStores } from "@/repositories/agentStores";
import { memoryStores, type MemoryStores } from "@/memory/repositories/memoryStores";
import { MemoryProposalWorkflow } from "@/memory/core/proposalWorkflow";
import type { MemoryProposalDraft, MemorySource } from "@/domain/memory";

/** Deterministic clock: each call advances by stepMs (default 10ms). */
export function makeClock(startISO = "2026-07-23T08:00:00.000Z", stepMs = 10): () => string {
  let t = Date.parse(startISO);
  return () => {
    const iso = new Date(t).toISOString();
    t += stepMs;
    return iso;
  };
}

export interface MemoryTestBundle {
  stores: MemoryStores;
  agents: AgentStores;
  workflow: MemoryProposalWorkflow;
  clock: () => string;
}

/** Fresh stores + workflow per test (factory reset ⇒ reseeded repositories). */
export function freshWorkflow(): MemoryTestBundle {
  __resetRepositoriesForTests();
  const stores = memoryStores();
  const agents = agentStores();
  const clock = makeClock();
  const workflow = new MemoryProposalWorkflow({ stores, agentStores: agents, clock });
  return { stores, agents, workflow, clock };
}

export const TZACHI = { deciderId: "u-tzachi", deciderName: "צחי זוסטייהם" };

/** persist a verified test source and return it. */
export async function seedSource(
  stores: MemoryStores,
  overrides: Partial<MemorySource> = {},
): Promise<MemorySource> {
  const existing = await stores.sources.list();
  const source: MemorySource = {
    id: `msrc-${existing.length + 1}`,
    createdAt: "2026-07-23T07:00:00.000Z",
    updatedAt: "2026-07-23T07:00:00.000Z",
    kind: "entity",
    refId: "customers:cust-1",
    titleHe: "לקוח: בדיקה",
    excerpt: "ציטוט תומך מהרשומה המקורית",
    capturedAt: "2026-07-23T07:00:00.000Z",
    verified: true,
    ...overrides,
  };
  return stores.sources.create(source);
}

export function makeDraft(
  overrides: Partial<Omit<MemoryProposalDraft, "slug">> = {},
): Omit<MemoryProposalDraft, "slug"> {
  return {
    title: "העדפת תקשורת — בדיקת זרימה",
    bodyMarkdown: "# העדפה\n\nערוץ מועדף: וואטסאפ\n\n- פרט תומך",
    memoryLayer: "customer",
    folder: "לקוחות",
    entityLinks: [],
    tags: ["בדיקה"],
    sourceIds: ["msrc-1"],
    sensitivity: "פנימי",
    retentionPolicy: "קבוע",
    reviewDate: null,
    ...overrides,
  };
}
