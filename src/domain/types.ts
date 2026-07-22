// TERAGON AI BUSINESS OS — domain types (Wave 1, Architecture & Integration).
// 45+ canonical entities. Every entity has id / createdAt / updatedAt (ISO strings).
// Hebrew string unions mirror the product language (RTL-first). No invented AI metrics:
// anything unmeasured is null + "טרם נמדד" at the UI layer.

// ---------------------------------------------------------------------------
// shared primitives
// ---------------------------------------------------------------------------

/** ISO-8601 date or datetime string, e.g. "2026-07-22" / "2026-07-22T09:30:00.000Z". */
export type ISODate = string;

export interface BaseEntity {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------------------------------------------------------------------------
// shared unions (Hebrew product language)
// ---------------------------------------------------------------------------

/** Generic lifecycle status shared by many entities. */
export type EntityStatus = "פעיל" | "לא פעיל" | "בארכיון";

export type UserRoleKey = 'מנכ"ל' | "מכירות" | "מדריך" | "תמיכה" | "תלמיד" | "מנהל מערכת";

export type LeadStatus =
  | "חדש"
  | "נוצר קשר"
  | "קיבל פרטים"
  | "ממתין לתשובה"
  | "נשלחה הצעה"
  | "במשא ומתן"
  | "נסגר כלקוח"
  | "לא רלוונטי";

/** Ordered sales-funnel stages (derivable funnel — never hardcoded counts). */
export const LEAD_FUNNEL_ORDER: readonly LeadStatus[] = [
  "חדש",
  "נוצר קשר",
  "קיבל פרטים",
  "ממתין לתשובה",
  "נשלחה הצעה",
  "במשא ומתן",
  "נסגר כלקוח",
] as const;

export type OpportunityStage =
  "זיהוי" | "אפיון צרכים" | "הצעה" | "משא ומתן" | "נסגרה - זכייה" | "נסגרה - הפסד";

export type QuotationStatus = "טיוטה" | "נשלחה" | "אושרה" | "נדחתה" | "פג תוקף";

export type TicketStatus = "חדש" | "בבדיקה" | "ממתין ללקוח" | "ממתין לחלק" | "טופל" | "נסגר";

export type TicketPriority = "גבוהה" | "בינונית" | "נמוכה";

export type TaskStatus = "פתוחה" | "בתהליך" | "הושלמה" | "בוטלה";

export type CourseStatus = "פעיל" | "פתוח להרשמה" | "הסתיים" | "מלא";

export type EnrollmentPayment = "שולם" | "ממתין";

export type StageProgressStatus =
  | "לא התחיל"
  | "בעבודה"
  | "הוגש לבדיקה"
  | "ממתין לאישור מדריך"
  | "אושר"
  | "נדרש תיקון"
  | "באיחור"
  | "חסום / צריך עזרה";

/** Product-agent operational status (spec: exact Hebrew values). */
export type AgentStatus = "פעיל" | "ממתין" | "דורש אישור" | "חסום" | "מושבת";

export type AgentTaskStatus = "בתור" | "רץ" | "ממתין לאישור" | "אושר" | "נדחה" | "הושלם" | "נכשל";

export type ApprovalStatus = "ממתין" | "אושר" | "נדחה";

export type AutomationRunOutcome = "הצלחה" | "כישלון" | "בוטל";

export type StageGateStatus = "לא התחיל" | "בתהליך" | "עבר" | "נכשל";

export type ImplementationStageStatus = "לא התחיל" | "בתהליך" | "הושלם";

export type CustomerType = "פרטי" | "עסק" | "בית ספר" | "ארגון";

export type MetricLevel = "עסקי" | "תפעולי" | "AI";

export type RiskSeverity = "נמוכה" | "בינונית" | "גבוהה" | "קריטית";

// ---------------------------------------------------------------------------
// organization & people
// ---------------------------------------------------------------------------

export interface Organization extends BaseEntity {
  name: string;
  /** "עסק" | "בית ספר" | "ארגון" ... */
  type: CustomerType;
  phone: string;
  email: string;
  city: string;
  notes: string;
  status: EntityStatus;
}

export interface User extends BaseEntity {
  name: string;
  role: UserRoleKey;
  email: string;
  phone: string;
  status: EntityStatus;
}

/** Permission-bearing role definition (not the per-user role key). */
export interface Role extends BaseEntity {
  key: UserRoleKey;
  label: string;
  description: string;
  permissions: string[];
}

export interface Customer extends BaseEntity {
  name: string;
  type: CustomerType;
  phone: string;
  email: string;
  city: string;
  /** id of owning Organization, if the customer belongs to one */
  organizationId: string | null;
  /** free-text printer summary (detailed ownership in CustomerPrinter) */
  printerSummary: string;
  courseNames: string[];
  /** cumulative revenue in ILS — must reconcile with approved quotations */
  revenue: number;
  contactState: "פעיל" | "ממתין למענה" | "לא פעיל";
  review: { rating: number; text: string } | null;
  status: EntityStatus;
}

export interface Contact extends BaseEntity {
  customerId: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

// ---------------------------------------------------------------------------
// sales
// ---------------------------------------------------------------------------

export interface LeadHistoryEntry {
  date: ISODate;
  text: string;
}

export interface Lead extends BaseEntity {
  name: string;
  phone: string;
  email: string;
  /** e.g. "אתר" | "וואטסאפ" | "טלפון" | "פייסבוק" | "אינסטגרם" | "המלצה" | "לקוח חוזר" */
  source: string;
  /** e.g. "קורס Fusion 360" | "רכישת מדפסת" ... */
  interest: string;
  status: LeadStatus;
  /** User.id of owner */
  ownerId: string;
  followUp: ISODate;
  notes: string;
  history: LeadHistoryEntry[];
}

export interface Opportunity extends BaseEntity {
  name: string;
  leadId: string | null;
  customerId: string | null;
  stage: OpportunityStage;
  /** expected value in ILS */
  amount: number;
  expectedClose: ISODate;
  ownerId: string;
  notes: string;
}

export interface QuotationLine {
  id: string;
  description: string;
  quantity: number;
  /** unit price in ILS */
  unitPrice: number;
  /** productId when the line maps to a catalog product */
  productId: string | null;
}

export interface Quotation extends BaseEntity {
  customerName: string;
  customerId: string | null;
  title: string;
  lines: QuotationLine[];
  /** percent 0-100 applied to the lines subtotal */
  discountPercent: number;
  terms: string;
  validUntil: ISODate;
  status: QuotationStatus;
  ownerId: string;
}

export interface Product extends BaseEntity {
  name: string;
  category: "קורס" | "מדפסת" | "שירות" | "חומר גלם" | "אחר";
  description: string;
  /** price in ILS */
  price: number;
  active: boolean;
}

// ---------------------------------------------------------------------------
// printers
// ---------------------------------------------------------------------------

export interface PrinterModel extends BaseEntity {
  name: string;
  manufacturer: string;
  technology: "FDM" | "רזין";
  /** price in ILS */
  price: number;
  tags: string[];
  note: string;
}

export interface CustomerPrinter extends BaseEntity {
  customerId: string;
  printerModelId: string;
  serialNumber: string;
  purchasedAt: ISODate;
  underWarranty: boolean;
  notes: string;
}

// ---------------------------------------------------------------------------
// learning
// ---------------------------------------------------------------------------

export interface Course extends BaseEntity {
  name: string;
  type: string;
  start: ISODate;
  end: ISODate;
  /** price in ILS */
  price: number;
  status: CourseStatus;
  zoom: string;
  instructorId: string;
  isAI: boolean;
  blurb: string;
}

export interface LearningPathStage {
  id: string;
  order: number;
  name: string;
  requiresApproval: boolean;
  description: string;
  checklist: string[];
}

export interface LearningPath extends BaseEntity {
  name: string;
  courseId: string;
  stages: LearningPathStage[];
}

export interface Student extends BaseEntity {
  name: string;
  phone: string;
  email: string;
  /** linked User.id when the student has an account */
  userId: string | null;
  status: EntityStatus;
}

export interface StageProgress {
  stageId: string;
  status: StageProgressStatus;
  due: ISODate;
  text: string;
  files: { name: string; size: string }[];
  links: { label: string; url: string }[];
  checklistDone: string[];
  notes: { author: string; text: string; date: ISODate }[];
  help: string;
  updated: ISODate;
}

export interface Enrollment extends BaseEntity {
  studentId: string;
  studentName: string;
  courseId: string;
  payment: EnrollmentPayment;
  stages: StageProgress[];
}

export interface CourseSession extends BaseEntity {
  courseId: string;
  title: string;
  scheduledAt: ISODate;
  durationMinutes: number;
  zoomUrl: string;
  notes: string;
}

export interface Assignment extends BaseEntity {
  courseId: string;
  stageId: string | null;
  title: string;
  description: string;
  due: ISODate;
}

// ---------------------------------------------------------------------------
// service
// ---------------------------------------------------------------------------

export interface ServiceTicket extends BaseEntity {
  customerName: string;
  customerId: string | null;
  printer: string;
  issue: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  openedAt: ISODate;
  ownerId: string;
  solution: string;
}

export interface RepairAction extends BaseEntity {
  ticketId: string;
  description: string;
  performedById: string;
  performedAt: ISODate;
  /** parts cost in ILS, 0 when none */
  partsCost: number;
}

// ---------------------------------------------------------------------------
// work management
// ---------------------------------------------------------------------------

export interface Task extends BaseEntity {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TicketPriority;
  due: ISODate;
  ownerId: string;
  /** "customer:cu-3" style entity ref, or null */
  relatedRef: string | null;
}

export interface Meeting extends BaseEntity {
  title: string;
  scheduledAt: ISODate;
  durationMinutes: number;
  location: string;
  participantIds: string[];
  agenda: string;
  relatedRef: string | null;
}

/** A recorded business activity (feed item). */
export interface Activity extends BaseEntity {
  /** e.g. "ליד" | "הצעת מחיר" | "קריאת שירות" | "קורס" | "סוכן" | "מערכת" */
  kind: string;
  text: string;
  actorId: string;
  entityRef: string | null;
  at: ISODate;
}

export interface Document extends BaseEntity {
  name: string;
  description: string;
  /** "קובץ" | "קישור" */
  type: "קובץ" | "קישור";
  url: string | null;
  courseId: string | null;
  stageId: string | null;
  visible: boolean;
  ownerId: string;
}

// ---------------------------------------------------------------------------
// memory & knowledge
// ---------------------------------------------------------------------------

export interface KnowledgeNote extends BaseEntity {
  title: string;
  category: string;
  /** markdown; [[wikilinks]] allowed */
  content: string;
  sourceRef: string | null;
  approved: boolean;
  tags: string[];
}

/** Obsidian-compatible memory record (markdown + frontmatter + wikilinks). */
export interface MemoryRecord extends BaseEntity {
  title: string;
  /** markdown body; [[wikilinks]] allowed */
  markdown: string;
  frontmatter: Record<string, string | number | boolean | string[]>;
  folder: string;
  tags: string[];
  /** wikilink targets extracted from markdown */
  links: string[];
}

// ---------------------------------------------------------------------------
// automations
// ---------------------------------------------------------------------------

export interface Automation extends BaseEntity {
  name: string;
  description: string;
  /** e.g. "ליד חדש נוצר" */
  trigger: string;
  /** ordered human-readable step descriptions */
  steps: string[];
  enabled: boolean;
  /** true ⇒ every run requires human approval before execution */
  requiresApproval: boolean;
}

export interface AutomationRun extends BaseEntity {
  automationId: string;
  startedAt: ISODate;
  endedAt: ISODate | null;
  outcome: AutomationRunOutcome | null;
  stepsLog: string[];
  triggeredBy: string;
}

// ---------------------------------------------------------------------------
// AI agents
// ---------------------------------------------------------------------------

export interface AgentLimits {
  maxTasksPerDay: number;
  maxActionsPerTask: number;
  /** ILS budget cap per day; 0 = no spending allowed */
  dailyBudgetILS: number;
}

export interface Agent extends BaseEntity {
  /** e.g. "מנהל התזמור" | "Hunter" */
  name: string;
  purpose: string;
  allowedTools: string[];
  allowedDomains: string[];
  prohibitedDomains: string[];
  promptVersion: string;
  limits: AgentLimits;
  status: AgentStatus;
}

export interface AgentTask extends BaseEntity {
  agentId: string;
  title: string;
  description: string;
  status: AgentTaskStatus;
  evidenceIds: string[];
  approvalId: string | null;
}

export interface AgentMessage extends BaseEntity {
  taskId: string;
  fromAgentId: string;
  /** null = broadcast to the coordination room */
  toAgentId: string | null;
  role: "system" | "agent" | "human";
  content: string;
  sentAt: ISODate;
}

export interface AgentHandoff extends BaseEntity {
  taskId: string;
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  contextSummary: string;
  at: ISODate;
}

export interface AgentConflict extends BaseEntity {
  taskId: string;
  agentIds: string[];
  description: string;
  resolution: string | null;
  resolvedById: string | null;
  resolvedAt: ISODate | null;
}

export interface AIRecommendation extends BaseEntity {
  agentId: string;
  title: string;
  /** למה */
  reason: string;
  /** ראיות */
  evidenceIds: string[];
  /** how confidence was derived — never an invented number; null ⇒ "טרם נמדד" */
  confidenceMethod: string | null;
  /** הפעולה הבאה */
  nextAction: string;
  approvalRequired: boolean;
  approvalId: string | null;
  entityRef: string | null;
}

export interface Evidence extends BaseEntity {
  /** what the evidence supports: AgentTask.id / AIRecommendation.id / StageGate.id ... */
  subjectRef: string;
  sourceType: "entity" | "document" | "computation" | "external";
  sourceRef: string;
  claim: string;
  capturedAt: ISODate;
}

export interface Approval extends BaseEntity {
  /** what needs approval: "agent-task:at-1" style ref */
  subjectRef: string;
  requestedById: string;
  requestedAt: ISODate;
  status: ApprovalStatus;
  decidedById: string | null;
  decidedAt: ISODate | null;
  note: string;
}

export interface AuditEvent extends BaseEntity {
  at: ISODate;
  /** actor: user id / agent id / "system" */
  actor: string;
  action: string;
  entityRef: string | null;
  details: string;
  correlationId: string | null;
}

// ---------------------------------------------------------------------------
// metrics, governance
// ---------------------------------------------------------------------------

export interface MetricDefinition extends BaseEntity {
  key: string;
  name: string;
  level: MetricLevel;
  description: string;
  unit: string;
  /** how the value is derived — a selector name, never a hardcoded number */
  derivation: string;
}

export interface MetricObservation extends BaseEntity {
  metricKey: string;
  observedAt: ISODate;
  /** null ⇒ "טרם נמדד" — an unmeasured metric must never invent a value */
  value: number | null;
  /** how the observation was produced */
  method: string;
}

export interface Risk extends BaseEntity {
  title: string;
  description: string;
  severity: RiskSeverity;
  /** ids of Control records mitigating this risk */
  controlIds: string[];
  ownerId: string;
  status: "פתוח" | "בטיפול" | "סגור";
}

export interface Control extends BaseEntity {
  name: string;
  description: string;
  /** e.g. "טכני" | "תהליכי" | "אנושי" */
  kind: string;
  implemented: boolean;
  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// adoption / implementation
// ---------------------------------------------------------------------------

export interface Persona extends BaseEntity {
  name: string;
  description: string;
  mappedRole: UserRoleKey | null;
  goals: string[];
  painPoints: string[];
  trainingTrack: string;
}

export interface TrainingMaterial extends BaseEntity {
  title: string;
  description: string;
  /** "מדריך" | "וידאו" | "מצגת" | "תרגול" */
  kind: string;
  audiencePersonaIds: string[];
  url: string | null;
  stageId: string | null;
}

export interface ImplementationStage extends BaseEntity {
  order: number;
  name: string;
  description: string;
  status: ImplementationStageStatus;
  startPlanned: ISODate;
  endPlanned: ISODate;
  gateId: string | null;
}

export interface StageGate extends BaseEntity {
  order: number;
  name: string;
  criteria: string[];
  evidenceIds: string[];
  status: StageGateStatus;
  decidedAt: ISODate | null;
  decidedById: string | null;
}

export interface SupportRequest extends BaseEntity {
  subject: string;
  description: string;
  requesterId: string;
  channel: "מערכת" | "וואטסאפ" | "טלפון" | "מייל";
  status: "פתוחה" | "בטיפול" | "נסגרה";
  priority: TicketPriority;
  resolution: string;
}

// ---------------------------------------------------------------------------
// AI response envelope (mandatory 7-field contract for every AI output)
// ---------------------------------------------------------------------------

export interface AIResponseEnvelope<TResult = unknown> {
  result: TResult;
  /** למה — the reasoning behind the result */
  reason: string;
  /** ראיות — evidence records backing the result */
  evidence: Evidence[];
  /** how confidence was derived — never an invented number; null ⇒ "טרם נמדד" */
  confidenceMethod: string | null;
  limitations: string;
  /** הפעולה הבאה */
  nextAction: string;
  approvalRequired: boolean;
}
