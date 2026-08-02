-- ============================================================================
-- 008_knowledge_memory_learning.sql — TERAGON AI BUSINESS OS
-- Knowledge & memory: knowledge_notes, documents, memory_records.
-- Additive only. RLS enabled deny-by-default; policies are Gate S3.
--
-- SCOPE NOTE: the Wave 6+ governed-learning/knowledge/memory sub-collections
-- (knowledgeArticles, memoryProposals, learningRules, ...) are NOT among the 46
-- typed `interface X extends BaseEntity` entities in src/domain/types.ts — they
-- exist only as untyped IndexedDB collection keys. They are DEFERRED from Gate S2
-- (see the disposition table). This file migrates only the typed knowledge/memory
-- entities: KnowledgeNote, Document, MemoryRecord.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- knowledge_notes (domain: KnowledgeNote). tags[] embedded as JSONB.
-- ----------------------------------------------------------------------------
create table knowledge_notes (
  id               text primary key,
  organization_id  text not null references organizations(id),
  title            text not null,
  category         text not null default '',
  content          text not null default '',      -- markdown; [[wikilinks]] allowed
  source_ref       text,                            -- polymorphic ref, no FK
  approved         boolean not null default false,
  tags             jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table knowledge_notes is 'domain: KnowledgeNote. policies: see 012_rls_policies.sql';

create trigger trg_knowledge_notes_updated_at
  before update on knowledge_notes for each row execute function set_updated_at();
alter table knowledge_notes enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- documents (domain: Document)
-- ----------------------------------------------------------------------------
create table documents (
  id               text primary key,
  organization_id  text not null references organizations(id),
  name             text not null,
  description      text not null default '',
  type             text not null check (type in ('קובץ', 'קישור')),
  url              text,
  course_id        text references courses(id),
  -- stageId: LearningPathStage id (embedded, no FK target); null otherwise.
  stage_id         text,
  visible          boolean not null default true,
  owner_id         uuid not null references profiles(id),
  -- Wave 6 m007 — direct customer link (W3 request #4).
  customer_id      text references customers(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table documents is 'domain: Document. policies: see 012_rls_policies.sql';

create trigger trg_documents_updated_at
  before update on documents for each row execute function set_updated_at();
alter table documents enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- memory_records (domain: MemoryRecord). Obsidian-compatible md + frontmatter.
-- ----------------------------------------------------------------------------
create table memory_records (
  id               text primary key,
  organization_id  text not null references organizations(id),
  title            text not null,
  markdown         text not null default '',       -- md body; [[wikilinks]] allowed
  frontmatter      jsonb not null default '{}'::jsonb,
  folder           text not null default '',
  tags             jsonb not null default '[]'::jsonb,
  links            jsonb not null default '[]'::jsonb,  -- wikilink targets
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table memory_records is 'domain: MemoryRecord. policies: see 012_rls_policies.sql';

create trigger trg_memory_records_updated_at
  before update on memory_records for each row execute function set_updated_at();
alter table memory_records enable row level security;
-- policies: see 012_rls_policies.sql
