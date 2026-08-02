// Gate S4 — CRM / sales domain mappings.
// Customer, Contact, Lead, Opportunity, Quotation.
import type { Contact, Customer, Lead, Opportunity, Quotation } from "@/domain/types";
import {
  contactSchema,
  customerSchema,
  leadSchema,
  opportunitySchema,
  quotationSchema,
} from "@/domain/schemas";
import { defineMapping, fields, type AnyMapping } from "../mapping";

export const crmMappings: AnyMapping[] = [
  defineMapping<Customer>({
    collection: "customers",
    table: "customers",
    idPrefix: "cu",
    schema: customerSchema,
    fields: fields({
      name: "name",
      type: "type",
      phone: "phone",
      email: "email",
      city: "city",
      // domain Customer.organizationId is the OPTIONAL owning org — a distinct
      // column from the tenant `organization_id` (auto-injected by the mapper).
      organizationId: "owning_org_id",
      printerSummary: "printer_summary",
      courseNames: "course_names",
      revenue: "revenue",
      contactState: "contact_state",
      review: "review",
      status: "status",
    }),
  }),
  defineMapping<Contact>({
    collection: "contacts",
    table: "contacts",
    idPrefix: "ct",
    schema: contactSchema,
    fields: fields({
      customerId: "customer_id",
      name: "name",
      role: "role",
      phone: "phone",
      email: "email",
      isPrimary: "is_primary",
    }),
  }),
  defineMapping<Lead>({
    collection: "leads",
    table: "leads",
    idPrefix: "ld",
    schema: leadSchema,
    fields: fields({
      name: "name",
      phone: "phone",
      email: "email",
      source: "source",
      interest: "interest",
      status: "status",
      ownerId: "owner_id",
      followUp: "follow_up",
      notes: "notes",
      history: "history",
    }),
  }),
  defineMapping<Opportunity>({
    collection: "opportunities",
    table: "opportunities",
    idPrefix: "op",
    schema: opportunitySchema,
    fields: fields({
      name: "name",
      leadId: "lead_id",
      customerId: "customer_id",
      stage: "stage",
      amount: "amount",
      expectedClose: "expected_close",
      ownerId: "owner_id",
      notes: "notes",
    }),
  }),
  defineMapping<Quotation>({
    collection: "quotations",
    table: "quotations",
    idPrefix: "qt",
    schema: quotationSchema,
    fields: fields({
      customerName: "customer_name",
      customerId: "customer_id",
      title: "title",
      lines: "lines",
      discountPercent: "discount_percent",
      terms: "terms",
      validUntil: "valid_until",
      status: "status",
      ownerId: "owner_id",
    }),
  }),
];
