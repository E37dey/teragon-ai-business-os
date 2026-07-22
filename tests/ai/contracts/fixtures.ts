// Shared deterministic fixtures for the W5-A AI contract tests.
import type {
  Activity,
  AIRecommendation,
  Course,
  Customer,
  Enrollment,
  Evidence,
  Lead,
  LearningPath,
  Meeting,
  PrinterModel,
  Product,
  Quotation,
  ServiceTicket,
  Task,
  User,
} from "@/domain/types";
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import type { AIRequest } from "@/ai/contracts/AIProvider";
import type { LocalDataAccess } from "@/ai/providers/LocalRulesProvider";

export const FIXED_NOW = "2026-07-23T10:00:00.000Z";

const base = { createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-21T08:00:00.000Z" };

export const LEADS: Lead[] = [
  {
    ...base,
    id: "lead-1",
    name: "דנה כהן",
    phone: "050-0000001",
    email: "dana@example.com",
    source: "אתר",
    interest: "קורס Fusion 360",
    status: "חדש",
    ownerId: "user-1",
    followUp: "2026-07-24",
    notes: "מבקשת פרטים דחוף השבוע",
    history: [],
  },
  {
    ...base,
    id: "lead-2",
    name: "יוסי לוי",
    phone: "050-0000002",
    email: "yossi@example.com",
    source: "טלפון",
    interest: "רכישת מדפסת",
    status: "נוצר קשר",
    ownerId: "user-1",
    followUp: "2026-07-25",
    notes: "מתלבט בין דגמים",
    history: [],
  },
  {
    ...base,
    id: "lead-old",
    createdAt: "2026-06-01T08:00:00.000Z",
    name: "ליד ישן",
    phone: "050-0000003",
    email: "old@example.com",
    source: "אתר",
    interest: "אחר",
    status: "לא רלוונטי",
    ownerId: "user-1",
    followUp: "2026-06-10",
    notes: "",
    history: [],
  },
];

export const CUSTOMERS: Customer[] = [
  {
    ...base,
    id: "cu-1",
    name: "בית ספר אורט",
    type: "בית ספר",
    phone: "03-0000000",
    email: "ort@example.com",
    city: "תל אביב",
    organizationId: null,
    printerSummary: "2× Bambu Lab X1C",
    courseNames: ["מבוא להדפסת תלת-ממד"],
    revenue: 42000,
    contactState: "פעיל",
    review: null,
    status: "פעיל",
  },
];

export const COURSES: Course[] = [
  {
    ...base,
    id: "course-1",
    name: "מבוא להדפסת תלת-ממד",
    type: "מבוא",
    start: "2026-08-01",
    end: "2026-09-01",
    price: 1200,
    status: "פתוח להרשמה",
    zoom: "",
    instructorId: "user-2",
    isAI: false,
    blurb: "",
  },
  {
    ...base,
    id: "course-2",
    name: "Fusion 360 מתקדם",
    type: "מתקדם",
    start: "2026-08-15",
    end: "2026-10-01",
    price: 1800,
    status: "פתוח להרשמה",
    zoom: "",
    instructorId: "user-2",
    isAI: true,
    blurb: "",
  },
];

export const PRINTER_MODELS: PrinterModel[] = [
  {
    ...base,
    id: "pm-1",
    name: "Bambu Lab X1C",
    manufacturer: "Bambu Lab",
    technology: "FDM",
    price: 6500,
    tags: ["מקצועי", "חלקים טכניים"],
    note: "",
  },
  {
    ...base,
    id: "pm-2",
    name: "Prusa Mini",
    manufacturer: "Prusa",
    technology: "FDM",
    price: 2200,
    tags: ["תחביב", "לימודים"],
    note: "",
  },
  {
    ...base,
    id: "pm-3",
    name: "Elegoo Mars 4",
    manufacturer: "Elegoo",
    technology: "רזין",
    price: 1500,
    tags: ["מיניאטורות"],
    note: "",
  },
];

export const MEETINGS: Meeting[] = [
  {
    ...base,
    id: "meet-1",
    title: "פגישת צוות שבועית",
    scheduledAt: "2026-07-24T09:00:00.000Z",
    durationMinutes: 45,
    location: "משרד",
    participantIds: ["user-1"],
    agenda: "סטטוס לידים",
    relatedRef: null,
  },
];

export const ACTIVITIES: Activity[] = [
  {
    ...base,
    id: "act-1",
    kind: "ליד",
    text: "נוצר ליד חדש",
    actorId: "user-1",
    entityRef: "lead:lead-1",
    at: "2026-07-20T09:00:00.000Z",
  },
  {
    ...base,
    id: "act-2",
    kind: "הצעת מחיר",
    text: "נשלחה הצעה",
    actorId: "user-1",
    entityRef: null,
    at: "2026-07-21T09:00:00.000Z",
  },
];

export const AI_RECOMMENDATIONS: AIRecommendation[] = [
  {
    ...base,
    id: "rec-1",
    agentId: "agent-1",
    title: "לתעדף את הליד דנה כהן",
    reason: "מעקב מתוכנן מחר והדחיפות גבוהה",
    evidenceIds: ["ev-1"],
    confidenceMethod: null,
    nextAction: "ליצור קשר עוד היום",
    approvalRequired: true,
    approvalId: null,
    entityRef: "lead:lead-1",
  },
];

export const EVIDENCE: Evidence[] = [
  {
    ...base,
    id: "ev-1",
    subjectRef: "ai-recommendation:rec-1",
    sourceType: "entity",
    sourceRef: "lead-1",
    claim: 'הליד מסומן "דחוף השבוע" בהערות',
    capturedAt: "2026-07-21",
  },
];

export function makeDataAccess(
  overrides: Partial<Record<keyof LocalDataAccess, unknown[]>> = {},
): LocalDataAccess {
  const table = {
    leads: LEADS,
    customers: CUSTOMERS,
    serviceTickets: [] as ServiceTicket[],
    quotations: [] as Quotation[],
    tasks: [] as Task[],
    meetings: MEETINGS,
    activities: ACTIVITIES,
    courses: COURSES,
    enrollments: [] as Enrollment[],
    learningPaths: [] as LearningPath[],
    printerModels: PRINTER_MODELS,
    products: [] as Product[],
    users: [] as User[],
    aiRecommendations: AI_RECOMMENDATIONS,
    evidence: EVIDENCE,
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(table).map(([k, v]) => [k, () => Promise.resolve(v)]),
  ) as unknown as LocalDataAccess;
}

export function makeRequest(operation: string, extra: Partial<AIRequest> = {}): AIRequest {
  return {
    operation,
    organizationId: "org-1",
    userId: "user-1",
    sessionId: "session-1",
    relatedEntities: [],
    boundedContext: {},
    outputSchemaVersion: "v1",
    ...extra,
  };
}

/** A fully valid canonical envelope for DTO/transport tests. */
export function sampleEnvelope(
  overrides: Partial<AIResponseEnvelopeV2> = {},
): AIResponseEnvelopeV2 {
  return {
    id: "env-1",
    requestId: "req-1",
    correlationId: "corr-1",
    provider: "remote",
    model: "server-selected-model",
    createdAt: FIXED_NOW,
    operation: "summarize.weekly-leads",
    recommendation: "סיכום שבועי",
    reason: "ספירה ישירה",
    evidence: [
      {
        sourceType: "entity",
        sourceId: "lead-1",
        title: "ליד: דנה כהן",
        relevantExcerpt: 'סטטוס "חדש"',
        relevanceMethod: "נכלל בחלון",
        verified: true,
        lastUpdated: "2026-07-21T08:00:00.000Z",
      },
    ],
    confidence: {
      label: "טרם נמדד",
      method: "ספירה ישירה",
      contributingSignals: [],
      status: "unavailable",
    },
    nextStep: "לעבור על הלידים",
    limitations: ["מבוסס על הרשומות שנמסרו בלבד"],
    approval: { required: false, state: "not_required" },
    usage: { measured: false },
    status: "הצלחה",
    ...overrides,
  };
}
