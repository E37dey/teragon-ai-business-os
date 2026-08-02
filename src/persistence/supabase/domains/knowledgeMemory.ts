// Gate S4 — knowledge, memory & learning domain mappings.
// KnowledgeNote, Document, MemoryRecord. (The Wave 6+ governed-learning
// sub-collections are untyped IndexedDB keys with no zod schema and are deferred,
// exactly as noted in supabase/migrations/008.)
import type { Document, KnowledgeNote, MemoryRecord } from "@/domain/types";
import { documentSchema, knowledgeNoteSchema, memoryRecordSchema } from "@/domain/schemas";
import { defineMapping, fields, type AnyMapping } from "../mapping";

export const knowledgeMemoryMappings: AnyMapping[] = [
  defineMapping<KnowledgeNote>({
    collection: "knowledgeNotes",
    table: "knowledge_notes",
    idPrefix: "kn",
    schema: knowledgeNoteSchema,
    fields: fields({
      title: "title",
      category: "category",
      content: "content",
      sourceRef: "source_ref",
      approved: "approved",
      tags: "tags",
    }),
  }),
  defineMapping<Document>({
    collection: "documents",
    table: "documents",
    idPrefix: "doc",
    schema: documentSchema,
    fields: fields({
      name: "name",
      description: "description",
      type: "type",
      url: "url",
      courseId: "course_id",
      stageId: "stage_id",
      visible: "visible",
      ownerId: "owner_id",
    }),
  }),
  defineMapping<MemoryRecord>({
    collection: "memoryRecords",
    table: "memory_records",
    idPrefix: "mem",
    schema: memoryRecordSchema,
    fields: fields({
      title: "title",
      markdown: "markdown",
      frontmatter: "frontmatter",
      folder: "folder",
      tags: "tags",
      links: "links",
    }),
  }),
];
