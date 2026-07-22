import { useState } from "react";
import type { ReactElement } from "react";
import {
  Panel,
  KpiCard,
  StatusChip,
  SectionTitle,
  DataTable,
  type DataTableColumn,
  OsButton,
  Stepper,
  type StepperStep,
  AgentCard,
  TierCard,
  ConfidenceBar,
  GlowOrb,
  EmptyState,
  Drawer,
  Modal,
  Tabs,
  ToastProvider,
  useToast,
  type OsStatus,
} from "../index";
import { AppShell, LeftIntelligenceRail, type NavItem } from "../../layout";

/**
 * DesignShowcase — renders every OS primitive + the full AppShell with
 * realistic Hebrew demo content. ALL content here is labelled "נתוני הדגמה"
 * — it is NOT production data and no metric here is real.
 * The Architect wires this to a route; this file does not touch the router.
 */

const DEMO_NAV: readonly NavItem[] = [
  { id: "command-center", label: "מרכז שליטה", icon: "home", href: "/" },
  { id: "customers", label: "לקוחות ולידים", icon: "users", href: "/customers", badge: 6 },
  { id: "sales", label: "מכירות והתאמות", icon: "briefcase", href: "/sales" },
  { id: "courses", label: "קורסים והכשרות", icon: "graduation", href: "/courses" },
  { id: "service", label: "שירות ותיקונים", icon: "wrench", href: "/service", badge: 16 },
  { id: "printers", label: "מדפסות וציוד", icon: "printer", href: "/printers" },
  { id: "organizations", label: "ארגונים ומוסדות", icon: "building", href: "/organizations" },
  { id: "agents", label: "סוכני AI", icon: "bot", href: "/agents" },
  { id: "knowledge", label: "מאגר ידע", icon: "book", href: "/knowledge" },
  { id: "memory", label: "זיכרון ארגוני", icon: "memory", href: "/memory" },
  { id: "analytics", label: "אנליטיקה", icon: "gauge", href: "/analytics" },
  { id: "settings", label: "הגדרות מערכת", icon: "gear", href: "/settings" },
];

const DEMO_STEPS: readonly StepperStep[] = [
  { id: "lead", label: "ליד לאחר הרשמה", icon: "users", count: 18 },
  { id: "quote", label: "הצעת ייעוץ", icon: "doc", count: 9 },
  { id: "match", label: "התאמת מדפסת", icon: "printer", count: 23 },
  { id: "order", label: "הזמנה ראשונה", icon: "briefcase", count: 12 },
  { id: "delivery", label: "אספקה והטמעה", icon: "check", count: 6 },
  { id: "followup", label: "פנייה חוזרת", icon: "clock", count: 47 },
];

interface DemoTicket {
  id: string;
  time: string;
  customer: string;
  subject: string;
  owner: string;
  status: OsStatus;
}

const DEMO_ROWS: readonly DemoTicket[] = [
  {
    id: "q-7781",
    time: "20:41",
    customer: 'תעשיות אלון בע"מ',
    subject: "התאמת חומרים למדפסת Bambu Lab X1E",
    owner: "רועי לוין",
    status: "הושלם",
  },
  {
    id: "q-7782",
    time: "20:38",
    customer: "סטודיו קליק",
    subject: "הדרכת PLA מתקדמת — קבוצה ב׳",
    owner: "נועה כהן",
    status: "ממתין",
  },
  {
    id: "q-7783",
    time: "20:34",
    customer: "מכללת אופק",
    subject: "תקלת ראש הדפסה — Prusa MK4",
    owner: "דן אברג׳יל",
    status: "אזהרה",
  },
  {
    id: "q-7784",
    time: "20:30",
    customer: "חממת הנגב",
    subject: "הצעת מחיר לחוות הדפסה (5 יח׳)",
    owner: "יעל שקד",
    status: "דורש אישור",
  },
  {
    id: "q-7785",
    time: "20:25",
    customer: "בית ספר רימון",
    subject: "חידוש מנוי תחזוקה שנתי",
    owner: "רועי לוין",
    status: "מושהה",
  },
];

