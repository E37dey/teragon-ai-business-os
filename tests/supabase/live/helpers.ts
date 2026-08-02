/// <reference types="node" />
// TERAGON AI BUSINESS OS — LIVE Supabase repository-adapter integration harness.
//
// This module is the ONLY place that touches process.env and the live Supabase
// stack. It is imported by tests/supabase/liveAdapter.test.ts.
//
// GATING (see the coordinator contract):
//   These tests live under tests/supabase/live/** and are EXCLUDED from the
//   default Vitest config, so they never contribute a skip to the normal suite.
//   They NEVER skip — they either run or FAIL HARD:
//   * SUPABASE_LIVE_TESTS !== "1"  ⇒  setup.ts throws (fail, never skip).
//   * any of SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY absent
//     ⇒  setup.ts throws. A fixture user that cannot authenticate ⇒ beforeAll
//     throws. Zero live tests executing ⇒ the final executed-count guard fails.
//
// SECURITY: the service-role client is used ONLY to mint ephemeral test users,
// call the server-only bootstrap, seed malformed fixtures for read-path checks,
// and tear down / inspect invariants. EVERY ordinary adapter CRUD assertion runs
// through the anon (publishable) key + a REAL authenticated JWT session obtained
// from signInWithPassword, driving the REAL `src/persistence/supabase` adapter.
// No JWT, refresh token, service-role key, or password is ever printed/logged.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseLike } from "@/persistence/supabase/db";
import type {
  Agent,
  AIRecommendation,
  Approval,
  AuditEvent,
  Contact,
  Course,
  Customer,
  Enrollment,
  Evidence,
  KnowledgeNote,
  Lead,
  MemoryRecord,
  Opportunity,
  PrinterModel,
  Quotation,
  ServiceTicket,
  StageProgress,
  Student,
  Task,
} from "@/domain/types";

// ---------------------------------------------------------------------------
// env gate
// ---------------------------------------------------------------------------

export interface LiveEnv {
  readonly url: string;
  readonly anonKey: string;
  readonly serviceKey: string;
}

/**
 * Fail-hard gate for the live folder. Throws (never skips) when the live run is
 * not explicitly enabled, or when any required env var is absent. Called from
 * tests/supabase/live/setup.ts before any test runs.
 */
export function assertLiveOrThrow(): LiveEnv {
  if (process.env.SUPABASE_LIVE_TESTS !== "1") {
    throw new Error(
      "tests/supabase/live requires SUPABASE_LIVE_TESTS=1. These tests never skip — " +
        "they are excluded from the default suite and fail hard when run without the live env.",
    );
  }
  return liveEnvOrThrow();
}

/** The live env bundle, or null when any of the three vars is unset. */
export function liveEnv(): LiveEnv | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return null;
  return { url, anonKey, serviceKey };
}

/**
 * Live env or a hard failure. Called from beforeAll ONLY when SUPABASE_LIVE_TESTS
 * === "1"; a missing var is a CI misconfiguration and must fail loudly (never a
 * silent skip). The message names the missing var(s) but never any value.
 */
