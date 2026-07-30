// TERAGON Business Graph — Phase 3 derivation tests.
// Proves: deterministic node/edge ids · deterministic sorting + serialization ·
// canonical FK-derived allowed / inferred never canonical · missing target ·
// cross-org · ambiguous name · org inheritance gating · sensitivity absence ·
// duplicate detection · cycle termination · archived/superseded representation ·
// identical input ⇒ identical output · all 37 statuses · Core-V1 coverage.
import { describe, expect, it } from "vitest";
import {
  DERIVATION_STATUS,
  GRAPH_ENTITY_TYPES,
  buildEdgeId,
  businessGraphEdgeSchema,
  businessGraphNodeSchema,
  deriveEntityGraph,
  deriveGraphEdges,
  deriveGraphNode,
  deriveOrganizationGraphSnapshot,
  resolveEdgeAuthority,
  validateDerivedGraph,
  type CanonicalRecord,
  type GraphDerivationContext,
  type GraphDerivationLookup,
  type GraphEntityType,
  type GraphLookupTarget,
} from "@/graph";
import {
  CUSTOMERS,
  CUSTOMER_PRINTERS,
  COURSES,
  ENROLLMENTS,
  LEADS,
  OPPORTUNITIES,
  PRINTER_MODELS,
  QUOTATIONS,
  SERVICE_TICKETS,
  REPAIR_ACTIONS,
  TASKS,
  KNOWLEDGE_NOTES,
  MEMORY_RECORDS,
  AI_RECOMMENDATIONS,
  APPROVALS,
  STUDENTS,
  USERS,
  AGENTS,
} from "@/repositories/seed/seedData";

const ORG = "org-teragon";

const context = (over: Partial<GraphDerivationContext> = {}): GraphDerivationContext => ({
  organizationId: ORG,
  registryVersion: "core-v2",
  sourceSnapshotVersion: "seed-2026-07-22",
  allowOrgInheritance: true,
  ...over,
});

// A permissive lookup: every referenced id "exists" in ORG unless overridden.
function makeLookup(over: {
  missing?: Set<string>;
  orgOf?: Record<string, string>;
  statusOf?: Record<string, string>;
} = {}): GraphDerivationLookup {
  const missing = over.missing ?? new Set<string>();
  return {
    exists: (_t, id) => !missing.has(id),
    get: (_t, id): GraphLookupTarget | undefined => {
      if (missing.has(id)) return undefined;
      return {
        organizationId: over.orgOf?.[id] ?? ORG,
        archived: false,
        superseded: false,
        rejected: false,
        status: over.statusOf?.[id] ?? null,
      };
    },
  };
}

const rec = (r: unknown): CanonicalRecord => r as CanonicalRecord;

