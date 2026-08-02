// Gate S4 — service domain mappings + atomic ticket-close RPC.
// ServiceTicket ↔ service_tickets.
//
// ATOMIC MULTI-ROW WRITE: closing a ticket AND recording its repair action must
// be one transaction (ticket status/closedAt update + repair_actions insert). We
// do NOT issue two client writes (a partial failure would desync). Instead we
// call a single Postgres RPC (`close_ticket_with_repair`) that commits/rolls
// back atomically. See `closeTicketWithRepair`.
import type { ServiceTicket } from "@/domain/types";
import { serviceTicketSchema } from "@/domain/schemas";
import { callRpc } from "../rpc";
import type { SupabaseLike } from "../db";
import { defineMapping, fields, type AnyMapping } from "../mapping";
import type { RepoResult } from "../../result";

export const serviceMappings: AnyMapping[] = [
  defineMapping<ServiceTicket>({
    collection: "serviceTickets",
    table: "service_tickets",
    idPrefix: "st",
    schema: serviceTicketSchema,
    fields: fields({
      customerName: "customer_name",
      customerId: "customer_id",
      printer: "printer",
      issue: "issue",
      description: "description",
      priority: "priority",
      status: "status",
      openedAt: "opened_at",
      ownerId: "owner_id",
      solution: "solution",
      customerPrinterId: "customer_printer_id",
      faultCategory: "fault_category",
    }),
  }),
];

export interface CloseTicketWithRepairInput {
  ticketId: string;
  solution: string;
  closedAt: string;
  repair: {
    id: string;
    description: string;
    performedById: string;
    performedAt: string;
    partsCost: number;
  };
}

/**
 * Atomically close a ticket and append its repair action via a single Postgres
 * transaction (RPC). Returns the closed ticket id, or a SAFE error — never a
 * partial write, never a raw driver error.
 */
export function closeTicketWithRepair(
  client: SupabaseLike,
  organizationId: string,
  input: CloseTicketWithRepairInput,
): Promise<RepoResult<{ ticketId: string }>> {
  return callRpc(
    client,
    "close_ticket_with_repair",
    {
      p_organization_id: organizationId,
      p_ticket_id: input.ticketId,
      p_solution: input.solution,
      p_closed_at: input.closedAt,
      p_repair_id: input.repair.id,
      p_repair_description: input.repair.description,
      p_performed_by_id: input.repair.performedById,
      p_performed_at: input.repair.performedAt,
      p_parts_cost: input.repair.partsCost,
    },
    (value) => {
      if (typeof value === "object" && value !== null && "ticket_id" in value) {
        return { ticketId: String((value as Record<string, unknown>).ticket_id) };
      }
      return null;
    },
  );
}
