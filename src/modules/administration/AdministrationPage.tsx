// W8-C — /administration (Phase 8.8): ניהול המערכת — משתמשים, 9 תפקידים
// קנוניים, הרשאות, ארגונים, סקירת גישה, בקשות שינוי מנוהלות דרך מנוע האישורים
// הקנוני (מאשר בשם, לעולם לא עצמי, לעולם לא סוכן AI), מצב חירום ו-Audit.
// הכול "ניהול הרשאות במצב הדגמה מקומי" — נתונים אמיתיים מהמאגר, אין הצלחות
// מזויפות. מכבד את מצב ההדגמה לבוחן (useDemoModeGuard).
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import "./AdministrationPage.css";
import {
  DataTable,
  EmptyState,
  KpiCard,
  Modal,
  OsButton,
  OsIcon,
  Panel,
  SectionTitle,
  StatusChip,
  Tabs,
  useToast,
  type DataTableColumn,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import { useDemoModeGuard } from "@/presentation/demoMode";
import type { Activity, Agent, AuditEvent, BaseEntity, Organization, User } from "@/domain/types";
import type {
  AccessChangeRequestRecord,
  AccessReviewRecord,
  AdministrativeUser,
  AdministrationRecord,
  CanonicalRoleId,
  EmergencyControlKind,
  EmergencyDisableRecord,
  GrantLevel,
  PermissionDomain,
  RoleDefinitionRecord,
} from "@/domain/administration";
import {
  ADMIN_DEMO_LABEL_HE,
  AdministrationError,
  CANONICAL_ROLE_NAMES_HE,
  EMERGENCY_CONTROL_KINDS,
  EMERGENCY_CONTROL_LABELS_HE,
  GRANT_LEVELS,
  GRANT_LEVEL_LABELS_HE,
  PERMISSION_DOMAINS,
  PERMISSION_DOMAIN_LABELS_HE,
  isAiAgentId,
} from "@/domain/administration";
import {
  AdministrationService,
  EMERGENCY_HONEST_SCOPE_HE,
  useEmergencyFlags,
} from "@/administration";
import { agentStores } from "@/repositories/agentStores";
import { roleStores } from "@/repositories/roleStores";
import { userStores } from "@/repositories/userStores";
import { dateTimeHe } from "@/modules/quotations/fmt";
import {
  activeEmergencies,
  adminAuditOf,
  bridgeUsers,
  canonicalRolesOf,
  changeRequestsOf,
  combinationWarnings,
  emergencyRecordsOf,
  grantsSummaryHe,
} from "./lib";

const CURRENT_ACTOR_ID = "u-tzachi"; // canonical identity (D-005)

// stable empty fallbacks — keep useMemo deps referentially stable while loading
const EMPTY_USERS: User[] = [];
const EMPTY_BASE: BaseEntity[] = [];
const EMPTY_ADMIN_RECORDS: AdministrationRecord[] = [];
const EMPTY_REVIEWS: AccessReviewRecord[] = [];
const EMPTY_AGENTS: Agent[] = [];

const stack = (gap = "var(--os-space-4)"): CSSProperties => ({ display: "grid", gap });

const ADMIN_COLLECTIONS = [
  "users",
  "roles",
  "accessChangeRequests",
  "accessReviews",
  "auditEvents",
  "agents",
  "approvals",
  "agentEvents",
  "agentRuns",
] as const;

function makeService(): AdministrationService {
  return new AdministrationService({
    stores: userStores(),
    roles: roleStores(),
    agentStores: agentStores(),
  });
}

function errHe(err: unknown): string {
  if (err instanceof AdministrationError) return err.detailHe;
  if (err instanceof Error) return err.message;
  return "שגיאה לא מזוהה";
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: "grid", gap: 2, fontSize: "var(--os-text-sm, 13px)" }}>
      <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// modals
// ---------------------------------------------------------------------------

interface CreateUserModalProps {
  onClose: () => void;
  onDone: () => Promise<void>;
}

const LEGACY_ROLES: readonly User["role"][] = [
  'מנכ"ל',
  "מכירות",
  "מדריך",
  "תמיכה",
  "תלמיד",
  "מנהל מערכת",
];