export function liveEnvOrThrow(): LiveEnv {
  const env = liveEnv();
  if (env) return env;
  const missing = [
    process.env.SUPABASE_URL ? null : "SUPABASE_URL",
    process.env.SUPABASE_ANON_KEY ? null : "SUPABASE_ANON_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY ? null : "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((v): v is string => v !== null);
  throw new Error(
    `SUPABASE_LIVE_TESTS=1 but required env is missing: ${missing.join(", ")}. ` +
      "The live suite must not skip in CI — configure the ephemeral Supabase env.",
  );
}

// ---------------------------------------------------------------------------
// clients + fixtures
// ---------------------------------------------------------------------------

/** A shared, strong ephemeral password for all fixture users (never logged). */
const FIXTURE_PASSWORD = "It-Live-P@ssw0rd-2026!fixture";

const CLIENT_OPTS = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export interface UserCtx {
  /** auth.users uuid (also profiles.id). */
  readonly userId: string;
  readonly email: string;
  readonly orgId: string;
  readonly roleId: string;
  readonly active: boolean;
  /** authenticated anon-key client, narrowed to the adapter surface. */
  readonly client: SupabaseLike;
  /** authenticated anon-key client, full type (for identity/RLS probes). */
  readonly raw: SupabaseClient;
}

export interface LiveContext {
  readonly env: LiveEnv;
  /** service-role client — setup / bootstrap / teardown / inspection ONLY. */
  readonly admin: SupabaseClient;
  readonly orgA: string;
  readonly orgB: string;
  readonly orgP: string;
  /** privileged bootstrap admin (crole-sysadmin) + ACTIVE user in org A. */
  readonly adminA: UserCtx;
  /** ACTIVE bootstrap admin in org B (cross-org fixtures). */
  readonly adminB: UserCtx;
  /** ACTIVE bootstrap admin in the isolated pagination org. */
  readonly adminP: UserCtx;
  /** INACTIVE viewer in org A (active=false) — inactive-denial fixture. */
  readonly inactiveA: UserCtx;
  /** ACTIVE viewer in org A — capability-gate (denied-write) fixture. */
  readonly viewerA: UserCtx;
  /** every ephemeral auth.users id created (for teardown). */
  readonly userIds: string[];
  /** unique run suffix for deterministic, collision-free ids. */
  readonly suffix: string;
}

function adminClient(env: LiveEnv): SupabaseClient {
  return createClient(env.url, env.serviceKey, CLIENT_OPTS);
}

/** Sign a user in with the anon key and return an authenticated session client. */
async function signIn(env: LiveEnv, email: string): Promise<{ raw: SupabaseClient; client: SupabaseLike }> {
  const raw = createClient(env.url, env.anonKey, CLIENT_OPTS);
  const { data, error } = await raw.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD });
  if (error || !data.session) {
    // never echo the password or any token
    throw new Error(`sign-in failed for fixture user ${email}: ${error?.message ?? "no session returned"}`);
  }
  return { raw, client: raw as unknown as SupabaseLike };
}

async function createAuthUser(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`admin.createUser failed for ${email}: ${error?.message ?? "no user"}`);
  return data.user.id;
}

/**
 * Privileged bootstrap admin: mints the auth user, then calls the SERVICE-ROLE-
 * ONLY `bootstrap_admin` RPC (creates org + crole-sysadmin profile + membership),
 * then authenticates as that user through the anon key.
 */
async function bootstrapAdmin(admin: SupabaseClient, env: LiveEnv, orgId: string, tag: string): Promise<UserCtx> {
  const email = `admin-${tag}-${orgId}@it.local`.toLowerCase();
  const userId = await createAuthUser(admin, email);
  const { error } = await admin.rpc("bootstrap_admin", {
    p_user_id: userId,
    p_org_id: orgId,
    p_org_name: `IT ${orgId}`,
    p_name: `Admin ${tag}`,
    p_email: email,
  });
  if (error) throw new Error(`bootstrap_admin failed for ${orgId}: ${error.message}`);
  const { raw, client } = await signIn(env, email);
  return { userId, email, orgId, roleId: "crole-sysadmin", active: true, client, raw };
}

/**
 * Provision a NON-admin user with an explicit role + active flag via the service
 * role (org must already exist). Used for the inactive + capability-gate fixtures.
 */
async function provisionUser(
  admin: SupabaseClient,
  env: LiveEnv,
  orgId: string,
  roleId: string,
  active: boolean,
  tag: string,
): Promise<UserCtx> {
  const email = `${tag}-${orgId}@it.local`.toLowerCase();
  const userId = await createAuthUser(admin, email);
  const status = active ? "פעיל" : "לא פעיל";
  const { error: pErr } = await admin
    .from("profiles")
    .upsert({ id: userId, organization_id: orgId, role_id: roleId, name: tag, email, active, status }, { onConflict: "id" });
  if (pErr) throw new Error(`profile upsert failed for ${email}: ${pErr.message}`);
  const { error: mErr } = await admin
    .from("memberships")
    .upsert(
      { id: `mem-${tag}-${orgId}`, organization_id: orgId, profile_id: userId, role_id: roleId, active },
      { onConflict: "organization_id,profile_id" },
    );
  if (mErr) throw new Error(`membership upsert failed for ${email}: ${mErr.message}`);
  const { raw, client } = await signIn(env, email);
  return { userId, email, orgId, roleId, active, client, raw };
}

/**
 * Stand up all fixtures. Throws on any failure so a LIVE=1 run fails loudly
 * (never silently degrades). Ids are deterministic and unique per run.
 */
