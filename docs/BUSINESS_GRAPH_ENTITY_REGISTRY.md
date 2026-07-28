# TERAGON Business Graph — Entity Registry (Phase 2)

Closed, exhaustive registry mapping every `GraphEntityType` to its canonical-derivation contract.
Source: `src/graph/registry/entityRegistry.ts`. **Declarative** — it describes *how* a node would be
derived (strategy descriptors), it does **not** read live records (no indexing in Phase 2).

## `EntityRegistryEntry`

| Field | Meaning |
|---|---|
| `entityType` | the `GraphEntityType` |
| `repository` | canonical collection key, or `null` for derived/embedded |
| `identifierField` | the record's id field |
| `organizationField` | the org field, or `null` (org resolved by policy) |
| `sensitivityStrategy` | discriminated descriptor: `{kind:'constant', value}` \| `{kind:'field', field}` |
| `lifecycleField` | status field name |
| `versionField` | version field, or `null` |
| `authoritativeStrategy` | `{kind:'always'}` \| `{kind:'field', field}` \| `{kind:'predicate', name}` (e.g. `isAuthoritative`) |
| `archiveField` / `supersedeField` | archive / supersede field, or `null` |
| `graphEligible` | whether the type is indexed at all |
| `payloadExposure` | `'envelope-safe'` \| `'protected'` (protected ⇒ body only via `ProtectedPayloadReference`) |
| `discriminator?` | field that disambiguates same-collection polymorphism |

`assertEntityRegistryExhaustive()` gives a **compile-time** guarantee that all 37 types have an entry
(a TypeScript exhaustiveness check), and `entityRegistryEntrySchema` validates each entry's shape.

## Ambiguity decisions encoded (duplicates NOT normalized in Phase 2)

- **Same-collection polymorphism carries an explicit `discriminator`** rather than being merged:
  `role` (canonical vs legacy in `roles`), `memoryRecord` (V2 vs legacy in `memoryRecords`, via
  `memoryLayer`), `governanceRisk` / `governanceIncident` (`source`/kind). Duplicates are **never
  normalized away** — they either use a discriminator or are marked `graphEligible:false`.
- **`payloadExposure:'protected'`** for the sensitive-body types (memory, knowledge, prompt-bearing) so
  their bodies never enter the node envelope.
- **`permission`** is absent (not a node); **`stageProgress`** absent (embedded).
- `printerModel`/`customerPrinter` and `agentRun`/`agentEvent` each have their own distinct entry.

## Core-v1 spine (15) — prioritized for the first index (later phase)

`customer, lead, opportunity, quotation, customerPrinter, printerModel, serviceTicket, knowledgeArticle,
aiRecommendation, approval, task, agentRun, course, enrollment, memoryRecord`.

These support the priority reasoning paths (follow-up, printer/service analysis, evidence paths,
approved recommendations, generated tasks, learning/memory evidence). The registry still defines **all
37** types; the spine is only an implementation-ordering marker for Phase 3+.

## Excluded / unresolved (reported, not forced)

- `permission` (capability, not node) · `stageProgress` (embedded).
- Legacy duplicate shapes (`Role`, `KnowledgeNote`, legacy `MemoryRecord`, legacy `Risk`) — represented
  via discriminator or `graphEligible:false`, never merged into their canonical counterpart in Phase 2.
- Records with no valid organization — surfaced as **unmappable** by `classifyOrganization` (see
  IDENTITY), never assigned an org.
