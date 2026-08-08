// S13.4 (PR D) — the ONE org-scoped boundary for the real local-memory CRUD.
// Reuses the existing repository infrastructure (getRepository → IndexedDB in the
// browser, InMemory/fake-idb in tests) — NOT a second persistence system. Every
// operation is org-scoped and FAIL-CLOSED: a missing organization id throws, and
// no method ever runs a global/unscoped query. Agents may READ via one bounded
// adapter; they may never create/update/archive (writes require the user).
import { getRepository } from "@/repositories";
import { nextId } from "@/repositories/Repository";
import { invalidateCollections } from "@/app/data/hooks";
import {
  memoryEntryInputSchema,
  type MemoryCategory,
  type MemoryEntry,
  type MemoryEntryInput,
  type MemoryEntryStatus,
} from "@/domain/memory/entry";

const COLLECTION = "memoryEntries" as const;

export class MemoryOrgScopeError extends Error {
  readonly code = "MEMORY_ORG_REQUIRED" as const;
  constructor() {
    super("זיהוי ארגון חסר — הגישה לזיכרון המקומי נחסמה (fail-closed).");
    this.name = "MemoryOrgScopeError";
  }
}
export class MemoryValidationError extends Error {
  readonly code = "MEMORY_VALIDATION" as const;
  constructor(message: string) {
    super(message);
    this.name = "MemoryValidationError";
  }
}
export class MemoryNotFoundError extends Error {
  readonly code = "MEMORY_NOT_FOUND" as const;
  constructor() {
    super("הרשומה לא נמצאה או אינה בהיקף הארגון הפעיל.");
    this.name = "MemoryNotFoundError";
  }
}

/** Fail closed: an empty/blank org id is never allowed to run a query. */
function requireOrg(orgId: string): string {
  const org = (orgId ?? "").trim();
  if (!org) throw new MemoryOrgScopeError();
  return org;
}
function repo() {
  return getRepository<MemoryEntry>(COLLECTION);
}
function nowISO(now?: string): string {
  return now ?? new Date().toISOString();
}

/** List the active org's entries (never a cross-org / global query). */
export async function listMemoryEntries(
  orgId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<MemoryEntry[]> {
  const org = requireOrg(orgId);
  const all = await repo().list();
  return all
    .filter((e) => e.organizationId === org && (opts.includeArchived ? true : e.status === "ACTIVE"))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** One entry ONLY if it belongs to the active org (cross-org read → undefined). */
export async function getMemoryEntry(orgId: string, id: string): Promise<MemoryEntry | undefined> {
  const org = requireOrg(orgId);
  const entry = await repo().get(id);
  return entry && entry.organizationId === org ? entry : undefined;
}

export async function createMemoryEntry(
  orgId: string,
  input: MemoryEntryInput,
  now?: string,
): Promise<MemoryEntry> {
  const org = requireOrg(orgId);
  const parsed = memoryEntryInputSchema.safeParse(input);
  if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "קלט לא תקין");
  const at = nowISO(now);
  const existing = (await repo().list()).map((e) => e.id);
  const entry: MemoryEntry = {
    id: nextId("me", existing),
    createdAt: at,
    updatedAt: at,
    organizationId: org,
    title: parsed.data.title,
    content: parsed.data.content,
    category: parsed.data.category,
    tags: parsed.data.tags ?? [],
    source: parsed.data.source && parsed.data.source.length > 0 ? parsed.data.source : "user",
    status: "ACTIVE",
  };
  const saved = await repo().create(entry);
  await invalidateCollections([COLLECTION]);
  return saved;
}

export async function updateMemoryEntry(
  orgId: string,
  id: string,
  input: MemoryEntryInput,
  now?: string,
): Promise<MemoryEntry> {
  const org = requireOrg(orgId);
  const owned = await getMemoryEntry(org, id); // enforces org ownership BEFORE any write
  if (!owned) throw new MemoryNotFoundError();
  const parsed = memoryEntryInputSchema.safeParse(input);
  if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "קלט לא תקין");
  const saved = await repo().update(id, {
    title: parsed.data.title,
    content: parsed.data.content,
    category: parsed.data.category,
    tags: parsed.data.tags ?? [],
    ...(parsed.data.source && parsed.data.source.length > 0 ? { source: parsed.data.source } : {}),
    updatedAt: nowISO(now),
  });
  await invalidateCollections([COLLECTION]);
  return saved;
}

async function setStatus(
  orgId: string,
  id: string,
  status: MemoryEntryStatus,
  now?: string,
): Promise<MemoryEntry> {
  const org = requireOrg(orgId);
  const owned = await getMemoryEntry(org, id);
  if (!owned) throw new MemoryNotFoundError();
  const saved = await repo().update(id, { status, updatedAt: nowISO(now) });
  await invalidateCollections([COLLECTION]);
  return saved;
}
/** Archive instead of destructive delete (no hard delete in this PR). */
export function archiveMemoryEntry(orgId: string, id: string, now?: string): Promise<MemoryEntry> {
  return setStatus(orgId, id, "ARCHIVED", now);
}
export function restoreMemoryEntry(orgId: string, id: string, now?: string): Promise<MemoryEntry> {
  return setStatus(orgId, id, "ACTIVE", now);
}

export interface MemorySearchOptions {
  query?: string;
  category?: MemoryCategory | "ALL";
  includeArchived?: boolean;
}

/** Search title/content/tags within the active org, with category + status filters. */
export async function searchMemoryEntries(
  orgId: string,
  opts: MemorySearchOptions = {},
): Promise<MemoryEntry[]> {
  const list = await listMemoryEntries(orgId, { includeArchived: opts.includeArchived ?? false });
  const q = (opts.query ?? "").trim().toLowerCase();
  return list.filter((e) => {
    if (opts.category && opts.category !== "ALL" && e.category !== opts.category) return false;
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q))
    );
  });
}

/**
 * Bounded READ-ONLY adapter for agents (Wiki search / Nexa navigation context /
 * Mentor learning reference). Returns active entries only, capped. Agents may
 * READ; they may NEVER write — creation/edit/archive happen only through the
 * user-facing repository functions above (explicit human action).
 */
export async function activeMemoryForAgents(
  orgId: string,
  query: string,
  limit = 5,
): Promise<MemoryEntry[]> {
  const res = await searchMemoryEntries(orgId, { query, category: "ALL", includeArchived: false });
  return res.slice(0, Math.max(0, limit));
}
