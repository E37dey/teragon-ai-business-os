// Global search — pure text matching across entity collections. Each collection
// contributes typed hits with a Hebrew kind label and a route the shell can link to.
import type {
  Agent,
  Course,
  Customer,
  CustomerPrinter,
  Document,
  KnowledgeNote,
  Lead,
  MemoryRecord,
  Organization,
  PrinterModel,
  Quotation,
  ServiceTicket,
  Student,
  Task,
} from "../types";

export interface SearchHit {
  /** Hebrew entity-kind label, e.g. "ליד" */
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  route: string;
}

export interface SearchableData {
  customers?: readonly Customer[];
  leads?: readonly Lead[];
  quotations?: readonly Quotation[];
  tickets?: readonly ServiceTicket[];
  courses?: readonly Course[];
  agents?: readonly Agent[];
  documents?: readonly Document[];
  knowledgeNotes?: readonly KnowledgeNote[];
  tasks?: readonly Task[];
}

function matches(query: string, ...fields: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return false;
  return fields.some((f) => f !== undefined && f.toLowerCase().includes(q));
}

export function globalSearch(data: SearchableData, query: string, limit = 20): SearchHit[] {
  const hits: SearchHit[] = [];
  const q = query.trim();
  if (q === "") return hits;

  for (const c of data.customers ?? []) {
    if (matches(q, c.name, c.email, c.phone, c.city)) {
      hits.push({
        kind: "לקוח",
        id: c.id,
        title: c.name,
        subtitle: `${c.type} · ${c.city}`,
        route: `/customers/${c.id}`,
      });
    }
  }
  for (const l of data.leads ?? []) {
    if (matches(q, l.name, l.email, l.phone, l.interest, l.notes)) {
      hits.push({
        kind: "ליד",
        id: l.id,
        title: l.name,
        subtitle: `${l.interest} · ${l.status}`,
        route: "/crm",
      });
    }
  }
  for (const t of data.tickets ?? []) {
    if (matches(q, t.customerName, t.printer, t.issue, t.description)) {
      hits.push({
        kind: "קריאת שירות",
        id: t.id,
        title: `${t.customerName} — ${t.issue}`,
        subtitle: t.status,
        route: "/service",
      });
    }
  }
  for (const qu of data.quotations ?? []) {
    if (matches(q, qu.customerName, qu.title, ...qu.lines.map((li) => li.description))) {
      hits.push({
        kind: "הצעת מחיר",
        id: qu.id,
        title: qu.title,
        subtitle: `${qu.customerName} · ${qu.status}`,
        route: "/sales",
      });
    }
  }
  for (const c of data.courses ?? []) {
    if (matches(q, c.name, c.type, c.blurb)) {
      hits.push({ kind: "קורס", id: c.id, title: c.name, subtitle: c.status, route: "/courses" });
    }
  }
  for (const a of data.agents ?? []) {
    if (matches(q, a.name, a.purpose)) {
      hits.push({ kind: "סוכן", id: a.id, title: a.name, subtitle: a.status, route: "/agents" });
    }
  }
  for (const doc of data.documents ?? []) {
    if (matches(q, doc.name, doc.description)) {
      hits.push({
        kind: "מסמך",
        id: doc.id,
        title: doc.name,
        subtitle: doc.type,
        route: "/documents",
      });
    }
  }
  for (const kn of data.knowledgeNotes ?? []) {
    if (matches(q, kn.title, kn.content, ...kn.tags)) {
      hits.push({
        kind: "רשומת ידע",
        id: kn.id,
        title: kn.title,
        subtitle: kn.category,
        route: "/knowledge",
      });
    }
  }
  for (const task of data.tasks ?? []) {
    if (matches(q, task.title, task.description)) {
      hits.push({
        kind: "משימה",
        id: task.id,
        title: task.title,
        subtitle: task.status,
        route: "/tasks",
      });
    }
  }

  return hits.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Ranked global search (Wave 2) — deterministic ranking over 13 collections.
// Match strength: exact > startsWith > contains; ties broken by entity
// priority, then recency (updatedAt desc), then id. Pure & fully unit-tested.
// ---------------------------------------------------------------------------

export type MatchType = "exact" | "startsWith" | "contains";

const MATCH_WEIGHT: Record<MatchType, number> = { exact: 3, startsWith: 2, contains: 1 };

export interface RankedSearchHit {
  /** Hebrew entity-kind label, e.g. "לקוח" */
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  /** destination route */
  route: string;
  /** Hebrew label of the field that matched, e.g. "טלפון" */
  matchedField: string;
  matchType: MatchType;
  /** status chip text when the entity has a meaningful status */
  status: string | null;
  updatedAt: string;
}

export interface RankedSearchData {
  customers?: readonly Customer[];
  leads?: readonly Lead[];
  organizations?: readonly Organization[];
  quotations?: readonly Quotation[];
  printerModels?: readonly PrinterModel[];
  customerPrinters?: readonly CustomerPrinter[];
  courses?: readonly Course[];
  students?: readonly Student[];
  tickets?: readonly ServiceTicket[];
  tasks?: readonly Task[];
  documents?: readonly Document[];
  knowledgeNotes?: readonly KnowledgeNote[];
  memoryRecords?: readonly MemoryRecord[];
}

/** classify how `value` matches `query` (both compared lowercase, trimmed) */
export function classifyMatch(query: string, value: string | null | undefined): MatchType | null {
  if (value === null || value === undefined) return null;
  const q = query.trim().toLowerCase();
  const v = value.trim().toLowerCase();
  if (q === "" || v === "") return null;
  if (v === q) return "exact";
  if (v.startsWith(q)) return "startsWith";
  if (v.includes(q)) return "contains";
  return null;
}

interface SearchField {
  label: string;
  value: string | null | undefined;
}

/** best match across an entity's fields (field order breaks match-type ties) */
function bestFieldMatch(
  query: string,
  fields: readonly SearchField[],
): { field: string; type: MatchType } | null {
  let best: { field: string; type: MatchType } | null = null;
  for (const f of fields) {
    const type = classifyMatch(query, f.value);
    if (type && (best === null || MATCH_WEIGHT[type] > MATCH_WEIGHT[best.type])) {
      best = { field: f.label, type };
      if (type === "exact") break;
    }
  }
  return best;
}

interface Candidate extends RankedSearchHit {
  entityPriority: number;
}

function collect(
  out: Candidate[],
  query: string,
  entityPriority: number,
  base: Omit<RankedSearchHit, "matchedField" | "matchType">,
  fields: readonly SearchField[],
): void {
  const match = bestFieldMatch(query, fields);
  if (match) {
    out.push({ ...base, matchedField: match.field, matchType: match.type, entityPriority });
  }
}

/**
 * rankedSearch — the Wave-2 global search. Deterministic: same data + query ⇒
 * same ordered results. Empty query ⇒ empty result (never a fake "all").
 */
export function rankedSearch(data: RankedSearchData, query: string, limit = 30): RankedSearchHit[] {
  const q = query.trim();
  if (q === "") return [];
  const out: Candidate[] = [];

  for (const c of data.customers ?? []) {
    collect(
      out,
      q,
      1,
      {
        kind: "לקוח",
        id: c.id,
        title: c.name,
        subtitle: `${c.type} · ${c.city}`,
        route: `/customers/${c.id}`,
        status: c.contactState,
        updatedAt: c.updatedAt,
      },
      [
        { label: "שם", value: c.name },
        { label: "אימייל", value: c.email },
        { label: "טלפון", value: c.phone },
        { label: "עיר", value: c.city },
        { label: "מדפסות", value: c.printerSummary },
      ],
    );
  }

  for (const l of data.leads ?? []) {
    collect(
      out,
      q,
      2,
      {
        kind: "ליד",
        id: l.id,
        title: l.name,
        subtitle: `${l.interest} · ${l.source}`,
        route: "/crm",
        status: l.status,
        updatedAt: l.updatedAt,
      },
      [
        { label: "שם", value: l.name },
        { label: "אימייל", value: l.email },
        { label: "טלפון", value: l.phone },
        { label: "תחום עניין", value: l.interest },
        { label: "הערות", value: l.notes },
      ],
    );
  }

  for (const o of data.organizations ?? []) {
    collect(
      out,
      q,
      3,
      {
        kind: "ארגון",
        id: o.id,
        title: o.name,
        subtitle: `${o.type} · ${o.city}`,
        route: "/organizations",
        status: o.status,
        updatedAt: o.updatedAt,
      },
      [
        { label: "שם", value: o.name },
        { label: "אימייל", value: o.email },
        { label: "טלפון", value: o.phone },
        { label: "עיר", value: o.city },
      ],
    );
  }

  for (const qu of data.quotations ?? []) {
    collect(
      out,
      q,
      4,
      {
        kind: "הצעת מחיר",
        id: qu.id,
        title: qu.title,
        subtitle: `${qu.customerName} · ${qu.id.toUpperCase()}`,
        route: "/sales",
        status: qu.status,
        updatedAt: qu.updatedAt,
      },
      [
        { label: "מספר הצעה", value: qu.id },
        { label: "כותרת", value: qu.title },
        { label: "לקוח", value: qu.customerName },
        ...qu.lines.map((li) => ({ label: "שורת הצעה", value: li.description })),
      ],
    );
  }

  const modelById = new Map<string, PrinterModel>();
  for (const pm of data.printerModels ?? []) {
    modelById.set(pm.id, pm);
    collect(
      out,
      q,
      5,
      {
        kind: "דגם מדפסת",
        id: pm.id,
        title: pm.name,
        subtitle: `${pm.manufacturer} · ${pm.technology}`,
        route: "/printers",
        status: null,
        updatedAt: pm.updatedAt,
      },
      [
        { label: "שם דגם", value: pm.name },
        { label: "יצרן", value: pm.manufacturer },
        ...pm.tags.map((t) => ({ label: "תגית", value: t })),
      ],
    );
  }

  for (const cp of data.customerPrinters ?? []) {
    const model = modelById.get(cp.printerModelId);
    collect(
      out,
      q,
      6,
      {
        kind: "מדפסת לקוח",
        id: cp.id,
        title: model ? `${model.name} — ${cp.serialNumber}` : cp.serialNumber,
        subtitle: cp.underWarranty ? "באחריות" : "לא באחריות",
        route: "/printers",
        status: null,
        updatedAt: cp.updatedAt,
      },
      [
        { label: "מספר סידורי", value: cp.serialNumber },
        { label: "הערות", value: cp.notes },
      ],
    );
  }

  for (const c of data.courses ?? []) {
    collect(
      out,
      q,
      7,
      {
        kind: "קורס",
        id: c.id,
        title: c.name,
        subtitle: c.type,
        route: "/courses",
        status: c.status,
        updatedAt: c.updatedAt,
      },
      [
        { label: "שם קורס", value: c.name },
        { label: "סוג", value: c.type },
        { label: "תיאור", value: c.blurb },
      ],
    );
  }

  for (const s of data.students ?? []) {
    collect(
      out,
      q,
      8,
      {
        kind: "תלמיד",
        id: s.id,
        title: s.name,
        subtitle: s.email,
        route: "/courses",
        status: s.status,
        updatedAt: s.updatedAt,
      },
      [
        { label: "שם", value: s.name },
        { label: "אימייל", value: s.email },
        { label: "טלפון", value: s.phone },
      ],
    );
  }

  for (const t of data.tickets ?? []) {
    collect(
      out,
      q,
      9,
      {
        kind: "קריאת שירות",
        id: t.id,
        title: `${t.customerName} — ${t.issue}`,
        subtitle: t.printer,
        route: "/service",
        status: t.status,
        updatedAt: t.updatedAt,
      },
      [
        { label: "מספר קריאה", value: t.id },
        { label: "לקוח", value: t.customerName },
        { label: "מדפסת", value: t.printer },
        { label: "תקלה", value: t.issue },
        { label: "תיאור", value: t.description },
      ],
    );
  }

  for (const task of data.tasks ?? []) {
    collect(
      out,
      q,
      10,
      {
        kind: "משימה",
        id: task.id,
        title: task.title,
        subtitle: `יעד: ${task.due}`,
        route: "/tasks",
        status: task.status,
        updatedAt: task.updatedAt,
      },
      [
        { label: "כותרת", value: task.title },
        { label: "תיאור", value: task.description },
      ],
    );
  }

  for (const doc of data.documents ?? []) {
    collect(
      out,
      q,
      11,
      {
        kind: "מסמך",
        id: doc.id,
        title: doc.name,
        subtitle: doc.type,
        route: "/documents",
        status: null,
        updatedAt: doc.updatedAt,
      },
      [
        { label: "שם מסמך", value: doc.name },
        { label: "תיאור", value: doc.description },
      ],
    );
  }

  for (const kn of data.knowledgeNotes ?? []) {
    collect(
      out,
      q,
      12,
      {
        kind: "רשומת ידע",
        id: kn.id,
        title: kn.title,
        subtitle: kn.category,
        route: "/knowledge",
        status: kn.approved ? "מאושרת" : "טיוטה",
        updatedAt: kn.updatedAt,
      },
      [
        { label: "כותרת", value: kn.title },
        { label: "תוכן", value: kn.content },
        ...kn.tags.map((t) => ({ label: "תגית", value: t })),
      ],
    );
  }

  for (const mem of data.memoryRecords ?? []) {
    collect(
      out,
      q,
      13,
      {
        kind: "זיכרון ארגוני",
        id: mem.id,
        title: mem.title,
        subtitle: mem.folder,
        route: "/memory",
        status: null,
        updatedAt: mem.updatedAt,
      },
      [
        { label: "כותרת", value: mem.title },
        { label: "תוכן", value: mem.markdown },
        ...mem.tags.map((t) => ({ label: "תגית", value: t })),
      ],
    );
  }

  out.sort((a, b) => {
    const w = MATCH_WEIGHT[b.matchType] - MATCH_WEIGHT[a.matchType];
    if (w !== 0) return w;
    if (a.entityPriority !== b.entityPriority) return a.entityPriority - b.entityPriority;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return out.slice(0, limit).map(({ entityPriority: _p, ...hit }) => hit);
}