const TICKET_COLUMNS: readonly DataTableColumn<DemoTicket>[] = [
  { key: "time", header: "שעה", numeric: true, width: 64 },
  { key: "customer", header: "לקוח" },
  { key: "subject", header: "נושא" },
  { key: "owner", header: "מטפל" },
  {
    key: "status",
    header: "סטטוס",
    align: "center",
    render: (row) => <StatusChip status={row.status} />,
  },
];

const ALL_STATUSES: readonly OsStatus[] = [
  "פעיל",
  "ממתין",
  "דורש אישור",
  "חסום",
  "מושבת",
  "הושלם",
  "אזהרה",
  "מושהה",
];

function DemoRail(): ReactElement {
  return (
    <LeftIntelligenceRail title="מרכז ראיות ואישור (נתוני הדגמה)">
      <Panel variant="raised" accent="cyan">
        <SectionTitle icon="bot" title="Hunter" subtitle="סוכן מכירות · הדגמה" />
        <ConfidenceBar value={72} label="רמת ביטחון (הדגמה)" />
        <div
          style={{
            display: "flex",
            gap: "var(--os-space-3)",
            marginBlockStart: "var(--os-space-5)",
          }}
        >
          <OsButton variant="approve" size="sm" icon="check">
            אשר
          </OsButton>
          <OsButton variant="ghost" size="sm">
            ערוך
          </OsButton>
          <OsButton variant="reject" size="sm" icon="x">
            דחה
          </OsButton>
        </div>
      </Panel>
      <Panel>
        <SectionTitle icon="brain" title="חשיבה ונתונים" subtitle="Trace · הדגמה" />
        <ConfidenceBar value={null} label="דיוק המלצה — טרם נמדד" />
      </Panel>
      <EmptyState
        icon="memory"
        title="אין רשומות זיכרון"
        reason="זהו מסך הדגמה — מודול הזיכרון הארגוני טרם חובר."
      />
    </LeftIntelligenceRail>
  );
}

