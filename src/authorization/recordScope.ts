// TERAGON vNext — centralized RECORD-SCOPE policy (Phase F hardening).
//
// Route access says WHICH modules a role may open; this says WHICH RECORDS a role
// may see inside them. It is the SINGLE source of the row-scope predicate — the
// homes/search call scopeRecords() rather than re-implementing filters, so the
// policy can never drift between surfaces.
//
// ENFORCEMENT REALITY (honest — see docs/vnext/RECORD_SCOPE.md):
//  • Tenant/organization isolation is enforced at the DB by Supabase RLS
//    (migrations 011/012, `organization_id = auth_org_id()`) — the TRUSTED server
//    boundary in a SUPABASE build.
//  • Per-USER record scope (a technician seeing only ASSIGNED jobs) is a portal
//    LEAST-PRIVILEGE policy. In the default LOCAL_INDEXEDDB/demo build the whole
//    dataset lives in the browser, so this policy is best-effort presentation, NOT
//    a hard boundary; the current RLS is org-level, not per-owner. Making it a hard
//    boundary requires per-owner RLS + a server (documented, deliberately NOT faked).
import type { BaseEntity } from "@/domain/types";
import type { Portal } from "./portals";

/** The record-scope identity for the active session (null = broad/manager). */
export interface RecordScope {
  readonly ownerId?: string;
  readonly studentId?: string;
}

/** Collections that carry a per-record owner/subject we scope on. */
type Scoped =
  | "tasks"
  | "serviceTickets"
  | "enrollments"
  | "customers"
  | "contacts"
  | "approvals";

function get<T extends BaseEntity>(r: T, key: string): string | null {
  const v = (r as unknown as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

/**
 * Scope a list of records for a portal + identity. Manager (null scope) sees the
 * full org-scoped set (its capability is the floor); Student/Technician get only
 * their own owner/subject rows; a surface a portal has no business seeing returns
 * [] (least privilege, never "all then hope a component filters").
 */
export function scopeRecords<T extends BaseEntity>(
  collection: Scoped | string,
  portal: Portal,
  scope: RecordScope | null,
  records: readonly T[],
): T[] {
  if (portal === "manager") return [...records]; // broad (org-scoped upstream)

  if (portal === "student") {
    if (collection === "enrollments") {
      return records.filter((r) => scope?.studentId != null && get(r, "studentId") === scope.studentId);
    }
    // students have no operational tasks/tickets/customers/approvals of their own
    return collection === "courses" ? [...records] : [];
  }

  // technician
  if (collection === "tasks" || collection === "serviceTickets") {
    return records.filter((r) => scope?.ownerId != null && get(r, "ownerId") === scope.ownerId);
  }
  if (collection === "customers" || collection === "contacts") {
    return [...records]; // job context — further narrowed by the caller to the ticket's customer
  }
  if (collection === "knowledgeArticles" || collection === "courses") return [...records];
  return []; // technician sees nothing else by default
}

/** Direct-object guard (IDOR): may this portal+identity see THIS single record? */
export function canSeeRecord<T extends BaseEntity>(
  collection: Scoped | string,
  portal: Portal,
  scope: RecordScope | null,
  record: T,
): boolean {
  return scopeRecords(collection, portal, scope, [record]).length === 1;
}