describe("deriveGraphNode", () => {
  it("derives a deterministic node id via buildNodeId", () => {
    const out = deriveGraphNode(rec(CUSTOMERS[1]), "customer", { organizationId: ORG });
    expect(out.node).toBeDefined();
    expect(out.node?.id).toBe("teragon://org-3/customer/cu-2");
    // dates come from the SOURCE record, never the clock.
    expect(out.node?.createdAt).toBe((CUSTOMERS[1] as { createdAt: string }).createdAt);
    expect(businessGraphNodeSchema.safeParse(out.node).success).toBe(true);
  });

  it("carries NO sensitive body on the node envelope", () => {
    const out = deriveGraphNode(rec(MEMORY_RECORDS[0]), "memoryRecord", {
      organizationId: ORG,
      allowOrgInheritance: true,
    });
    expect(out.node).toBeDefined();
    const keys = Object.keys(out.node?.metadataSummary ?? {});
    for (const forbidden of ["markdown", "bodyMarkdown", "content", "body", "notes", "prompt"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("org inheritance works ONLY through an approved context (else MISSING_ORGANIZATION)", () => {
    // cu-1 has organizationId null → needs allowOrgInheritance.
    const denied = deriveGraphNode(rec(CUSTOMERS[0]), "customer", {
      organizationId: ORG,
      allowOrgInheritance: false,
    });
    expect(denied.node).toBeUndefined();
    expect(denied.unmappable?.reason).toBe("MISSING_ORGANIZATION");

    const allowed = deriveGraphNode(rec(CUSTOMERS[0]), "customer", {
      organizationId: ORG,
      allowOrgInheritance: true,
    });
    expect(allowed.node?.organizationId).toBe(ORG);
    expect(allowed.node?.metadataSummary.orgScopeInherited).toBe(true);
    expect(allowed.issues.some((i) => i.code === "ORG_SCOPE_INHERITED")).toBe(true);
  });

  it("represents archived + superseded records correctly (excluded from authoritative)", () => {
    const archived = {
      ...(MEMORY_RECORDS[0] as object),
      id: "memv2-arch",
      memoryLayer: "customer",
      organizationId: ORG,
      approvalState: "מאושר",
      archivedAt: "2026-07-01T00:00:00.000Z",
    };
    const out = deriveGraphNode(rec(archived), "memoryRecord", { organizationId: ORG });
    expect(out.node?.archived).toBe(true);
    expect(out.node?.authoritative).toBe(false);

    const superseded = {
      ...(MEMORY_RECORDS[0] as object),
      id: "memv2-sup",
      memoryLayer: "customer",
      organizationId: ORG,
      approvalState: "מאושר",
      supersedesId: "mem-old",
    };
    const sOut = deriveGraphNode(rec(superseded), "memoryRecord", { organizationId: ORG });
    expect(sOut.node?.superseded).toBe(true);
    expect(sOut.node?.authoritative).toBe(false);
  });

  it("refuses an EXCLUDED entity type", () => {
    const out = deriveGraphNode(rec({ id: "ae-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" }), "auditEvent", {
      organizationId: ORG,
    });
    expect(out.node).toBeUndefined();
    expect(out.unmappable?.reason).toBe("EXCLUDED_ENTITY");
  });
});

describe("deriveGraphEdges", () => {
  it("derives a deterministic edge id from stable values only", () => {
    const out = deriveGraphEdges(rec(CUSTOMER_PRINTERS[1]), "customerPrinter", makeLookup(), context());
    const owns = out.edges.find((e) => e.relationshipType === "OWNS");
    expect(owns).toBeDefined();
    const expected = buildEdgeId({
      organizationId: ORG,
      source: "teragon://org-teragon/customerPrinter/cp-2" as never,
      relationshipType: "OWNS",
      target: "teragon://org-teragon/customer/cu-2" as never,
      discriminator: "customerId",
    });
    expect(owns?.id).toBe(expected);
    // rebuilding with the same inputs yields the identical id (no time/position).
    expect(deriveGraphEdges(rec(CUSTOMER_PRINTERS[1]), "customerPrinter", makeLookup(), context()).edges[0]?.id).toBe(
      owns?.id,
    );
  });

  it("emits an issue and NO edge when the FK target is missing", () => {
    const out = deriveGraphEdges(
      rec(CUSTOMER_PRINTERS[0]),
      "customerPrinter",
      makeLookup({ missing: new Set(["cu-1"]) }),
      context(),
    );
    expect(out.edges.some((e) => e.relationshipType === "OWNS")).toBe(false);
    expect(out.issues.some((i) => i.code === "MISSING_TARGET")).toBe(true);
  });

  it("emits an issue and NO edge when the target is in another organization", () => {
    const out = deriveGraphEdges(
      rec(CUSTOMER_PRINTERS[0]),
      "customerPrinter",
      makeLookup({ orgOf: { "cu-1": "org-OTHER" } }),
      context(),
    );
    expect(out.edges.some((e) => e.relationshipType === "OWNS")).toBe(false);
    expect(out.issues.some((i) => i.code === "CROSS_ORGANIZATION")).toBe(true);
  });

  it("emits AMBIGUOUS_REFERENCE and NO authoritative edge for a name-based ref", () => {
    // legacy memory record has frontmatter.customer as a NAME (not an id).
    const out = deriveGraphEdges(rec(MEMORY_RECORDS[0]), "memoryRecord", makeLookup(), context());
    expect(out.issues.some((i) => i.code === "AMBIGUOUS_REFERENCE")).toBe(true);
    const authoritative = out.edges.filter((e) => e.authority === "CANONICAL" || e.authority === "DERIVED");
    expect(authoritative.every((e) => e.relationshipType !== "MENTIONED_IN")).toBe(true);
  });

  it("an inferred edge can never be canonical", () => {
    // task.relatedRef → INFERRED provenance; never CANONICAL even fully resolved.
    const task = TASKS.find((t) => t.relatedRef === "lead:l-10");
    const out = deriveGraphEdges(rec(task), "task", makeLookup(), context());
    const related = out.edges.find((e) => e.relationshipType === "RELATED_TO");
    expect(related?.provenance).toBe("INFERRED");
    expect(related?.authority).not.toBe("CANONICAL");
  });

  it("yields a CANONICAL edge for an EXPLICIT registry relationship (ENROLLED_IN)", () => {
    const out = deriveGraphEdges(rec(ENROLLMENTS[0]), "enrollment", makeLookup(), context());
    const enrolled = out.edges.find((e) => e.relationshipType === "ENROLLED_IN");
    expect(enrolled?.provenance).toBe("EXPLICIT");
    expect(enrolled?.authority).toBe("CANONICAL");
  });
});

describe("edge-authority policy (contract level)", () => {
  it("allows a FK-derived edge to reach CANONICAL under registry policy", () => {
    const decision = resolveEdgeAuthority({
      provenance: "FOREIGN_KEY_DERIVED",
      registryAuthoritative: true,
      sourceEligible: true,
      targetExists: true,
      sameOrganization: true,
      sourceArchived: false,
      sourceRejected: false,
      ambiguousResolution: false,
      approvalState: "none",
    });
    expect(decision.authority).toBe("CANONICAL");
  });

  it("caps an INFERRED edge at DERIVED (never CANONICAL)", () => {
    const decision = resolveEdgeAuthority({
      provenance: "INFERRED",
      registryAuthoritative: true,
      sourceEligible: true,
      targetExists: true,
      sameOrganization: true,
      sourceArchived: false,
      sourceRejected: false,
      ambiguousResolution: false,
      approvalState: "none",
    });
    expect(decision.authority).toBe("DERIVED");
  });
});

describe("determinism", () => {
  const snapshotRecords = () => buildSeedRecords();

  it("identical input ⇒ byte-equivalent serialized output", () => {
    const a = deriveOrganizationGraphSnapshot(snapshotRecords(), context());
    const b = deriveOrganizationGraphSnapshot(snapshotRecords(), context());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("sorts nodes/edges/issues by stable keys", () => {
    const r = deriveOrganizationGraphSnapshot(snapshotRecords(), context());
    const nodeIds = r.nodes.map((n) => n.id);
    expect([...nodeIds].sort((x, y) => x.localeCompare(y))).toEqual(nodeIds);
    const edgeIds = r.edges.map((e) => e.id);
    expect([...edgeIds].sort((x, y) => x.localeCompare(y))).toEqual(edgeIds);
  });

  it("a cycle does not break derivation (termination)", () => {
    const a = {
      id: "memc-a",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      title: "A",
      memoryLayer: "customer",
      organizationId: ORG,
      approvalState: "מאושר",
      supersedesId: "memc-b",
    };
    const b = {
      id: "memc-b",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      title: "B",
      memoryLayer: "customer",
      organizationId: ORG,
      approvalState: "מאושר",
      supersedesId: "memc-a",
    };
    const result = deriveOrganizationGraphSnapshot({ memoryRecords: [a, b] }, context());
    const supersedes = result.edges.filter((e) => e.relationshipType === "SUPERSEDES");
    expect(supersedes.length).toBe(2); // both directions derived, no infinite loop
  });
});

describe("deriveOrganizationGraphSnapshot", () => {
  const result = deriveOrganizationGraphSnapshot(buildSeedRecords(), context());

  it("produces nodes + edges from the seed fixture", () => {
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);
    for (const n of result.nodes) expect(businessGraphNodeSchema.safeParse(n).success).toBe(true);
    for (const e of result.edges) expect(businessGraphEdgeSchema.safeParse(e).success).toBe(true);
  });

  it("no sensitive body appears on ANY node in the snapshot", () => {
    for (const n of result.nodes) {
      for (const forbidden of ["markdown", "bodyMarkdown", "content", "body", "notes", "prompt", "plainText"]) {
        expect(forbidden in n.metadataSummary).toBe(false);
      }
    }
  });

  it("detects duplicate edges into duplicateEdges", () => {
    const cp = CUSTOMER_PRINTERS[0];
    const dup = deriveOrganizationGraphSnapshot(
      {
        customerPrinters: [cp as unknown as CanonicalRecord, { ...(cp as object) } as CanonicalRecord],
        customers: CUSTOMERS as unknown as CanonicalRecord[],
        printerModels: PRINTER_MODELS as unknown as CanonicalRecord[],
      },
      context(),
    );
    expect(dup.duplicateEdges.length).toBeGreaterThan(0);
    expect(dup.stats.duplicateEdges).toBe(dup.duplicateEdges.length);
  });
});

describe("validateDerivedGraph", () => {
  it("flags a dangling edge endpoint", () => {
    const base = deriveEntityGraph(rec(CUSTOMER_PRINTERS[0]), "customerPrinter", makeLookup(), context());
    // base has a customerPrinter node + edges to customer/printerModel that are
    // NOT in the node set → dangling endpoints.
    const validated = validateDerivedGraph(base);
    expect(validated.orphanReferences.some((i) => i.code === "DANGLING_ENDPOINT")).toBe(true);
  });

  it("re-validation is idempotent on serialized output", () => {
    const snap = deriveOrganizationGraphSnapshot(buildSeedRecords(), context());
    const once = validateDerivedGraph(snap);
    const twice = validateDerivedGraph(once);
    expect(JSON.stringify(once.nodes)).toBe(JSON.stringify(twice.nodes));
    expect(JSON.stringify(once.edges)).toBe(JSON.stringify(twice.edges));
  });
});

describe("coverage", () => {
  it("ALL 37 entity types have an explicit DERIVATION_STATUS", () => {
    for (const t of GRAPH_ENTITY_TYPES) {
      expect(DERIVATION_STATUS[t]).toBeDefined();
    }
    expect(Object.keys(DERIVATION_STATUS).length).toBe(37);
    expect(GRAPH_ENTITY_TYPES.length).toBe(37);
  });

  it("the 15 Core-V1 types are IMPLEMENTED", () => {
    const core: GraphEntityType[] = [
      "customer",
      "lead",
      "opportunity",
      "quotation",
      "customerPrinter",
      "printerModel",
      "serviceTicket",
      "knowledgeArticle",
      "aiRecommendation",
      "approval",
      "task",
      "agentRun",
      "course",
      "enrollment",
      "memoryRecord",
    ];
    for (const t of core) expect(DERIVATION_STATUS[t]).toBe("IMPLEMENTED");
  });

  it("each Core-V1 type yields at least a node from a fixture", () => {
    const cases: { type: GraphEntityType; record: unknown }[] = [
      { type: "customer", record: CUSTOMERS[1] },
      { type: "lead", record: LEADS[0] },
      { type: "opportunity", record: OPPORTUNITIES[0] },
      { type: "quotation", record: QUOTATIONS[0] },
      { type: "customerPrinter", record: CUSTOMER_PRINTERS[0] },
      { type: "printerModel", record: PRINTER_MODELS[0] },
      { type: "serviceTicket", record: SERVICE_TICKETS[0] },
      { type: "knowledgeArticle", record: KNOWLEDGE_NOTES[0] },
      { type: "aiRecommendation", record: AI_RECOMMENDATIONS[0] },
      { type: "approval", record: APPROVALS[0] },
      { type: "task", record: TASKS[0] },
      {
        type: "agentRun",
        record: {
          id: "run-1",
          createdAt: "2026-07-20T09:00:00.000Z",
          updatedAt: "2026-07-20T09:05:00.000Z",
          status: "הושלם",
          taskIds: ["task-1"],
        },
      },
      { type: "course", record: COURSES[0] },
      { type: "enrollment", record: ENROLLMENTS[0] },
      { type: "memoryRecord", record: MEMORY_RECORDS[0] },
    ];
    for (const c of cases) {
      const out = deriveGraphNode(rec(c.record), c.type, {
        organizationId: ORG,
        allowOrgInheritance: true,
      });
      expect(out.node, `expected a node for ${c.type}`).toBeDefined();
      expect(out.node?.entityType).toBe(c.type);
    }
  });
});

// ---------------------------------------------------------------------------
// seed → records-by-collection map (collection key = registry repository)
// ---------------------------------------------------------------------------

function buildSeedRecords(): Partial<Record<string, CanonicalRecord[]>> {
  return {
    customers: CUSTOMERS as unknown as CanonicalRecord[],
    leads: LEADS as unknown as CanonicalRecord[],
    opportunities: OPPORTUNITIES as unknown as CanonicalRecord[],
    quotations: QUOTATIONS as unknown as CanonicalRecord[],
    customerPrinters: CUSTOMER_PRINTERS as unknown as CanonicalRecord[],
    printerModels: PRINTER_MODELS as unknown as CanonicalRecord[],
    serviceTickets: SERVICE_TICKETS as unknown as CanonicalRecord[],
    repairActions: REPAIR_ACTIONS as unknown as CanonicalRecord[],
    knowledgeArticles: KNOWLEDGE_NOTES as unknown as CanonicalRecord[],
    aiRecommendations: AI_RECOMMENDATIONS as unknown as CanonicalRecord[],
    approvals: APPROVALS as unknown as CanonicalRecord[],
    tasks: TASKS as unknown as CanonicalRecord[],
    courses: COURSES as unknown as CanonicalRecord[],
    enrollments: ENROLLMENTS as unknown as CanonicalRecord[],
    students: STUDENTS as unknown as CanonicalRecord[],
    users: USERS as unknown as CanonicalRecord[],
    agents: AGENTS as unknown as CanonicalRecord[],
    memoryRecords: MEMORY_RECORDS as unknown as CanonicalRecord[],
  };
}