function CreateUserModal({ onClose, onDone }: CreateUserModalProps): ReactElement {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [legacyRole, setLegacyRole] = useState<User["role"]>("תלמיד");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (): Promise<void> => {
    if (!name.trim() || !email.trim()) {
      setError("שם ודוא״ל הם שדות חובה");
      return;
    }
    setBusy(true);
    try {
      await makeService().createDemoUser({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || "050-0000000",
        legacyRole,
        actorId: CURRENT_ACTOR_ID,
        actorName: "צחי זוסטייהם",
      });
      toast(`משתמש ההדגמה «${name.trim()}» נוצר (${ADMIN_DEMO_LABEL_HE})`, "success");
      await onDone();
      onClose();
    } catch (err) {
      setError(errHe(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="משתמש הדגמה חדש">
      <div className="os-qc-form" data-testid="create-user-modal">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-user-name">שם מלא</label>
          <input id="adm-user-name" className="os-qc-input" type="text" value={name}
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-user-email">דוא"ל</label>
          <input id="adm-user-email" className="os-qc-input" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-user-phone">טלפון</label>
          <input id="adm-user-phone" className="os-qc-input" type="text" value={phone}
            onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-user-role">תפקיד (מיפוי legacy → קנוני)</label>
          <select id="adm-user-role" className="os-qc-input" value={legacyRole}
            onChange={(e) => setLegacyRole(e.target.value as User["role"])}>
            {LEGACY_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {error && <span className="os-qc-error" role="alert">{error}</span>}
        </div>
        <div className="os-qc-actions">
          {busy ? (
            <OsButton disabled disabledReason="שמירה מתבצעת…">שומר…</OsButton>
          ) : (
            <OsButton onClick={() => void save()}>יצירת משתמש הדגמה</OsButton>
          )}
          <OsButton variant="ghost" onClick={onClose}>ביטול</OsButton>
        </div>
      </div>
    </Modal>
  );
}

interface EditUserModalProps {
  user: User;
  onClose: () => void;
  onDone: () => Promise<void>;
}

function EditUserModal({ user, onClose, onDone }: EditUserModalProps): ReactElement {
  const { toast } = useToast();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (): Promise<void> => {
    if (!name.trim()) {
      setError("שם הוא שדה חובה");
      return;
    }
    setBusy(true);
    try {
      await makeService().updateUserDisplay(
        user.id,
        { name: name.trim(), email: email.trim(), phone: phone.trim() },
        CURRENT_ACTOR_ID,
      );
      toast("פרטי התצוגה עודכנו", "success");
      await onDone();
      onClose();
    } catch (err) {
      setError(errHe(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`עריכת פרטי תצוגה — ${user.name}`}>
      <div className="os-qc-form">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-edit-name">שם מלא</label>
          <input id="adm-edit-name" className="os-qc-input" type="text" value={name}
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-edit-email">דוא"ל</label>
          <input id="adm-edit-email" className="os-qc-input" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-edit-phone">טלפון</label>
          <input id="adm-edit-phone" className="os-qc-input" type="text" value={phone}
            onChange={(e) => setPhone(e.target.value)} />
          {error && <span className="os-qc-error" role="alert">{error}</span>}
        </div>
        <div className="os-qc-actions">
          {busy ? (
            <OsButton disabled disabledReason="שמירה מתבצעת…">שומר…</OsButton>
          ) : (
            <OsButton onClick={() => void save()}>שמירה</OsButton>
          )}
          <OsButton variant="ghost" onClick={onClose}>ביטול</OsButton>
        </div>
      </div>
    </Modal>
  );
}

interface AssignRoleModalProps {
  row: AdministrativeUser;
  roles: readonly RoleDefinitionRecord[];
  onClose: () => void;
  onDone: () => Promise<void>;
}

function AssignRoleModal({ row, roles, onClose, onDone }: AssignRoleModalProps): ReactElement {
  const { toast } = useToast();
  const [roleId, setRoleId] = useState<CanonicalRoleId>(row.roleId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      await makeService().assignRole(row.user.id, roleId, CURRENT_ACTOR_ID);
      toast(`הוקצה התפקיד ${CANONICAL_ROLE_NAMES_HE[roleId]} ל-${row.user.name}`, "success");
      await onDone();
      onClose();
    } catch (err) {
      setError(errHe(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`הקצאת תפקיד — ${row.user.name}`}>
      <div className="os-qc-form" data-testid="assign-role-modal">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-assign-role">תפקיד קנוני (9 בלבד)</label>
          <select id="adm-assign-role" className="os-qc-input" value={roleId}
            onChange={(e) => setRoleId(e.target.value as CanonicalRoleId)}>
            {roles.map((r) => (
              <option key={r.roleId} value={r.roleId}>{r.nameHe}</option>
            ))}
          </select>
          <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            שינוי תפקיד מאפס חריגים אישיים (נרשם ב-Audit)
          </span>
          {error && <span className="os-qc-error" role="alert">{error}</span>}
        </div>
        <div className="os-qc-actions">
          {busy ? (
            <OsButton disabled disabledReason="שמירה מתבצעת…">שומר…</OsButton>
          ) : (
            <OsButton onClick={() => void save()}>הקצאה</OsButton>
          )}
          <OsButton variant="ghost" onClick={onClose}>ביטול</OsButton>
        </div>
      </div>
    </Modal>
  );
}

interface RequestChangeModalProps {
  kind: "user-override" | "role-grant";
  /** user row for user-override, role record for role-grant */
  targetUser?: AdministrativeUser;
  targetRole?: RoleDefinitionRecord;
  users: readonly User[];
  onClose: () => void;
  onDone: () => Promise<void>;
}

function RequestChangeModal(props: RequestChangeModalProps): ReactElement {
  const { toast } = useToast();
  const [domain, setDomain] = useState<PermissionDomain>("crm");
  const [level, setLevel] = useState<GrantLevel>("read");
  const [approverId, setApproverId] = useState("");
  const [noteHe, setNoteHe] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const targetId = props.kind === "user-override" ? props.targetUser?.user.id : props.targetRole?.roleId;
  const targetNameHe =
    props.kind === "user-override" ? props.targetUser?.user.name : props.targetRole?.nameHe;
  const currentLevel: GrantLevel | null =
    props.kind === "user-override"
      ? (props.targetUser?.effectiveGrants[domain] ?? null)
      : (props.targetRole?.grants[domain] ?? null);

  // named human approvers only: active, not the requester, never ag-*
  const approvers = props.users.filter(
    (u) => u.status === "פעיל" && u.id !== CURRENT_ACTOR_ID && !isAiAgentId(u.id),
  );

  const previewHe =
    targetNameHe && currentLevel !== null
      ? `${props.kind === "user-override" ? "שינוי הרשאה למשתמש" : "שינוי הרשאת תפקיד"} «${targetNameHe}» · ` +
        `${PERMISSION_DOMAIN_LABELS_HE[domain]}: ${GRANT_LEVEL_LABELS_HE[currentLevel]} ← ${GRANT_LEVEL_LABELS_HE[level]}`
      : "";

  const submit = async (): Promise<void> => {
    if (!targetId) return;
    if (!approverId) {
      setError("יש לבחור מאשר בשם — אישור עצמי חסום");
      return;
    }
    const approver = approvers.find((u) => u.id === approverId);
    if (!approver) {
      setError("המאשר שנבחר אינו זמין");
      return;
    }
    setBusy(true);
    try {
      await makeService().requestPermissionChange({
        kind: props.kind,
        targetId,
        domain,
        newLevel: level,
        requestedById: CURRENT_ACTOR_ID,
        requestedByName: "צחי זוסטייהם",
        approverId: approver.id,
        approverName: approver.name,
        noteHe,
      });
      toast(`בקשת השינוי נשלחה לאישור של ${approver.name}`, "success");
      await props.onDone();
      props.onClose();
    } catch (err) {
      setError(errHe(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={props.onClose} title={`בקשת שינוי הרשאות — ${targetNameHe ?? ""}`}>
      <div className="os-qc-form" data-testid="request-change-modal">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-req-domain">תחום</label>
          <select id="adm-req-domain" className="os-qc-input" value={domain}
            onChange={(e) => setDomain(e.target.value as PermissionDomain)}>
            {PERMISSION_DOMAINS.map((d) => (
              <option key={d} value={d}>{PERMISSION_DOMAIN_LABELS_HE[d]}</option>
            ))}
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-req-level">רמה חדשה</label>
          <select id="adm-req-level" className="os-qc-input" value={level}
            onChange={(e) => setLevel(e.target.value as GrantLevel)}>
            {GRANT_LEVELS.map((l) => (
              <option key={l} value={l}>{GRANT_LEVEL_LABELS_HE[l]}</option>
            ))}
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-req-approver">מאשר בשם (לא המבקש)</label>
          <select id="adm-req-approver" className="os-qc-input" value={approverId}
            onChange={(e) => setApproverId(e.target.value)}>
            <option value="">— בחרו מאשר —</option>
            {approvers.map((u) => (
              <option key={u.id} value={u.id}>{u.name} · {u.role}</option>
            ))}
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="adm-req-note">נימוק (רשות)</label>
          <input id="adm-req-note" className="os-qc-input" type="text" value={noteHe}
            onChange={(e) => setNoteHe(e.target.value)} />
        </div>
        {previewHe && (
          <Panel variant="raised" style={{ padding: "var(--os-space-3)" }}>
            <Field label="תצוגה מקדימה — מה יקרה אם יאושר">
              <span data-testid="change-preview">{previewHe}</span>
            </Field>
          </Panel>
        )}
        {error && <span className="os-qc-error" role="alert">{error}</span>}
        <div className="os-qc-actions">
          {busy ? (
            <OsButton disabled disabledReason="שולח…">שולח…</OsButton>
          ) : (
            <OsButton onClick={() => void submit()}>שליחה לאישור</OsButton>
          )}
          <OsButton variant="ghost" onClick={props.onClose}>ביטול</OsButton>
        </div>
      </div>
    </Modal>
  );
}

interface ConfirmModalProps {
  title: string;
  bodyHe: string;
  confirmLabelHe: string;
  requireReason?: boolean;
  danger?: boolean;
  onConfirm: (reasonHe: string) => Promise<void>;
  onClose: () => void;
}

function ConfirmModal(props: ConfirmModalProps): ReactElement {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (): Promise<void> => {
    if (props.requireReason && !reason.trim()) {
      setError("נדרש נימוק");
      return;
    }
    setBusy(true);
    try {
      await props.onConfirm(reason.trim());
      props.onClose();
    } catch (err) {
      setError(errHe(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={props.onClose} title={props.title}>
      <div className="os-qc-form" data-testid="confirm-modal">
        <p style={{ margin: 0, fontSize: "var(--os-text-sm, 13px)" }}>{props.bodyHe}</p>
        {props.requireReason && (
          <div className="os-qc-field">
            <label className="os-qc-label" htmlFor="adm-confirm-reason">נימוק</label>
            <input id="adm-confirm-reason" className="os-qc-input" type="text" value={reason}
              onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {error && <span className="os-qc-error" role="alert">{error}</span>}
        <div className="os-qc-actions">
          {busy ? (
            <OsButton disabled disabledReason="מבצע…">מבצע…</OsButton>
          ) : (
            <OsButton variant={props.danger ? "danger" : "primary"} onClick={() => void run()}
              data-testid="confirm-modal-confirm">
              {props.confirmLabelHe}
            </OsButton>
          )}
          <OsButton variant="ghost" onClick={props.onClose}>ביטול</OsButton>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// the page
// ---------------------------------------------------------------------------

type ModalState =
  | { kind: "create-user" }
  | { kind: "edit-user"; row: AdministrativeUser }
  | { kind: "assign-role"; row: AdministrativeUser }
  | { kind: "request-user-change"; row: AdministrativeUser }
  | { kind: "request-role-change"; role: RoleDefinitionRecord }
  | { kind: "confirm"; props: Omit<ConfirmModalProps, "onClose"> }
  | null;

export default function AdministrationPage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const { guard } = useDemoModeGuard();
  const { flags } = useEmergencyFlags();
  const [tab, setTab] = useState("users");
  const [modal, setModal] = useState<ModalState>(null);
  const [bridged, setBridged] = useState(false);

  const usersQ = useCollection<User>("users");
  const rolesQ = useCollection<BaseEntity>("roles");
  const activitiesQ = useCollection<Activity>("activities");
  const orgsQ = useCollection<Organization>("organizations");
  const adminRecordsQ = useCollection<AdministrationRecord>("accessChangeRequests");
  const reviewsQ = useCollection<AccessReviewRecord>("accessReviews");
  const auditQ = useCollection<AuditEvent>("auditEvents");
  const agentsQ = useCollection<Agent>("agents");

  const queries = [usersQ, rolesQ, activitiesQ, orgsQ, adminRecordsQ, reviewsQ, auditQ, agentsQ];
  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  // idempotent baseline bridge on mount (9 roles + assignments + reviews)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await makeService().ensureBaseline();
        if (!cancelled) {
          setBridged(true);
          await invalidate([...ADMIN_COLLECTIONS]);
        }
      } catch (err) {
        if (!cancelled) toast(`גשר ה-baseline נכשל: ${errHe(err)}`, "danger");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invalidate, toast]);

  const users = usersQ.data ?? EMPTY_USERS;
  const roles = useMemo(() => canonicalRolesOf(rolesQ.data ?? EMPTY_BASE), [rolesQ.data]);
  const adminRecords = adminRecordsQ.data ?? EMPTY_ADMIN_RECORDS;
  const reviews = reviewsQ.data ?? EMPTY_REVIEWS;
  const agents = agentsQ.data ?? EMPTY_AGENTS;

  const rows = useMemo(
    () =>
      bridgeUsers({
        users,
        activities: activitiesQ.data ?? [],
        organizations: orgsQ.data ?? [],
        adminRecords,
        reviews,
        roles,
      }),
    [users, activitiesQ.data, orgsQ.data, adminRecords, reviews, roles],
  );
  const requests = useMemo(() => changeRequestsOf(adminRecords), [adminRecords]);
  const emergencies = useMemo(() => emergencyRecordsOf(adminRecords), [adminRecords]);
  const actives = useMemo(() => activeEmergencies(adminRecords), [adminRecords]);
  const warnings = useMemo(() => combinationWarnings(roles, rows), [roles, rows]);
  const adminAudit = useMemo(() => adminAuditOf(auditQ.data ?? []), [auditQ.data]);
  const pendingRequests = requests.filter((r) => r.status === "ממתין");
  const pendingReviews = reviews.filter((r) => r.status === "ממתין");
  const disabledAgentCount = agents.filter((a) => a.status === "מושבת").length;
  const emergencyActiveCount = actives.length + (disabledAgentCount > 0 ? 1 : 0);

  const refresh = async (): Promise<void> => {
    await invalidate([...ADMIN_COLLECTIONS]);
  };

  /** demo-mode + toast wrapper for destructive actions */
  const guarded = (actionHe: string, run: () => void): void => {
    const verdict = guard(actionHe);
    if (!verdict.allowed) {
      toast(verdict.reasonHe, "warning");
      return;
    }
    run();
  };

  const decideRequest = async (
    req: AccessChangeRequestRecord,
    kind: "approve" | "reject",
    noteHe: string,
  ): Promise<void> => {
    const svc = makeService();
    if (kind === "approve") {
      await svc.approveChangeRequest(req.id, CURRENT_ACTOR_ID, noteHe || undefined);
      toast("הבקשה אושרה, בוצעה ואומתה בקריאה חוזרת", "success");
    } else {
      await svc.rejectChangeRequest(req.id, CURRENT_ACTOR_ID, noteHe);
      toast("הבקשה נדחתה — לא בוצע שינוי", "warning");
    }
    await refresh();
  };

  const activateEmergency = async (
    control: EmergencyControlKind,
    reasonHe: string,
    targetAgentId?: string,
  ): Promise<void> => {
    await makeService().activateEmergencyControl({
      control,
      targetAgentId,
      actorId: CURRENT_ACTOR_ID,
      actorName: "צחי זוסטייהם",
      reasonHe,
    });
    toast(`${EMERGENCY_CONTROL_LABELS_HE[control]} הופעלה ונרשמה ב-Audit`, "warning");
    await refresh();
  };

  if (isError) {
    return (
      <EmptyState icon="alert" title="טעינת נתוני הניהול נכשלה"
        reason="קריאת הנתונים מהמאגר המקומי נכשלה. רעננו את הדף." />
    );
  }
  if (isLoading || !bridged) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען את נתוני הניהול ומגשר את 9 התפקידים הקנוניים…
      </div>
    );
  }

  // ---------------------------------------------------------------- columns
  const userCols: DataTableColumn<AdministrativeUser>[] = [
    {
      key: "name",
      header: "שם",
      render: (r) => (
        <span style={{ display: "grid" }}>
          <span style={{ fontWeight: 600 }}>{r.user.name}</span>
          <span className="os-ltr" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            {r.user.email}
          </span>
        </span>
      ),
    },
    { key: "role", header: "תפקיד", render: (r) => r.roleNameHe },
    { key: "org", header: "ארגון", render: (r) => r.organizationNames.join(" · ") || "—" },
    {
      key: "status",
      header: "סטטוס",
      render: (r) => <StatusChip status={r.suspended ? "מושהה" : "פעיל"} label={r.suspended ? "מושהה" : "פעיל"} />,
    },
    {
      key: "activity",
      header: "פעילות אחרונה",
      render: (r) =>
        r.lastActivityAt ? (
          <span className="os-num">{dateTimeHe(r.lastActivityAt)}</span>
        ) : (
          "אין פעילות רשומה"
        ),
    },
    { key: "grants", header: "תמצית הרשאות", render: (r) => grantsSummaryHe(r.effectiveGrants) },
    {
      key: "review",
      header: "סקירה ממתינה",
      render: (r) =>
        r.pendingReviewCount > 0 ? <StatusChip status="ממתין" label={`${r.pendingReviewCount} ממתינה`} /> : "—",
    },
    {
      key: "actions",
      header: "פעולות",
      render: (r) => (
        // VC-F: primary "עריכה" stays reachable; secondary + emergency-style
        // actions (תפקיד · שינוי הרשאה · השעיה) move behind a quiet disclosure
        // so a destructive red button is not permanently shown on every row.
        <span className="os-row-actions-cell">
          <OsButton variant="ghost" size="sm" onClick={() => setModal({ kind: "edit-user", row: r })}>
            עריכה
          </OsButton>
          <details className="os-row-actions" data-testid={`user-actions-${r.user.id}`}>
            <summary aria-label={`פעולות נוספות עבור ${r.user.name}`}>פעולות</summary>
            <div className="os-row-actions__menu" role="menu">
              <OsButton variant="ghost" size="sm" data-testid={`assign-role-${r.user.id}`}
                onClick={() => guarded("הקצאת תפקיד", () => setModal({ kind: "assign-role", row: r }))}>
                הקצאת תפקיד
              </OsButton>
              <OsButton variant="ghost" size="sm" data-testid={`request-change-${r.user.id}`}
                onClick={() => guarded("בקשת שינוי הרשאות", () => setModal({ kind: "request-user-change", row: r }))}>
                שינוי הרשאה
              </OsButton>
              {r.suspended ? (
                <OsButton variant="success" size="sm"
                  onClick={() =>
                    guarded("החזרת גישה", () =>
                      setModal({
                        kind: "confirm",
                        props: {
                          title: `החזרת גישה — ${r.user.name}`,
                          bodyHe: "גישת ההדגמה תוחזר והפעולה תירשם ב-Audit.",
                          confirmLabelHe: "החזרת גישה",
                          onConfirm: async () => {
                            await makeService().reactivateUser(r.user.id, CURRENT_ACTOR_ID);
                            toast("הגישה הוחזרה", "success");
                            await refresh();
                          },
                        },
                      }),
                    )
                  }>
                  החזרת גישה
                </OsButton>
              ) : (
                <OsButton variant="danger" size="sm" data-testid={`suspend-${r.user.id}`}
                  onClick={() =>
                    guarded("השעיית גישה", () =>
                      setModal({
                        kind: "confirm",
                        props: {
                          title: `השעיית גישה — ${r.user.name}`,
                          bodyHe: "גישת ההדגמה תושעה (סטטוס «לא פעיל») והפעולה תירשם ב-Audit.",
                          confirmLabelHe: "השעיה",
                          requireReason: true,
                          danger: true,
                          onConfirm: async (reason) => {
                            await makeService().suspendUser(r.user.id, CURRENT_ACTOR_ID, reason);
                            toast("הגישה הושעתה", "warning");
                            await refresh();
                          },
                        },
                      }),
                    )
                  }>
                  השעיית גישה
                </OsButton>
              )}
            </div>
          </details>
        </span>
      ),
    },
  ];

  const requestCols: DataTableColumn<AccessChangeRequestRecord>[] = [
    { key: "preview", header: "שינוי מבוקש", render: (r) => r.previewHe },
    { key: "requester", header: "מבקש", render: (r) => r.requestedByName },
    { key: "approver", header: "מאשר בשם", render: (r) => r.approverName },
    {
      key: "status",
      header: "סטטוס",
      render: (r) => (
        <StatusChip
          status={r.status === "ממתין" ? "ממתין" : r.status === "בוצע" ? "הושלם" : "חסום"}
          label={r.status}
        />
      ),
    },
    {
      key: "verified",
      header: "אומת",
      render: (r) =>
        r.status === "בוצע" ? (r.verifiedAt ? <StatusChip status="הושלם" label="אומת" /> : "לא אומת") : "—",
    },
    {
      key: "actions",
      header: "הכרעה",
      render: (r) => {
        if (r.status !== "ממתין") return <span className="os-num">{r.decidedAt ? dateTimeHe(r.decidedAt) : "—"}</span>;
        const iAmApprover = r.approverId === CURRENT_ACTOR_ID;
        const selfRequest = r.requestedById === CURRENT_ACTOR_ID;
        const reason = selfRequest
          ? "אישור עצמי חסום — מבקש השינוי אינו מכריע בבקשתו"
          : `רק המאשר בשם (${r.approverName}) רשאי להכריע`;
        return (
          <span style={{ display: "inline-flex", gap: 6 }}>
            {iAmApprover && !selfRequest ? (
              <>
                <OsButton variant="approve" size="sm" data-testid={`approve-request-${r.id}`}
                  onClick={() =>
                    guarded("אישור בקשת שינוי", () =>
                      setModal({
                        kind: "confirm",
                        props: {
                          title: "אישור בקשת שינוי הרשאות",
                          bodyHe: `${r.previewHe} — לאחר האישור השינוי יבוצע ויאומת בקריאה חוזרת.`,
                          confirmLabelHe: "אישור וביצוע",
                          onConfirm: (note) => decideRequest(r, "approve", note),
                        },
                      }),
                    )
                  }>
                  אישור
                </OsButton>
                <OsButton variant="reject" size="sm" data-testid={`reject-request-${r.id}`}
                  onClick={() =>
                    guarded("דחיית בקשת שינוי", () =>
                      setModal({
                        kind: "confirm",
                        props: {
                          title: "דחיית בקשת שינוי",
                          bodyHe: `${r.previewHe} — דחייה אינה משנה דבר ונרשמת ב-Audit.`,
                          confirmLabelHe: "דחייה",
                          requireReason: true,
                          danger: true,
                          onConfirm: (note) => decideRequest(r, "reject", note),
                        },
                      }),
                    )
                  }>
                  דחייה
                </OsButton>
              </>
            ) : (
              <OsButton size="sm" disabled disabledReason={reason}>
                הכרעה
              </OsButton>
            )}
          </span>
        );
      },
    },
  ];

  const reviewCols: DataTableColumn<AccessReviewRecord>[] = [
    { key: "user", header: "משתמש", render: (r) => r.userName },
    { key: "role", header: "תפקיד", render: (r) => CANONICAL_ROLE_NAMES_HE[r.roleId] },
    {
      key: "status",
      header: "סטטוס",
      render: (r) => (
        <StatusChip status={r.status === "ממתין" ? "ממתין" : r.status === "אושר" ? "הושלם" : "חסום"} label={r.status} />
      ),
    },
    { key: "due", header: "יעד", render: (r) => <span className="os-num">{dateTimeHe(r.dueAt)}</span> },
    {
      key: "decided",
      header: "הוכרעה",
      render: (r) => (r.decidedByName ? `${r.decidedByName} · ${r.decidedAt ? dateTimeHe(r.decidedAt) : ""}` : "—"),
    },
    {
      key: "actions",
      header: "הכרעה",
      render: (r) => {
        if (r.status !== "ממתין") return "—";
        if (r.userId === CURRENT_ACTOR_ID) {
          return (
            <OsButton size="sm" disabled disabledReason="משתמש אינו סוקר את הגישה של עצמו">
              הכרעה
            </OsButton>
          );
        }
        return (
          <span style={{ display: "inline-flex", gap: 6 }}>
            <OsButton variant="approve" size="sm" data-testid={`approve-review-${r.id}`}
              onClick={() =>
                guarded("אישור סקירת גישה", () =>
                  setModal({
                    kind: "confirm",
                    props: {
                      title: `אישור גישה — ${r.userName}`,
                      bodyHe: "אישור הסקירה מאשר שהגישה הנוכחית נדרשת ותקינה.",
                      confirmLabelHe: "אישור גישה",
                      requireReason: true,
                      onConfirm: async (note) => {
                        await makeService().decideAccessReview(r.id, "אושר", CURRENT_ACTOR_ID, "צחי זוסטייהם", note);
                        toast("סקירת הגישה אושרה", "success");
                        await refresh();
                      },
                    },
                  }),
                )
              }>
              אישור
            </OsButton>
            <OsButton variant="reject" size="sm"
              onClick={() =>
                guarded("דחיית סקירת גישה", () =>
                  setModal({
                    kind: "confirm",
                    props: {
                      title: `דחיית גישה — ${r.userName}`,
                      bodyHe: "דחיית הסקירה מסמנת שהגישה דורשת טיפול (אינה משנה הרשאות בעצמה).",
                      confirmLabelHe: "דחייה",
                      requireReason: true,
                      danger: true,
                      onConfirm: async (note) => {
                        await makeService().decideAccessReview(r.id, "נדחה", CURRENT_ACTOR_ID, "צחי זוסטייהם", note);
                        toast("סקירת הגישה נדחתה — נרשם ב-Audit", "warning");
                        await refresh();
                      },
                    },
                  }),
                )
              }>
              דחייה
            </OsButton>
          </span>
        );
      },
    },
  ];

  const emergencyCols: DataTableColumn<EmergencyDisableRecord>[] = [
    { key: "control", header: "בקרה", render: (r) => EMERGENCY_CONTROL_LABELS_HE[r.control] },
    { key: "target", header: "יעד", render: (r) => (r.targetRef ? <span className="os-ltr">{r.targetRef}</span> : "כלל-מערכתי") },
    {
      key: "state",
      header: "מצב",
      render: (r) => <StatusChip status={r.state === "פעיל" ? "אזהרה" : "מושבת"} label={r.state} />,
    },
    { key: "by", header: "הופעלה על ידי", render: (r) => r.activatedByName },
    { key: "reason", header: "נימוק", render: (r) => r.reasonHe },
    { key: "scope", header: "היקף כן", render: (r) => r.honestScopeHe },
    {
      key: "actions",
      header: "פעולות",
      render: (r) =>
        r.state === "פעיל" ? (
          <OsButton variant="success" size="sm" data-testid={`deactivate-emergency-${r.id}`}
            onClick={() =>
              guarded("ביטול בקרת חירום", () =>
                setModal({
                  kind: "confirm",
                  props: {
                    title: `ביטול — ${EMERGENCY_CONTROL_LABELS_HE[r.control]}`,
                    bodyHe: "בקרת החירום תבוטל והפעולה תירשם ב-Audit.",
                    confirmLabelHe: "ביטול הבקרה",
                    onConfirm: async () => {
                      await makeService().deactivateEmergencyControl(r.id, CURRENT_ACTOR_ID, "צחי זוסטייהם");
                      toast("בקרת החירום בוטלה", "success");
                      await refresh();
                    },
                  },
                }),
              )
            }>
            ביטול
          </OsButton>
        ) : (
          <span className="os-num">{r.deactivatedAt ? dateTimeHe(r.deactivatedAt) : "—"}</span>
        ),
    },
  ];

  const auditCols: DataTableColumn<AuditEvent>[] = [
    { key: "action", header: "פעולה", render: (a) => <span className="os-ltr">{a.action}</span> },
    { key: "actor", header: "מבצע", render: (a) => <span className="os-ltr">{a.actor}</span> },
    { key: "details", header: "פירוט" },
    { key: "at", header: "מתי", render: (a) => <span className="os-num">{dateTimeHe(a.at)}</span> },
  ];

  // ---------------------------------------------------------------- render
  return (
    <div style={stack("var(--os-space-5)")} data-testid="administration-page">
      <PageRail>
        <div style={stack("var(--os-space-4)")}>
          <div style={stack("var(--os-space-2)")}>
            <div style={{ fontSize: "var(--os-text-2xs, 11px)", fontWeight: 600, color: "var(--os-text-2)" }}>
              ממתין להכרעה
            </div>
            <div style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>סקירות גישה</span>
                <span className="os-num">{pendingReviews.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>בקשות שינוי</span>
                <span className="os-num">{pendingRequests.length}</span>
              </div>
            </div>
          </div>
          <div style={stack("var(--os-space-2)")}>
            <div style={{ fontSize: "var(--os-text-2xs, 11px)", fontWeight: 600, color: "var(--os-text-2)" }}>
              מצבי חירום פעילים
            </div>
            {actives.length === 0 && disabledAgentCount === 0 ? (
              <span style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>אין</span>
            ) : (
              <div style={{ display: "grid", gap: 4, fontSize: "var(--os-text-2xs, 11px)" }}>
                {actives.map((e) => (
                  <StatusChip key={e.id} status="אזהרה" label={EMERGENCY_CONTROL_LABELS_HE[e.control]} />
                ))}
                {disabledAgentCount > 0 && (
                  <StatusChip status="מושבת" label={`${disabledAgentCount} סוכנים מושבתים`} />
                )}
              </div>
            )}
          </div>
          <div style={stack("var(--os-space-2)")}>
            <div style={{ fontSize: "var(--os-text-2xs, 11px)", fontWeight: 600, color: "var(--os-text-2)" }}>
              שילובים אסורים
            </div>
            {warnings.length === 0 ? (
              <span style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
                אין — הכללים נאכפים קונסטרוקטיבית
              </span>
            ) : (
              <div style={{ display: "grid", gap: 4, fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-danger, #EC5D68)" }}>
                {warnings.map((w, i) => (
                  <span key={i}>{w.subjectHe}: {w.violation.detailHe}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            {ADMIN_DEMO_LABEL_HE}
          </div>
        </div>
      </PageRail>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "var(--os-space-3)" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>ניהול המערכת</h1>
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm, 13px)" }}>
            9 תפקידים קנוניים · שינויי הרשאות דרך מנוע האישורים הקנוני · מאשר בשם, לעולם לא עצמי, לעולם לא סוכן AI
          </div>
        </div>
        <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          {ADMIN_DEMO_LABEL_HE}
        </span>
      </div>

      {/* VC-F: four action-driving KPIs only; a zero renders neutral grey (0 is
          not success and not attention). The passive registry count (9 canonical
          roles) moves into "מדדים נוספים". */}
      <div data-testid="administration-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "var(--os-space-3)" }}>
        <KpiCard title="מצבי חירום פעילים" value={emergencyActiveCount} accent="danger" icon="alert" muted={emergencyActiveCount === 0} />
        <KpiCard title="סקירות גישה ממתינות" value={pendingReviews.length} accent="warning" icon="clock" muted={pendingReviews.length === 0} />
        <KpiCard title="בקשות שינוי ממתינות" value={pendingRequests.length} accent="warning" icon="inbox" muted={pendingRequests.length === 0} />
        <KpiCard title="משתמשים" value={rows.length} accent="blue" icon="users" muted={rows.length === 0} />
      </div>

      <details data-testid="administration-more-metrics" className="os-more-metrics">
        <summary>מדדים נוספים</summary>
        <div className="os-more-metrics__grid">
          <div className="os-more-metrics__item">
            <span>תפקידים קנוניים</span>
            <span className="os-num">{roles.length}</span>
          </div>
        </div>
      </details>

      <Tabs
        items={[
          // VC-F: show a count badge only when > 0 (hide zero badges).
          { id: "users", label: "משתמשים", badge: rows.length || undefined },
          { id: "roles", label: "תפקידים", badge: roles.length || undefined },
          { id: "permissions", label: "הרשאות" },
          { id: "organizations", label: "ארגונים" },
          { id: "reviews", label: "סקירת גישה", badge: pendingReviews.length || undefined },
          { id: "requests", label: "בקשות שינוי", badge: pendingRequests.length || undefined },
          { id: "emergency", label: "מצב חירום", badge: emergencyActiveCount || undefined },
          { id: "audit", label: "Audit", badge: adminAudit.length || undefined },
        ]}
        activeId={tab}
        onChange={setTab}
      />

      {tab === "users" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--os-space-3)" }}>
            <SectionTitle title="משתמשים" subtitle="גשר מ-5 משתמשי ה-seed · פעילות אחרונה מרשומות אמת" icon="users" />
            <OsButton icon="plus" data-testid="create-user-button"
              onClick={() => guarded("יצירת משתמש הדגמה", () => setModal({ kind: "create-user" }))}>
              משתמש הדגמה חדש
            </OsButton>
          </div>
          <div style={{ overflowX: "auto", marginBlockStart: "var(--os-space-3)" }}>
            <DataTable columns={userCols} rows={rows} rowKey={(r) => r.user.id}
              emptyText="אין משתמשים" emptyReason="גשר ה-baseline טרם רץ." />
          </div>
        </Panel>
      )}

      {tab === "roles" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="מטריצת התפקידים (9 קנוניים)"
            subtitle="שינוי הרשאת תפקיד עובר דרך בקשת שינוי מאושרת — אין grant-all שקט" icon="shield" />
          <div style={{ overflowX: "auto", marginBlockStart: "var(--os-space-3)" }}>
            <table className="os-table" data-testid="role-matrix" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>תפקיד</th>
                  {PERMISSION_DOMAINS.map((d) => (
                    <th key={d} style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
                      {PERMISSION_DOMAIN_LABELS_HE[d]}
                    </th>
                  ))}
                  <th>פעולה</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.roleId}>
                    <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{role.nameHe}</td>
                    {PERMISSION_DOMAINS.map((d) => (
                      <td key={d} style={{ textAlign: "center" }}>
                        <span
                          className="os-chip os-chip--muted"
                          data-grant={role.grants[d]}
                          style={
                            role.grants[d] === "approve"
                              ? { color: "var(--os-violet, #7655FF)" }
                              : role.grants[d] === "write"
                                ? { color: "var(--os-cyan, #20C4E8)" }
                                : role.grants[d] === "none"
                                  ? { opacity: 0.45 }
                                  : undefined
                          }
                        >
                          {GRANT_LEVEL_LABELS_HE[role.grants[d]]}
                        </span>
                      </td>
                    ))}
                    <td>
                      <OsButton variant="ghost" size="sm" data-testid={`edit-role-${role.roleId}`}
                        onClick={() =>
                          guarded("בקשת שינוי הרשאת תפקיד", () => setModal({ kind: "request-role-change", role }))
                        }>
                        בקשת שינוי
                      </OsButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            {roles.map((r) => r.descriptionHe).length === 9
              ? "בדיוק 9 תפקידים קנוניים (נאכף)"
              : `אזהרה: ${roles.length} תפקידים — נדרשים בדיוק 9`}
          </p>
        </Panel>
      )}

      {tab === "permissions" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="קטלוג ההרשאות" subtitle="13 תחומים · 4 רמות (ללא / קריאה / כתיבה / אישור)" icon="doc" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--os-space-3)", marginBlockStart: "var(--os-space-3)" }}>
            {PERMISSION_DOMAINS.map((d) => (
              <Panel key={d} variant="raised" style={{ padding: "var(--os-space-3)", display: "grid", gap: 4 }}>
                <span style={{ fontWeight: 600 }}>{PERMISSION_DOMAIN_LABELS_HE[d]}</span>
                <span className="os-ltr" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>{d}</span>
                <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
                  רמות: {GRANT_LEVELS.map((l) => GRANT_LEVEL_LABELS_HE[l]).join(" · ")}
                </span>
              </Panel>
            ))}
          </div>
          <p style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            כללי שילוב אסור (נאכפים בסכמה ובשירות): צופה לעולם אינו כותב · Champion לעולם אינו עורך
            מדיניות מערכת · מכירות ללא זיכרון טכני מוגבל · שירות לעולם אינו מאשר הנחות כספיות ·
            סוכן AI (ag-*) לעולם אינו נושא תפקיד ואינו מאשר.
          </p>
        </Panel>
      )}

      {tab === "organizations" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="שיוך ארגוני" subtitle="נגזר מנתוני ההדגמה — כל המשתמשים שייכים לארגון טרגון" icon="building" />
          <div style={{ overflowX: "auto", marginBlockStart: "var(--os-space-3)" }}>
            <DataTable
              columns={[
                { key: "user", header: "משתמש", render: (r: AdministrativeUser) => r.user.name },
                { key: "org", header: "ארגון", render: (r: AdministrativeUser) => r.organizationNames.join(" · ") || "—" },
                { key: "role", header: "תפקיד", render: (r: AdministrativeUser) => r.roleNameHe },
                { key: "source", header: "מקור", render: () => "נגזר מנתוני ההדגמה" },
              ]}
              rows={rows}
              rowKey={(r) => r.user.id}
              emptyText="אין שיוכים"
              emptyReason="גשר ה-baseline טרם רץ."
            />
          </div>
        </Panel>
      )}

      {tab === "reviews" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="סקירת גישה" subtitle="סקירה תקופתית לכל משתמש — הכרעה בשם, לא על עצמך" icon="check" />
          <div style={{ overflowX: "auto", marginBlockStart: "var(--os-space-3)" }}>
            <DataTable columns={reviewCols} rows={[...reviews].sort((a, b) => a.id.localeCompare(b.id))} rowKey="id"
              emptyText="אין סקירות" emptyReason="גשר ה-baseline יוצר סקירה ראשונה לכל משתמש." />
          </div>
        </Panel>
      )}

      {tab === "requests" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="בקשות שינוי הרשאות"
            subtitle="תצוגה מקדימה → אישור במנוע הקנוני → ביצוע → אימות בקריאה חוזרת → Audit" icon="inbox" />
          <div style={{ overflowX: "auto", marginBlockStart: "var(--os-space-3)" }}>
            <DataTable columns={requestCols} rows={requests} rowKey="id"
              emptyText="אין בקשות שינוי"
              emptyReason="בקשת שינוי נפתחת מטבלת המשתמשים או ממטריצת התפקידים." />
          </div>
        </Panel>
      )}

      {tab === "emergency" && (
        <div style={stack("var(--os-space-4)")}>
          <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
            <SectionTitle title="בקרות חירום" subtitle="כל הפעלה — דיאלוג אישור + נימוק + רשומת חירום + Audit" icon="alert" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--os-space-3)", marginBlockStart: "var(--os-space-3)" }}>
              {EMERGENCY_CONTROL_KINDS.map((control) => {
                const flagActive =
                  control === "remote-ai-disable" ? flags.remoteAiDisabled
                    : control === "automation-execution-disable" ? flags.automationExecutionDisabled
                      : control === "permission-change-lock" ? flags.permissionChangeLocked
                        : control === "read-only-mode" ? flags.readOnlyMode
                          : disabledAgentCount > 0;
                return (
                  <Panel key={control} variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: "var(--os-space-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <OsIcon name="alert" size={14} />
                        {EMERGENCY_CONTROL_LABELS_HE[control]}
                      </span>
                      <StatusChip status={flagActive ? "אזהרה" : "פעיל"} label={flagActive ? "מופעל" : "כבוי"} />
                    </div>
                    <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
                      {EMERGENCY_HONEST_SCOPE_HE[control]}
                    </span>
                    {control === "agent-disable" ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        {agents.map((a) => (
                          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: "var(--os-text-sm, 13px)" }}>
                            <span>{a.name} <StatusChip status={a.status === "מושבת" ? "מושבת" : "פעיל"} label={a.status} /></span>
                            {a.status !== "מושבת" && (
                              <OsButton variant="danger" size="sm" data-testid={`emergency-disable-${a.id}`}
                                onClick={() =>
                                  guarded("השבתת סוכן", () =>
                                    setModal({
                                      kind: "confirm",
                                      props: {
                                        title: `השבתת חירום — ${a.name}`,
                                        bodyHe: EMERGENCY_HONEST_SCOPE_HE["agent-disable"],
                                        confirmLabelHe: "השבתה",
                                        requireReason: true,
                                        danger: true,
                                        onConfirm: (reason) => activateEmergency("agent-disable", reason, a.id),
                                      },
                                    }),
                                  )
                                }>
                                השבתה
                              </OsButton>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>
                        {!flagActive && (
                          <OsButton variant="danger" size="sm" data-testid={`emergency-activate-${control}`}
                            onClick={() =>
                              guarded(EMERGENCY_CONTROL_LABELS_HE[control], () =>
                                setModal({
                                  kind: "confirm",
                                  props: {
                                    title: `הפעלת ${EMERGENCY_CONTROL_LABELS_HE[control]}`,
                                    bodyHe: EMERGENCY_HONEST_SCOPE_HE[control],
                                    confirmLabelHe: "הפעלה",
                                    requireReason: true,
                                    danger: true,
                                    onConfirm: (reason) => activateEmergency(control, reason),
                                  },
                                }),
                              )
                            }>
                            הפעלה
                          </OsButton>
                        )}
                      </div>
                    )}
                  </Panel>
                );
              })}
            </div>
          </Panel>
          <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
            <SectionTitle title="רשומות חירום" subtitle="כל הפעלה/ביטול — רשומה + Audit" icon="doc" />
            <div style={{ overflowX: "auto", marginBlockStart: "var(--os-space-3)" }}>
              <DataTable columns={emergencyCols} rows={emergencies} rowKey="id"
                emptyText="אין רשומות חירום" emptyReason="לא הופעלה אף בקרת חירום." />
            </div>
          </Panel>
        </div>
      )}

      {tab === "audit" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="Audit ניהולי" subtitle="כל רשומות admin.* מיומן הביקורת הקנוני" icon="evidence" />
          <div style={{ overflowX: "auto", marginBlockStart: "var(--os-space-3)" }}>
            <DataTable columns={auditCols} rows={adminAudit} rowKey="id"
              emptyText="אין רשומות" emptyReason="טרם בוצעה פעולת ניהול." />
          </div>
        </Panel>
      )}

      {modal?.kind === "create-user" && (
        <CreateUserModal onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal?.kind === "edit-user" && (
        <EditUserModal user={modal.row.user} onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal?.kind === "assign-role" && (
        <AssignRoleModal row={modal.row} roles={roles} onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal?.kind === "request-user-change" && (
        <RequestChangeModal kind="user-override" targetUser={modal.row} users={users}
          onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal?.kind === "request-role-change" && (
        <RequestChangeModal kind="role-grant" targetRole={modal.role} users={users}
          onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal?.kind === "confirm" && <ConfirmModal {...modal.props} onClose={() => setModal(null)} />}
    </div>
  );
}
