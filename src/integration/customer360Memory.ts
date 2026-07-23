// W6-E — Customer-360 memory selector (Phase 6.17 data side).
// PURE derivation: approved customer-layer memory (the canonical
// memoryRecords collection) + pending memory proposals for one customer.
// Consumes W6-A's collections DIRECTLY with defensive typing — the concrete
// proposal shape belongs to the parallel memory workstream. The Integration
// Lead wires the UI tab (docs/integration-requests-w6e.md). Nothing here
// writes, approves, or mutates anything.
import type { MemoryRecord } from "@/domain/types";
import { asRecord, isPendingStatus, nested, str, strArray } from "./defensive";

export interface Customer360MemoryEntry {
  id: string;
  title: string;
  folder: string;
  tags: string[];
  updatedAt: string;
}

export interface Customer360PendingProposal {
  id: string;
  title: string;
  status: string;
}

export interface Customer360MemoryView {
  approved: Customer360MemoryEntry[];
  pending: Customer360PendingProposal[];
  approvedCount: number;
  pendingCount: number;
}

/** Does an approved memory record belong to this customer? (name/id match) */
export function memoryRecordMatchesCustomer(
  record: MemoryRecord,
  customerId: string,
  customerName: string,
): boolean {
  const fm = asRecord(record.frontmatter) ?? {};
  const fmCustomer = fm["customer"];
  const fmCustomerId = fm["customerId"];
  if (typeof fmCustomerId === "string" && fmCustomerId === customerId) return true;
  if (typeof fmCustomer === "string" && customerName.length > 0 && fmCustomer === customerName) {
    return true;
  }
  if (customerName.length > 0) {
    if (record.links.includes(customerName)) return true;
    if (record.title.includes(customerName)) return true;
  }
  return false;
}

/** Does an (unknown-shaped) proposal reference this customer? */
export function proposalMatchesCustomer(
  proposal: unknown,
  customerId: string,
  customerName: string,
): boolean {
  const direct =
    str(proposal, "customerId") === customerId ||
    (customerName.length > 0 && str(proposal, "customer") === customerName);
  if (direct) return true;
  const fm = nested(proposal, "frontmatter");
  if (fm) {
    if (fm["customerId"] === customerId) return true;
    if (customerName.length > 0 && fm["customer"] === customerName) return true;
  }
  const entityRef = str(proposal, "entityRef") ?? str(proposal, "sourceRef") ?? "";
  if (entityRef.includes(`customer:${customerId}`)) return true;
  const title = str(proposal, "title") ?? "";
  return customerName.length > 0 && title.includes(customerName);
}

/**
 * Approved customer-layer memory + pending proposals for one customer.
 * Derived only — the approval flow itself lives with W6-A's workflows.
 */
export function customer360MemoryView(
  customerId: string,
  customerName: string,
  memoryRecords: readonly MemoryRecord[],
  memoryProposals: readonly unknown[],
): Customer360MemoryView {
  const approved = memoryRecords
    .filter((m) => memoryRecordMatchesCustomer(m, customerId, customerName))
    .map((m) => ({
      id: m.id,
      title: m.title,
      folder: m.folder,
      tags: strArray(m, "tags"),
      updatedAt: m.updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const pending = memoryProposals
    .filter((p) => {
      const status = str(p, "status");
      return isPendingStatus(status) && proposalMatchesCustomer(p, customerId, customerName);
    })
    .map((p) => ({
      id: str(p, "id") ?? "(ללא מזהה)",
      title: str(p, "title") ?? "(ללא כותרת)",
      status: str(p, "status") ?? "ממתין",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { approved, pending, approvedCount: approved.length, pendingCount: pending.length };
}