export async function setupFixtures(env: LiveEnv): Promise<LiveContext> {
  const admin = adminClient(env);
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const orgA = `org-it-${suffix}-a`;
  const orgB = `org-it-${suffix}-b`;
  const orgP = `org-it-${suffix}-p`;

  const adminA = await bootstrapAdmin(admin, env, orgA, "a");
  const adminB = await bootstrapAdmin(admin, env, orgB, "b");
  const adminP = await bootstrapAdmin(admin, env, orgP, "p");
  const inactiveA = await provisionUser(admin, env, orgA, "crole-viewer", false, "inact");
  const viewerA = await provisionUser(admin, env, orgA, "crole-viewer", true, "view");

  const userIds = [adminA, adminB, adminP, inactiveA, viewerA].map((u) => u.userId);
  return { env, admin, orgA, orgB, orgP, adminA, adminB, adminP, inactiveA, viewerA, userIds, suffix };
}

// Tenant tables, ordered children→parents so FK-scoped deletes never conflict.
const TENANT_TEARDOWN_ORDER = [
  "repair_actions",
  "audit_events",
  "service_tickets",
  "customer_printers",
  "contacts",
  "opportunities",
  "quotations",
  "enrollments",
  "students",
  "courses",
  "printer_models",
  "tasks",
  "approvals",
  "ai_recommendations",
  "agents",
  "evidence",
  "knowledge_notes",
  "memory_records",
  "products",
  "customers",
  "leads",
  "memberships",
  "profiles",
] as const;

/**
 * Remove everything created by the run: all tenant rows under the three orgs
 * (children first), then the orgs, then the auth users. Resilient — collects and
 * ignores per-op errors so teardown always completes.
 */
