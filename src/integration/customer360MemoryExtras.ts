// W6 WIRING — Customer-360 memory tab derivations (Phase 6.17 UI side).
// ADDITIVE helper next to customer360Memory.ts: bridges the mixed
// memoryRecords collection (legacy Wave-1 + V2) and derives everything the
// "זיכרון לקוח" tab renders — approved-only by default, sensitivity honored,
// preferences / promised follow-ups derived from tagging (never invented),
// evidence resolved from real MemorySource records. Pure — nothing writes.
import type { MemoryRecord, ServiceTicket } from "@/domain/types";
import type {
  MemoryProposal,
  MemoryRecordV2,
  MemorySensitivity,
  MemorySource,
} from "@/domain/memory";
import { fromLegacyMemoryRecord, isMemoryRecordV2 } from "@/memory/adapters/legacyBridge";

/** sensitivities that stay hidden until an explicit, reasoned reveal */
export const HIDDEN_SENSITIVITIES: readonly MemorySensitivity[] = ["רגיש", "מוגבל"];

export function isHiddenSensitivity(sensitivity: MemorySensitivity): boolean {
  return HIDDEN_SENSITIVITIES.includes(sensitivity);
}

/** Does a (bridged) V2 memory record belong to this customer? */
export function memoryV2MatchesCustomer(
  record: MemoryRecordV2,
  customerId: string,
  customerName: string,
): boolean {
  if (record.entityLinks.some((l) => l.collection === "customers" && l.entityId === customerId)) {
    return true;
  }
  if (customerName.length === 0) return false;
  return (
    record.wikiLinks.includes(customerName) ||
    record.title.includes(customerName) ||
    record.plainText.includes(customerName)
  );
}

export interface CustomerMemoryEvidenceRef {
  sourceId: string;
  titleHe: string;
  excerpt: string;
  refId: string;
  verified: boolean;
}

/** derived classification — from tags/title only ("tagged accordingly") */
export type CustomerMemoryKind = "preference" | "follow-up" | null;

export function classifyCustomerMemory(record: MemoryRecordV2): CustomerMemoryKind {
  const hay = `${record.title} ${record.tags.join(" ")}`;
  if (/העדפ|תקשורת/.test(hay)) return "preference";
  if (/מעקב|הבטח/.test(hay)) return "follow-up";
  return null;
}

export interface Customer360MemoryDetail {
  id: string;
  title: string;
  version: number;
  sensitivity: MemorySensitivity;
  /** רגיש/מוגבל ⇒ body hidden behind an explicit reveal-with-reason */
  hiddenByDefault: boolean;
  tags: string[];
  folder: string;
  updatedAt: string;
  /** null = no NAMED approval exists (e.g. legacy import) — never invented */
  approvedBy: string | null;
  bodyMarkdown: string;
  kind: CustomerMemoryKind;
  /** real MemorySource records backing this memory (may be honestly empty) */
  evidence: CustomerMemoryEvidenceRef[];
  /** module-local navigation target for the versions/record view */
  memoryRoute: string;
}

export interface Customer360PendingDetail {
  id: string;
  title: string;
  status: string;
  observationHe: string;
}

export interface Customer360MemoryTabView {
  /** approved-only (default view) — non-sensitive first-class, sensitive gated */
  approved: Customer360MemoryDetail[];
  pending: Customer360PendingDetail[];
  /** interaction-derived observations (the proposals' raw observation text) */
  observations: string[];
  preferences: Customer360MemoryDetail[];
  followUps: Customer360MemoryDetail[];
  sensitiveCount: number;
}

function toDetail(
  record: MemoryRecordV2,
  sourceById: ReadonlyMap<string, MemorySource>,
): Customer360MemoryDetail {
  return {
    id: record.id,
    title: record.title,
    version: record.version,
    sensitivity: record.sensitivity,
    hiddenByDefault: isHiddenSensitivity(record.sensitivity),
    tags: record.tags,
    folder: record.folder,
    updatedAt: record.updatedAt,
    approvedBy: record.approvedBy,
    bodyMarkdown: record.bodyMarkdown,
    kind: classifyCustomerMemory(record),
    evidence: record.sourceIds
      .map((sid) => sourceById.get(sid))
      .filter((s): s is MemorySource => s !== undefined)
      .map((s) => ({
        sourceId: s.id,
        titleHe: s.titleHe,
        excerpt: s.excerpt,
        refId: s.refId,
        verified: s.verified,
      })),
    memoryRoute: `/memory?record=${record.id}`,
  };
}

/**
 * Everything the customer memory tab shows — pure derivation:
 * - approved = approvalState "מאושר", not archived, matched to the customer;
 * - pending = proposals still awaiting a decision for this customer;
 * - observations/preferences/follow-ups derived from real records only.
 */
export function customer360MemoryTabView(
  customerId: string,
  customerName: string,
  rawRecords: readonly (MemoryRecord | MemoryRecordV2)[],
  proposals: readonly MemoryProposal[],
  sources: readonly MemorySource[],
): Customer360MemoryTabView {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const bridged = rawRecords.map((r) => (isMemoryRecordV2(r) ? r : fromLegacyMemoryRecord(r)));
  const approved = bridged
    .filter(
      (r) =>
        r.approvalState === "מאושר" &&
        r.archivedAt === null &&
        memoryV2MatchesCustomer(r, customerId, customerName),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    .map((r) => toDetail(r, sourceById));

  const matchedProposals = proposals.filter((p) => {
    const draftMatch =
      p.draft.entityLinks.some(
        (l) => l.collection === "customers" && l.entityId === customerId,
      ) ||
      (customerName.length > 0 &&
        (p.draft.title.includes(customerName) || p.observationHe.includes(customerName)));
    return draftMatch;
  });
  const pending = matchedProposals
    .filter((p) => p.status === "ממתין לאישור" || p.status === "טיוטה")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    .map((p) => ({
      id: p.id,
      title: p.draft.title,
      status: p.status,
      observationHe: p.observationHe,
    }));

  return {
    approved,
    pending,
    observations: matchedProposals
      .map((p) => p.observationHe)
      .filter((o) => o.trim().length > 0),
    preferences: approved.filter((r) => r.kind === "preference"),
    followUps: approved.filter((r) => r.kind === "follow-up"),
    sensitiveCount: approved.filter((r) => r.hiddenByDefault).length,
  };
}

export interface RecurringCustomerIssue {
  printer: string;
  count: number;
  issues: string[];
}

/** per-customer recurring issues: ≥2 service tickets on the same printer */
export function recurringCustomerIssues(
  tickets: readonly ServiceTicket[],
): RecurringCustomerIssue[] {
  const byPrinter = new Map<string, ServiceTicket[]>();
  for (const t of tickets) {
    const list = byPrinter.get(t.printer) ?? [];
    list.push(t);
    byPrinter.set(t.printer, list);
  }
  return [...byPrinter.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([printer, list]) => ({
      printer,
      count: list.length,
      issues: [...new Set(list.map((t) => t.issue))],
    }))
    .sort((a, b) => b.count - a.count || a.printer.localeCompare(b.printer, "he"));
}