function ShowcaseBody(): ReactElement {
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState("journey");

  return (
    <>
      {/* ── Greeting (canonical identity) ── */}
      <div>
        <h1 style={{ fontSize: "var(--os-text-2xl)", fontWeight: 700 }}>ערב טוב, צחי</h1>
        <p style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          מסך הדגמה של מערכת העיצוב — כל המספרים בעמוד זה הם נתוני הדגמה בלבד.
        </p>
      </div>

      {/* ── KPI row ── */}
      <section aria-label="כרטיסי KPI — נתוני הדגמה">
        <SectionTitle icon="gauge" title="מדדים ראשיים" subtitle="נתוני הדגמה" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--os-space-5)",
          }}
        >
          <KpiCard
            title="עסקאות פעילות (הדגמה)"
            value={23}
            delta={27}
            spark={[8, 11, 9, 14, 13, 18, 23]}
            accent="cyan"
            icon="briefcase"
            glow
          />
          <KpiCard
            title="הצעות פתוחות (הדגמה)"
            value={12}
            delta={18}
            spark={[5, 7, 6, 9, 8, 11, 12]}
            accent="blue"
            icon="doc"
          />
          <KpiCard
            title="שווי צבר (הדגמה)"
            value="148,200 ₪"
            delta={15}
            spark={[90, 95, 110, 104, 122, 131, 148]}
            accent="success"
            icon="target"
          />
          <KpiCard
            title="פניות שירות (הדגמה)"
            value={7}
            delta={-8}
            spark={[12, 10, 11, 9, 8, 9, 7]}
            accent="warning"
            icon="wrench"
          />
          <KpiCard
            title="הדרכות שהושלמו (הדגמה)"
            value={4}
            delta={0}
            spark={[3, 4, 3, 4, 4, 3, 4]}
            accent="violet"
            icon="graduation"
          />
        </div>
      </section>

      {/* ── Tabs + Stepper ── */}
      <Panel>
        <Tabs
          ariaLabel="תצוגות הדגמה"
          items={[
            { id: "journey", label: "מסע הלקוח", badge: 6 },
            { id: "agents", label: "סוכנים", badge: 4 },
            { id: "support", label: "מודל תמיכה", badge: 3 },
          ]}
          activeId={tab}
          onChange={setTab}
        />
        <div style={{ paddingBlockStart: "var(--os-space-6)" }}>
          {tab === "journey" && (
            <>
              <SectionTitle icon="target" title="מסע הלקוח במכירה" subtitle="נתוני הדגמה" />
              <Stepper steps={DEMO_STEPS} activeId="match" />
            </>
          )}
          {tab === "agents" && (
            <>
              <SectionTitle
                icon="network"
                title="זרימת התיאום בין הסוכנים"
                subtitle="נתוני הדגמה"
              />
              <div style={{ display: "flex", gap: "var(--os-space-5)", flexWrap: "wrap" }}>
                <AgentCard
                  name="Human Approval"
                  role="אישור אנושי"
                  accent="success"
                  icon="shield"
                  owner="גיל יעקבי"
                  input="המלצה"
                  output="אישור / דחייה"
                  status="ממתין"
                  evidenceCount={1}
                />
                <AgentCard
                  name="Orchestrator"
                  role="מאמת את התוצאה"
                  accent="blue"
                  icon="network"
                  owner="נועה כהן"
                  input="תוצרי סוכנים"
                  output="תכנית הדרכה"
                  status="פעיל"
                  evidenceCount={3}
                />
                <AgentCard
                  name="Mentor"
                  role="Training Plan"
                  accent="violet"
                  icon="graduation"
                  owner="נועה כהן"
                  input="פרופיל לקוח"
                  output="תכנית הדרכה"
                  status="הושלם"
                  evidenceCount={3}
                />
                <AgentCard
                  name="Fixer"
                  role="Service Review"
                  accent="warning"
                  icon="wrench"
                  owner="ארז מלכה"
                  input="היסטוריית שירות"
                  output="סיכון שירות"
                  status="אזהרה"
                  evidenceCount={4}
                />
                <AgentCard
                  name="Hunter"
                  role="Agent Task"
                  accent="cyan"
                  icon="target"
                  owner="יעל שקד"
                  input="ליד חדש"
                  output="פרופיל דרישות"
                  status="הושלם"
                  evidenceCount={5}
                />
                <AgentCard
                  name="Wiki"
                  role="Knowledge Check"
                  accent="cyan"
                  icon="book"
                  owner="דן אברג׳יל"
                  input="שאילתת ידע"
                  output="התאמות קטלוג"
                  status="הושלם"
                  evidenceCount={null}
                />
              </div>
            </>
          )}
          {tab === "support" && (
            <>
              <SectionTitle icon="shield" title="מודל תמיכה תלת-שלבי" subtitle="נתוני הדגמה" />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "var(--os-space-6)",
                }}
              >
                <TierCard
                  title="Tier 1"
                  subtitle="שירות עצמי"
                  accent="cyan"
                  icon="book"
                  items={["שאלות נפוצות (FAQ)", "מאגר ידע", "סוכן AI פנימי", "חומרים והדרכות"]}
                  footerTime="מיידי"
                />
                <TierCard
                  title="Tier 2"
                  subtitle="Champions"
                  accent="blue"
                  icon="users"
                  items={["צ׳אט ייעודי", "תמיכה מעמיתים", "Champion מקומי", "הכוונה ופתרון בעיות"]}
                  footerTime="שעתיים"
                />
                <TierCard
                  title="Tier 3"
                  subtitle="AI Implementer + IT"
                  accent="violet"
                  icon="wrench"
                  items={["נושאים מורכבים", "החלטות מדיניות", "הסלמה טכנית", "בדיקות ותאימות"]}
                  footerTime="יום עבודה"
                />
              </div>
            </>
          )}
        </div>
      </Panel>

      {/* ── Table ── */}
      <section aria-label="טבלת יומן — נתוני הדגמה">
        <SectionTitle
          icon="doc"
          title="יומן פניות"
          subtitle="נתוני הדגמה"
          action={
            <OsButton
              variant="ghost"
              size="sm"
              icon="plus"
              onClick={() => toast("פנייה חדשה — פעולת הדגמה", "info")}
            >
              פנייה חדשה
            </OsButton>
          }
        />
        <DataTable<DemoTicket>
          columns={TICKET_COLUMNS}
          rows={DEMO_ROWS}
          rowKey="id"
          rowClassName={(row) => (row.status === "מושהה" ? "os-panel--accent-danger" : "")}
          onRowClick={() => setDrawerOpen(true)}
          footer={<span>מציג 5 מתוך 5 · נתוני הדגמה</span>}
          maxHeight={320}
        />
      </section>

      {/* ── Statuses + buttons + confidence ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--os-space-6)" }}>
        <Panel>
          <SectionTitle icon="check" title="סטטוסים קנוניים" subtitle="8 בלבד" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--os-space-4)" }}>
            {ALL_STATUSES.map((s) => (
              <StatusChip key={s} status={s} />
            ))}
          </div>
        </Panel>
        <Panel>
          <SectionTitle icon="gear" title="כפתורים וחוזה שקיפות" />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--os-space-4)",
              alignItems: "center",
            }}
          >
            <OsButton onClick={() => setModalOpen(true)}>פתח חלון</OsButton>
            <OsButton
              variant="cyan"
              icon="sparkle"
              onClick={() => toast("נשמר בהצלחה — הדגמה", "success")}
            >
              הצג Toast
            </OsButton>
            <OsButton
              variant="approve"
              icon="check"
              onClick={() => toast("אושר — פעולת הדגמה", "success")}
            >
              אשר
            </OsButton>
            <OsButton
              variant="reject"
              icon="x"
              onClick={() => toast("נדחה — פעולת הדגמה", "warning")}
            >
              דחה
            </OsButton>
            <OsButton variant="violet" disabled disabledReason="נדרשות ראיות נוספות לפני המלצה">
              שלח המלצה
            </OsButton>
          </div>
          <div
            style={{
              display: "grid",
              gap: "var(--os-space-5)",
              marginBlockStart: "var(--os-space-6)",
            }}
          >
            <ConfidenceBar value={91} label="רמת ביטחון גבוהה (הדגמה)" />
            <ConfidenceBar value={45} label="רמת ביטחון בינונית (הדגמה)" />
            <ConfidenceBar value={null} />
          </div>
        </Panel>
      </div>

      {/* ── Empty state + orb ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--os-space-6)" }}>
        <EmptyState
          title="אין נתונים להצגה"
          reason="זהו מצב ריק מדגים — מקור הנתונים של המסך טרם חובר."
          action={
            <OsButton
              variant="ghost"
              size="sm"
              disabled
              disabledReason="חיבור מקור נתונים ייפתח ב-Wave 2"
            >
              חבר מקור נתונים
            </OsButton>
          }
        />
        <Panel
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--os-space-6)",
          }}
        >
          <GlowOrb size={64} accent="violet" />
          <GlowOrb size={48} accent="cyan" />
          <GlowOrb size={36} accent="blue" animated={false} />
        </Panel>
      </div>

      {/* ── Overlays ── */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="פרטי פנייה (הדגמה)">
        <p style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          תוכן הדגמה של מגירה הקשרית. במוצר האמיתי יוצגו כאן פרטי הרשומה שנבחרה.
        </p>
      </Drawer>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="חלון הדגמה"
        footer={
          <>
            <OsButton variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              ביטול
            </OsButton>
            <OsButton
              size="sm"
              onClick={() => {
                setModalOpen(false);
                toast("הפעולה הושלמה — הדגמה", "success");
              }}
            >
              אישור
            </OsButton>
          </>
        }
      >
        <p style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          מודאל עם מלכודת פוקוס בסיסית וסגירה ב-ESC. כל התוכן — נתוני הדגמה.
        </p>
      </Modal>
    </>
  );
}

/** Default export — mount as a route element (e.g. /design). */
export default function DesignShowcase(): ReactElement {
  return (
    <ToastProvider>
      <AppShell
        navItems={DEMO_NAV}
        activeNavId="command-center"
        user={{ name: "צחי זוסטייהם", role: 'מנכ"ל · טרגון טכנולוגיות' }}
        railContent={<DemoRail />}
        headerProps={{ notificationsCount: 3, mailCount: 1 }}
      >
        <ShowcaseBody />
      </AppShell>
    </ToastProvider>
  );
}