export async function teardown(ctx: LiveContext): Promise<void> {
  const { admin } = ctx;
  const orgs = [ctx.orgA, ctx.orgB, ctx.orgP];
  for (const table of TENANT_TEARDOWN_ORDER) {
    for (const org of orgs) {
      try {
        await admin.from(table).delete().eq("organization_id", org);
      } catch {
        /* teardown must not throw */
      }
    }
  }
  for (const org of orgs) {
    try {
      await admin.from("organizations").delete().eq("id", org);
    } catch {
      /* ignore */
    }
  }
  for (const id of ctx.userIds) {
    try {
      await admin.auth.admin.deleteUser(id);
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// deterministic entity builders (valid per src/domain/schemas.ts)
// ---------------------------------------------------------------------------

const NOW = "2026-07-30T08:00:00.000Z";
const DAY = "2026-07-30";
const base = { createdAt: NOW, updatedAt: NOW };

export function makeCustomer(id: string, over: Partial<Customer> = {}): Customer {
  return {
    id,
    ...base,
    name: "לקוח בדיקה",
    type: "עסק",
    phone: "",
    email: "",
    city: "",
    organizationId: null,
    printerSummary: "",
    courseNames: [],
    revenue: 0,
    contactState: "פעיל",
    review: null,
    status: "פעיל",
    ...over,
  };
}

export function makeContact(id: string, customerId: string, over: Partial<Contact> = {}): Contact {
  return { id, ...base, customerId, name: "איש קשר", role: "", phone: "", email: "", isPrimary: true, ...over };
}

export function makeLead(id: string, ownerId: string, over: Partial<Lead> = {}): Lead {
  return {
    id,
    ...base,
    name: "ליד בדיקה",
    phone: "",
    email: "",
    source: "אתר",
    interest: "מדפסת",
    status: "חדש",
    ownerId,
    followUp: DAY,
    notes: "",
    history: [],
    ...over,
  };
}

export function makeOpportunity(id: string, ownerId: string, over: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    ...base,
    name: "הזדמנות בדיקה",
    leadId: null,
    customerId: null,
    stage: "זיהוי",
    amount: 1000,
    expectedClose: DAY,
    ownerId,
    notes: "",
    ...over,
  };
}

export function makeQuotation(id: string, ownerId: string, over: Partial<Quotation> = {}): Quotation {
  return {
    id,
    ...base,
    customerName: "לקוח בדיקה",
    customerId: null,
    title: "הצעת מחיר",
    lines: [{ id: "ln-1", description: "פריט", quantity: 1, unitPrice: 100, productId: null }],
    discountPercent: 0,
    terms: "",
    validUntil: DAY,
    status: "טיוטה",
    ownerId,
    ...over,
  };
}

export function makePrinterModel(id: string, over: Partial<PrinterModel> = {}): PrinterModel {
  return { id, ...base, name: "מדפסת דגם", manufacturer: "Teragon", technology: "FDM", price: 4990, tags: [], note: "", ...over };
}

export function makeServiceTicket(id: string, ownerId: string, over: Partial<ServiceTicket> = {}): ServiceTicket {
  return {
    id,
    ...base,
    customerName: "לקוח בדיקה",
    customerId: null,
    printer: "",
    issue: "לא מדפיס",
    description: "",
    priority: "בינונית",
    status: "חדש",
    openedAt: DAY,
    ownerId,
    solution: "",
    ...over,
  };
}

export function makeCourse(id: string, instructorId: string, over: Partial<Course> = {}): Course {
  return {
    id,
    ...base,
    name: "קורס בדיקה",
    type: "",
    start: DAY,
    end: DAY,
    price: 0,
    status: "פעיל",
    zoom: "",
    instructorId,
    isAI: false,
    blurb: "",
    ...over,
  };
}

export function makeStudent(id: string, over: Partial<Student> = {}): Student {
  return { id, ...base, name: "תלמיד", phone: "", email: "", userId: null, status: "פעיל", ...over };
}

export function makeStageProgress(over: Partial<StageProgress> = {}): StageProgress {
  return {
    stageId: "stage-1",
    status: "בעבודה",
    due: DAY,
    text: "משימת שלב",
    files: [{ name: "spec.pdf", size: "12kb" }],
    links: [{ label: "מקור", url: "https://example.test/x" }],
    checklistDone: ["c1"],
    notes: [{ author: "מדריך", text: "התקדמות טובה", date: DAY }],
    help: "",
    updated: NOW,
    ...over,
  };
}

export function makeEnrollment(id: string, studentId: string, courseId: string, over: Partial<Enrollment> = {}): Enrollment {
  return {
    id,
    ...base,
    studentId,
    studentName: "תלמיד",
    courseId,
    payment: "ממתין",
    stages: [makeStageProgress()],
    ...over,
  };
}

export function makeAgent(id: string, over: Partial<Agent> = {}): Agent {
  return {
    id,
    ...base,
    name: "סוכן בדיקה",
    purpose: "בדיקה",
    allowedTools: [],
    allowedDomains: [],
    prohibitedDomains: [],
    promptVersion: "v1",
    limits: { maxTasksPerDay: 1, maxActionsPerTask: 1, dailyBudgetILS: 0 },
    status: "פעיל",
    ...over,
  };
}

export function makeRecommendation(id: string, agentId: string, over: Partial<AIRecommendation> = {}): AIRecommendation {
  return {
    id,
    ...base,
    agentId,
    title: "המלצה",
    reason: "נתונים",
    evidenceIds: [],
    confidenceMethod: null,
    nextAction: "לפתוח משימה",
    approvalRequired: true,
    approvalId: null,
    entityRef: null,
    ...over,
  };
}

export function makeApproval(id: string, requestedById: string, over: Partial<Approval> = {}): Approval {
  return {
    id,
    ...base,
    subjectRef: "recommendation:rec-x",
    requestedById,
    requestedAt: NOW,
    status: "ממתין",
    decidedById: null,
    decidedAt: null,
    note: "",
    ...over,
  };
}

export function makeTask(id: string, ownerId: string, over: Partial<Task> = {}): Task {
  return {
    id,
    ...base,
    title: "משימה",
    description: "",
    status: "פתוחה",
    priority: "בינונית",
    due: DAY,
    ownerId,
    relatedRef: null,
    ...over,
  };
}

export function makeKnowledgeNote(id: string, over: Partial<KnowledgeNote> = {}): KnowledgeNote {
  return { id, ...base, title: "פתק ידע", category: "כללי", content: "תוכן", sourceRef: null, approved: false, tags: [], ...over };
}

export function makeMemoryRecord(id: string, over: Partial<MemoryRecord> = {}): MemoryRecord {
  return { id, ...base, title: "זיכרון", markdown: "", frontmatter: {}, folder: "", tags: [], links: [], ...over };
}

export function makeAuditEvent(id: string, over: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id,
    ...base,
    at: NOW,
    actor: "system",
    action: "test.event",
    entityRef: null,
    details: "אירוע ביקורת",
    correlationId: null,
    ...over,
  };
}

export function makeEvidence(id: string, over: Partial<Evidence> = {}): Evidence {
  return {
    id,
    ...base,
    subjectRef: "recommendation:rec-x",
    sourceType: "computation",
    sourceRef: "",
    claim: "טענה",
    capturedAt: NOW,
    ...over,
  };
}
