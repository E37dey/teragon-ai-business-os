// Global search — pure text matching across entity collections. Each collection
// contributes typed hits with a Hebrew kind label and a route the shell can link to.
import type {
  Agent,
  Course,
  Customer,
  Document,
  KnowledgeNote,
  Lead,
  Quotation,
  ServiceTicket,
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
      hits.push({ kind: "לקוח", id: c.id, title: c.name, subtitle: `${c.type} · ${c.city}`, route: `/customers/${c.id}` });
    }
  }
  for (const l of data.leads ?? []) {
    if (matches(q, l.name, l.email, l.phone, l.interest, l.notes)) {
      hits.push({ kind: "ליד", id: l.id, title: l.name, subtitle: `${l.interest} · ${l.status}`, route: "/crm" });
    }
  }
  for (const t of data.tickets ?? []) {
    if (matches(q, t.customerName, t.printer, t.issue, t.description)) {
      hits.push({ kind: "קריאת שירות", id: t.id, title: `${t.customerName} — ${t.issue}`, subtitle: t.status, route: "/service" });
    }
  }
  for (const qu of data.quotations ?? []) {
    if (matches(q, qu.customerName, qu.title, ...qu.lines.map((li) => li.description))) {
      hits.push({ kind: "הצעת מחיר", id: qu.id, title: qu.title, subtitle: `${qu.customerName} · ${qu.status}`, route: "/sales" });
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
      hits.push({ kind: "מסמך", id: doc.id, title: doc.name, subtitle: doc.type, route: "/documents" });
    }
  }
  for (const kn of data.knowledgeNotes ?? []) {
    if (matches(q, kn.title, kn.content, ...kn.tags)) {
      hits.push({ kind: "רשומת ידע", id: kn.id, title: kn.title, subtitle: kn.category, route: "/knowledge" });
    }
  }
  for (const task of data.tasks ?? []) {
    if (matches(q, task.title, task.description)) {
      hits.push({ kind: "משימה", id: task.id, title: task.title, subtitle: task.status, route: "/tasks" });
    }
  }

  return hits.slice(0, limit);
}
