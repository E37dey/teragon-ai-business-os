// Gate S4 — tasks & approvals domain mappings.
// Task, Approval.
import type { Approval, Task } from "@/domain/types";
import { approvalSchema, taskSchema } from "@/domain/schemas";
import { defineMapping, fields, type AnyMapping } from "../mapping";

export const tasksApprovalsMappings: AnyMapping[] = [
  defineMapping<Task>({
    collection: "tasks",
    table: "tasks",
    idPrefix: "tk",
    schema: taskSchema,
    fields: fields({
      title: "title",
      description: "description",
      status: "status",
      priority: "priority",
      due: "due",
      ownerId: "owner_id",
      relatedRef: "related_ref",
      sourceRecommendationId: "source_recommendation_id",
    }),
  }),
  defineMapping<Approval>({
    collection: "approvals",
    table: "approvals",
    idPrefix: "ap",
    schema: approvalSchema,
    fields: fields({
      subjectRef: "subject_ref",
      requestedById: "requested_by_id",
      requestedAt: "requested_at",
      status: "status",
      decidedById: "decided_by_id",
      decidedAt: "decided_at",
      note: "note",
    }),
  }),
];
