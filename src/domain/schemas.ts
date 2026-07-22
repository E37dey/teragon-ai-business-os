// TERAGON AI BUSINESS OS — zod schemas (Wave 1).
// Covers every seeded entity family. Each schema is pinned to its domain type via
// `satisfies z.ZodType<T>` so types.ts and schemas.ts can never drift apart.
import { z } from "zod";
import type {
  Activity,
  Agent,
  AgentHandoff,
  AgentMessage,
  AgentTask,
  AIRecommendation,
  AppNotification,
  Approval,
  AuditEvent,
  Automation,
  AutomationRun,
  Contact,
  Course,
  Customer,
  Document,
  Enrollment,
  Evidence,
  ImplementationStage,
  KnowledgeNote,
  Lead,
  Meeting,
  MemoryRecord,
  MetricDefinition,
  MetricObservation,
  Opportunity,
  Organization,
  Persona,
  PrinterModel,
  Product,
  Quotation,
  ServiceTicket,
  StageGate,
  Student,
  Task,
  TrainingMaterial,
  User,
} from "./types";

// ---------- shared ----------

/** "2026-07-22" or full ISO datetime. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/u, {
    message: "תאריך חייב להיות בפורמט ISO (YYYY-MM-DD)",
  });

const baseEntity = {
  id: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
};

export const entityStatusSchema = z.enum(["פעיל", "לא פעיל", "בארכיון"]);
export const userRoleKeySchema = z.enum([
  'מנכ"ל',
  "מכירות",
  "מדריך",
  "תמיכה",
  "תלמיד",
  "מנהל מערכת",
]);
export const leadStatusSchema = z.enum([
  "חדש",
  "נוצר קשר",
  "קיבל פרטים",
  "ממתין לתשובה",
  "נשלחה הצעה",
  "במשא ומתן",
  "נסגר כלקוח",
  "לא רלוונטי",
]);
export const quotationStatusSchema = z.enum(["טיוטה", "נשלחה", "אושרה", "נדחתה", "פג תוקף"]);
export const ticketStatusSchema = z.enum([
  "חדש",
  "בבדיקה",
  "ממתין ללקוח",
  "ממתין לחלק",
  "טופל",
  "נסגר",
]);
export const ticketPrioritySchema = z.enum(["גבוהה", "בינונית", "נמוכה"]);
export const taskStatusSchema = z.enum(["פתוחה", "בתהליך", "הושלמה", "בוטלה"]);
export const courseStatusSchema = z.enum(["פעיל", "פתוח להרשמה", "הסתיים", "מלא"]);
export const agentStatusSchema = z.enum(["פעיל", "ממתין", "דורש אישור", "חסום", "מושבת"]);
export const agentTaskStatusSchema = z.enum([
  "בתור",
  "רץ",
  "ממתין לאישור",
  "אושר",
  "נדחה",
  "הושלם",
  "נכשל",
]);
export const approvalStatusSchema = z.enum(["ממתין", "אושר", "נדחה"]);
export const customerTypeSchema = z.enum(["פרטי", "עסק", "בית ספר", "ארגון"]);
export const stageProgressStatusSchema = z.enum([
  "לא התחיל",
  "בעבודה",
  "הוגש לבדיקה",
  "ממתין לאישור מדריך",
  "אושר",
  "נדרש תיקון",
  "באיחור",
  "חסום / צריך עזרה",
]);

// ---------- organization & people ----------

export const organizationSchema = z.object({
  ...baseEntity,
  name: z.string().min(1, "שם ארגון הוא שדה חובה"),
  type: customerTypeSchema,
  phone: z.string(),
  email: z.string(),
  city: z.string(),
  notes: z.string(),
  status: entityStatusSchema,
}) satisfies z.ZodType<Organization>;

export const userSchema = z.object({
  ...baseEntity,
  name: z.string().min(1, "שם משתמש הוא שדה חובה"),
  role: userRoleKeySchema,
  email: z.string().email("כתובת אימייל לא תקינה"),
  phone: z.string(),
  status: entityStatusSchema,
}) satisfies z.ZodType<User>;

export const customerSchema = z.object({
  ...baseEntity,
  name: z.string().min(1, "שם לקוח הוא שדה חובה"),
  type: customerTypeSchema,
  phone: z.string(),
  email: z.string(),
  city: z.string(),
  organizationId: z.string().nullable(),
  printerSummary: z.string(),
  courseNames: z.array(z.string()),
  revenue: z.number().min(0, "הכנסה לא יכולה להיות שלילית"),
  contactState: z.enum(["פעיל", "ממתין למענה", "לא פעיל"]),
  review: z.object({ rating: z.number().min(1).max(5), text: z.string() }).nullable(),
  status: entityStatusSchema,
}) satisfies z.ZodType<Customer>;

export const contactSchema = z.object({
  ...baseEntity,
  customerId: z.string().min(1),
  name: z.string().min(1),
  role: z.string(),
  phone: z.string(),
  email: z.string(),
  isPrimary: z.boolean(),
}) satisfies z.ZodType<Contact>;

// ---------- sales ----------

export const leadSchema = z.object({
  ...baseEntity,
  name: z.string().min(1, "שם ליד הוא שדה חובה"),
  phone: z.string(),
  email: z.string(),
  source: z.string(),
  interest: z.string(),
  status: leadStatusSchema,
  ownerId: z.string().min(1),
  followUp: isoDate,
  notes: z.string(),
  history: z.array(z.object({ date: isoDate, text: z.string() })),
}) satisfies z.ZodType<Lead>;

export const opportunitySchema = z.object({
  ...baseEntity,
  name: z.string().min(1),
  leadId: z.string().nullable(),
  customerId: z.string().nullable(),
  stage: z.enum(["זיהוי", "אפיון צרכים", "הצעה", "משא ומתן", "נסגרה - זכייה", "נסגרה - הפסד"]),
  amount: z.number().min(0),
  expectedClose: isoDate,
  ownerId: z.string().min(1),
  notes: z.string(),
}) satisfies z.ZodType<Opportunity>;

export const quotationLineSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1, "תיאור שורה הוא שדה חובה"),
  quantity: z.number().positive("כמות חייבת להיות חיובית"),
  unitPrice: z.number().min(0, "מחיר לא יכול להיות שלילי"),
  productId: z.string().nullable(),
});

export const quotationSchema = z.object({
  ...baseEntity,
  customerName: z.string().min(1),
  customerId: z.string().nullable(),
  title: z.string().min(1, "כותרת הצעה היא שדה חובה"),
  lines: z.array(quotationLineSchema).min(1, "הצעת מחיר חייבת לכלול לפחות שורה אחת"),
  discountPercent: z.number().min(0).max(100, "הנחה בין 0 ל-100 אחוז"),
  terms: z.string(),
  validUntil: isoDate,
  status: quotationStatusSchema,
  ownerId: z.string().min(1),
}) satisfies z.ZodType<Quotation>;

export const productSchema = z.object({
  ...baseEntity,
  name: z.string().min(1),
  category: z.enum(["קורס", "מדפסת", "שירות", "חומר גלם", "אחר"]),
  description: z.string(),
  price: z.number().min(0),
  active: z.boolean(),
}) satisfies z.ZodType<Product>;

export const printerModelSchema = z.object({
  ...baseEntity,
  name: z.string().min(1),
  manufacturer: z.string(),
  technology: z.enum(["FDM", "רזין"]),
  price: z.number().min(0),
  tags: z.array(z.string()),
  note: z.string(),
}) satisfies z.ZodType<PrinterModel>;

// ---------- learning ----------

export const courseSchema = z.object({
  ...baseEntity,
  name: z.string().min(1, "שם קורס הוא שדה חובה"),
  type: z.string(),
  start: isoDate,
  end: isoDate,
  price: z.number().min(0),
  status: courseStatusSchema,
  zoom: z.string(),
  instructorId: z.string().min(1),
  isAI: z.boolean(),
  blurb: z.string(),
}) satisfies z.ZodType<Course>;

export const studentSchema = z.object({
  ...baseEntity,
  name: z.string().min(1),
  phone: z.string(),
  email: z.string(),
  userId: z.string().nullable(),
  status: entityStatusSchema,
}) satisfies z.ZodType<Student>;

export const stageProgressSchema = z.object({
  stageId: z.string().min(1),
  status: stageProgressStatusSchema,
  due: isoDate,
  text: z.string(),
  files: z.array(z.object({ name: z.string(), size: z.string() })),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  checklistDone: z.array(z.string()),
  notes: z.array(z.object({ author: z.string(), text: z.string(), date: isoDate })),
  help: z.string(),
  updated: isoDate,
});

export const enrollmentSchema = z.object({
  ...baseEntity,
  studentId: z.string().min(1),
  studentName: z.string().min(1),
  courseId: z.string().min(1),
  payment: z.enum(["שולם", "ממתין"]),
  stages: z.array(stageProgressSchema),
}) satisfies z.ZodType<Enrollment>;

// ---------- service & work ----------

export const serviceTicketSchema = z.object({
  ...baseEntity,
  customerName: z.string().min(1),
  customerId: z.string().nullable(),
  printer: z.string(),
  issue: z.string().min(1, "סוג תקלה הוא שדה חובה"),
  description: z.string(),
  priority: ticketPrioritySchema,
  status: ticketStatusSchema,
  openedAt: isoDate,
  ownerId: z.string().min(1),
  solution: z.string(),
}) satisfies z.ZodType<ServiceTicket>;

export const taskSchema = z.object({
  ...baseEntity,
  title: z.string().min(1, "כותרת משימה היא שדה חובה"),
  description: z.string(),
  status: taskStatusSchema,
  priority: ticketPrioritySchema,
  due: isoDate,
  ownerId: z.string().min(1),
  relatedRef: z.string().nullable(),
}) satisfies z.ZodType<Task>;

export const meetingSchema = z.object({
  ...baseEntity,
  title: z.string().min(1, "כותרת פגישה היא שדה חובה"),
  scheduledAt: isoDate,
  durationMinutes: z.number().positive("משך פגישה חייב להיות חיובי"),
  location: z.string(),
  participantIds: z.array(z.string()),
  agenda: z.string(),
  relatedRef: z.string().nullable(),
}) satisfies z.ZodType<Meeting>;

export const activitySchema = z.object({
  ...baseEntity,
  kind: z.string().min(1),
  text: z.string().min(1),
  actorId: z.string().min(1),
  entityRef: z.string().nullable(),
  at: isoDate,
}) satisfies z.ZodType<Activity>;

export const documentSchema = z.object({
  ...baseEntity,
  name: z.string().min(1),
  description: z.string(),
  type: z.enum(["קובץ", "קישור"]),
  url: z.string().nullable(),
  courseId: z.string().nullable(),
  stageId: z.string().nullable(),
  visible: z.boolean(),
  ownerId: z.string().min(1),
}) satisfies z.ZodType<Document>;

// ---------- memory & knowledge ----------

export const knowledgeNoteSchema = z.object({
  ...baseEntity,
  title: z.string().min(1),
  category: z.string(),
  content: z.string(),
  sourceRef: z.string().nullable(),
  approved: z.boolean(),
  tags: z.array(z.string()),
}) satisfies z.ZodType<KnowledgeNote>;

export const memoryRecordSchema = z.object({
  ...baseEntity,
  title: z.string().min(1),
  markdown: z.string(),
  frontmatter: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  ),
  folder: z.string(),
  tags: z.array(z.string()),
  links: z.array(z.string()),
}) satisfies z.ZodType<MemoryRecord>;

// ---------- automations & agents ----------

export const automationSchema = z.object({
  ...baseEntity,
  name: z.string().min(1),
  description: z.string(),
  trigger: z.string().min(1),
  steps: z.array(z.string()),
  enabled: z.boolean(),
  requiresApproval: z.boolean(),
}) satisfies z.ZodType<Automation>;

export const automationRunSchema = z.object({
  ...baseEntity,
  automationId: z.string().min(1),
  startedAt: isoDate,
  endedAt: isoDate.nullable(),
  outcome: z.enum(["הצלחה", "כישלון", "בוטל"]).nullable(),
  stepsLog: z.array(z.string()),
  triggeredBy: z.string(),
}) satisfies z.ZodType<AutomationRun>;

export const agentSchema = z.object({
  ...baseEntity,
  name: z.string().min(1, "שם סוכן הוא שדה חובה"),
  purpose: z.string().min(1),
  allowedTools: z.array(z.string()),
  allowedDomains: z.array(z.string()),
  prohibitedDomains: z.array(z.string()),
  promptVersion: z.string().min(1),
  limits: z.object({
    maxTasksPerDay: z.number().int().min(0),
    maxActionsPerTask: z.number().int().min(0),
    dailyBudgetILS: z.number().min(0),
  }),
  status: agentStatusSchema,
}) satisfies z.ZodType<Agent>;

export const agentTaskSchema = z.object({
  ...baseEntity,
  agentId: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  status: agentTaskStatusSchema,
  evidenceIds: z.array(z.string()),
  approvalId: z.string().nullable(),
}) satisfies z.ZodType<AgentTask>;

export const agentMessageSchema = z.object({
  ...baseEntity,
  taskId: z.string().min(1),
  fromAgentId: z.string().min(1),
  toAgentId: z.string().nullable(),
  role: z.enum(["system", "agent", "human"]),
  content: z.string().min(1),
  sentAt: isoDate,
}) satisfies z.ZodType<AgentMessage>;

export const agentHandoffSchema = z.object({
  ...baseEntity,
  taskId: z.string().min(1),
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  reason: z.string(),
  contextSummary: z.string(),
  at: isoDate,
}) satisfies z.ZodType<AgentHandoff>;

export const aiRecommendationSchema = z.object({
  ...baseEntity,
  agentId: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string()),
  confidenceMethod: z.string().nullable(),
  nextAction: z.string(),
  approvalRequired: z.boolean(),
  approvalId: z.string().nullable(),
  entityRef: z.string().nullable(),
}) satisfies z.ZodType<AIRecommendation>;

export const evidenceSchema = z.object({
  ...baseEntity,
  subjectRef: z.string().min(1),
  sourceType: z.enum(["entity", "document", "computation", "external"]),
  sourceRef: z.string(),
  claim: z.string().min(1),
  capturedAt: isoDate,
}) satisfies z.ZodType<Evidence>;

export const approvalSchema = z.object({
  ...baseEntity,
  subjectRef: z.string().min(1),
  requestedById: z.string().min(1),
  requestedAt: isoDate,
  status: approvalStatusSchema,
  decidedById: z.string().nullable(),
  decidedAt: isoDate.nullable(),
  note: z.string(),
}) satisfies z.ZodType<Approval>;

export const auditEventSchema = z.object({
  ...baseEntity,
  at: isoDate,
  actor: z.string().min(1),
  action: z.string().min(1),
  entityRef: z.string().nullable(),
  details: z.string(),
  correlationId: z.string().nullable(),
}) satisfies z.ZodType<AuditEvent>;

// ---------- metrics & adoption ----------

export const metricDefinitionSchema = z.object({
  ...baseEntity,
  key: z.string().min(1),
  name: z.string().min(1),
  level: z.enum(["עסקי", "תפעולי", "AI"]),
  description: z.string(),
  unit: z.string(),
  derivation: z.string().min(1),
}) satisfies z.ZodType<MetricDefinition>;

export const metricObservationSchema = z.object({
  ...baseEntity,
  metricKey: z.string().min(1),
  observedAt: isoDate,
  value: z.number().nullable(),
  method: z.string().min(1),
}) satisfies z.ZodType<MetricObservation>;

export const personaSchema = z.object({
  ...baseEntity,
  name: z.string().min(1),
  description: z.string(),
  mappedRole: userRoleKeySchema.nullable(),
  goals: z.array(z.string()),
  painPoints: z.array(z.string()),
  trainingTrack: z.string(),
}) satisfies z.ZodType<Persona>;

export const trainingMaterialSchema = z.object({
  ...baseEntity,
  title: z.string().min(1),
  description: z.string(),
  kind: z.string().min(1),
  audiencePersonaIds: z.array(z.string()),
  url: z.string().nullable(),
  stageId: z.string().nullable(),
}) satisfies z.ZodType<TrainingMaterial>;

export const implementationStageSchema = z.object({
  ...baseEntity,
  order: z.number().int().min(1),
  name: z.string().min(1),
  description: z.string(),
  status: z.enum(["לא התחיל", "בתהליך", "הושלם"]),
  startPlanned: isoDate,
  endPlanned: isoDate,
  gateId: z.string().nullable(),
}) satisfies z.ZodType<ImplementationStage>;

export const stageGateSchema = z.object({
  ...baseEntity,
  order: z.number().int().min(1),
  name: z.string().min(1),
  criteria: z.array(z.string()).min(1, "שער חייב לכלול לפחות קריטריון אחד"),
  evidenceIds: z.array(z.string()),
  status: z.enum(["לא התחיל", "בתהליך", "עבר", "נכשל"]),
  decidedAt: isoDate.nullable(),
  decidedById: z.string().nullable(),
}) satisfies z.ZodType<StageGate>;

// ---------- notifications (Wave 2) ----------

export const notificationSeveritySchema = z.enum(["מידע", "אזהרה", "דחוף"]);

export const notificationCategorySchema = z.enum([
  "מכירות",
  "משימות",
  "שירות",
  "מסמכים",
  "למידה",
  "סוכני AI",
  "אוטומציות",
]);

export const notificationSchema = z.object({
  ...baseEntity,
  category: notificationCategorySchema,
  title: z.string().min(1, "כותרת התראה היא שדה חובה"),
  body: z.string(),
  relatedEntity: z.object({
    type: z.string().min(1),
    id: z.string().min(1),
    route: z.string().min(1),
  }),
  read: z.boolean(),
  severity: notificationSeveritySchema,
  ownerId: z.string().nullable(),
}) satisfies z.ZodType<AppNotification>;
