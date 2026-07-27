// Wave 3 — מכירות והתאמת מדפסות (/sales): the 10-step RTL customer journey,
// opportunities that actually move (persisted), and the rule-based printer
// matcher ("מנוע מקומי מבוסס כללים") that ends in a draft quotation.
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import {
  Drawer,
  EmptyState,
  KpiCard,
  OsButton,
  Panel,
  SectionTitle,
  Stepper,
  useToast,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import { getRepository, nextId } from "@/repositories";
import { CEO_USER_ID } from "@/repositories/seed";
import type { Opportunity, PrinterModel, Product, Quotation, User } from "@/domain/types";
import type { OpportunityX } from "@/integration/domainExtensions";
import { quotationSchema } from "@/domain/schemas";
import { ils, dateHe, todayIso } from "@/modules/quotations/fmt";
import {
  JOURNEY_STEPS,
  journeyConversion,
  journeyCounts,
  journeyStepOf,
  loadJourneyPositions,
  nextStep,
  saveJourneyPositions,
  stuckDeals,
  type JourneyPositions,
} from "./journey";
import {
  BUILD_VOLUMES,
  MATERIALS,
  matchPrinters,
  solutionEstimate,
  USE_CASES,
  type BuildVolume,
  type MatchResult,
  type MaterialChoice,
  type NeedAssessment,
  type UseCase,
} from "./matching";

const railTitle: CSSProperties = {
  fontSize: "var(--os-text-2xs, 11px)",
  fontWeight: 600,
  color: "var(--os-text-2)",
  marginBlockEnd: 6,
  letterSpacing: "0.04em",
};


interface MatchState {
  need: NeedAssessment;
  results: MatchResult[];
}

export default function SalesPage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();

  const oppsQ = useCollection<Opportunity>("opportunities");
  const modelsQ = useCollection<PrinterModel>("printerModels");
  const productsQ = useCollection<Product>("products");
  const usersQ = useCollection<User>("users");

  const opps = useMemo(() => oppsQ.data ?? [], [oppsQ.data]);
  const models = modelsQ.data ?? [];
  const products = productsQ.data ?? [];
  const users = usersQ.data ?? [];
  const today = todayIso();

  const [positions, setPositions] = useState<JourneyPositions>(() => loadJourneyPositions());
  const [useCase, setUseCase] = useState<UseCase>("תחביב");
  const [materials, setMaterials] = useState<readonly MaterialChoice[]>(["PLA"]);
  const [buildVolume, setBuildVolume] = useState<BuildVolume>("בינוני");
  const [budget, setBudget] = useState("4000");
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [previewMatch, setPreviewMatch] = useState<MatchResult | null>(null);
  const [creatingQuote, setCreatingQuote] = useState(false);

  const counts = useMemo(() => journeyCounts(opps, positions), [opps, positions]);
  const conversion = useMemo(() => journeyConversion(opps), [opps]);
  const stuck = useMemo(() => stuckDeals(opps, today), [opps, today]);

  const userName = (uid: string): string => users.find((u) => u.id === uid)?.name ?? uid;

  const advance = async (opp: Opportunity): Promise<void> => {
    const current = journeyStepOf(opp, positions);
    const next = nextStep(current);
    if (!next) {
      toast("ההזדמנות כבר בשלב האחרון של המסע", "info");
      return;
    }
    const nextPositions = { ...positions, [opp.id]: next.id };
    setPositions(nextPositions);
    // legacy convenience mirror only (m003) — the record field is canonical
    saveJourneyPositions(nextPositions);
    try {
      await getRepository<OpportunityX>("opportunities").update(opp.id, {
        journeyStepId: next.id,
        ...(next.stage !== opp.stage ? { stage: next.stage } : {}),
        updatedAt: new Date().toISOString(),
      });
      await invalidate(["opportunities"]);
      toast(`«${opp.name}» קודמה לשלב «${next.label}»`, "success");
    } catch {
      toast("שמירת השלב נכשלה — נסו שוב", "danger");
    }
  };

  const runMatch = (): void => {
    const b = Number(budget);
    if (!Number.isFinite(b) || b <= 0) {
      setBudgetError('יש להזין תקציב חיובי בש"ח');
      return;
    }
    if (materials.length === 0) {
      setBudgetError("יש לבחור לפחות חומר הדפסה אחד");
      return;
    }
    setBudgetError(null);
    const need: NeedAssessment = { useCase, materials, buildVolume, budget: b };
    setMatchState({ need, results: matchPrinters(models, need) });
  };

  const createDraftQuote = async (match: MatchResult): Promise<void> => {
    if (!matchState) return;
    setCreatingQuote(true);
    try {
      const estimate = solutionEstimate(match, products, matchState.need);
      const repo = getRepository<Quotation>("quotations");
      const existing = await repo.list();
      const qid = nextId(
        "q",
        existing.map((q) => q.id),
      );
      const now = new Date().toISOString();
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 14);

      const lines = [
        {
          id: `${qid}-1`,
          description: `${match.model.name} (${match.model.manufacturer})`,
          quantity: 1,
          unitPrice: match.model.price,
          productId: null,
        },
        ...estimate.accessories.map((a, i) => ({
          id: `${qid}-${i + 2}`,
          description: `${a.product.name} — ${a.reason}`,
          quantity: 1,
          unitPrice: a.product.price,
          productId: a.product.id,
        })),
        ...(estimate.recommendedCourse
          ? [
              {
                id: `${qid}-${estimate.accessories.length + 2}`,
                description: `${estimate.recommendedCourse.name} (קורס מומלץ)`,
                quantity: 1,
                unitPrice: estimate.recommendedCourse.price,
                productId: estimate.recommendedCourse.id,
              },
            ]
          : []),
      ];

      const quotation = quotationSchema.parse({
        id: qid,
        createdAt: now,
        updatedAt: now,
        customerName: "ליד חדש — התאמת מדפסת",
        customerId: null,
        title: `פתרון מלא: ${match.model.name}`,
        lines,
        discountPercent: 0,
        terms: "טיוטה שנוצרה ממנוע ההתאמה — לעדכן פרטי לקוח לפני שליחה",
        validUntil: validUntil.toISOString().slice(0, 10),
        status: "טיוטה",
        ownerId: CEO_USER_ID,
      } satisfies Quotation);

      await repo.create(quotation);
      await invalidate(["quotations", "notifications"]);
      toast(`נוצרה טיוטת הצעה ${qid} — זמינה במסך המסמכים`, "success", 6000);
      setPreviewMatch(null);
    } catch {
      toast("יצירת הטיוטה נכשלה — נסו שוב", "danger");
    } finally {
      setCreatingQuote(false);
    }
  };

  if (oppsQ.isError || modelsQ.isError || productsQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת מסך המכירות נכשלה"
        reason="קריאת הנתונים מ-IndexedDB המקומי נכשלה. רעננו את הדף."
      />
    );
  }
  if (oppsQ.isLoading || modelsQ.isLoading || productsQ.isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען הזדמנויות וקטלוג מדפסות מהמאגר המקומי…
      </div>
    );
  }

  const openOpps = opps.filter((o) => o.stage !== "נסגרה - זכייה" && o.stage !== "נסגרה - הפסד");
  const closedWonOpps = opps.filter((o) => o.stage === "נסגרה - זכייה");

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)" }} data-testid="sales-page">
      <PageRail>
        <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
          <div>
            <div style={railTitle}>סטטיסטיקת המסע</div>
            <div style={{ display: "grid", gap: 6, fontSize: "var(--os-text-sm, 12px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>הזדמנויות פתוחות</span>
                <span className="os-num">{conversion.open}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>זכיות</span>
                <span className="os-num" style={{ color: "var(--os-success)" }}>
                  {conversion.won}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>הפסדים</span>
                <span className="os-num" style={{ color: "var(--os-danger)" }}>
                  {conversion.lost}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>אחוז זכייה (הוכרעו)</span>
                <span className="os-num">
                  {conversion.winRate === null ? "טרם נמדד" : `${conversion.winRate}%`}
                </span>
              </div>
            </div>
          </div>
          <div>
            <div style={railTitle}>עסקאות תקועות</div>
            <div style={{ display: "grid", gap: 6, fontSize: "var(--os-text-sm, 12px)" }}>
              {stuck.length === 0 ? (
                <span style={{ color: "var(--os-muted)" }}>
                  אין עסקאות שחצו את מועד הסגירה הצפוי
                </span>
              ) : (
                stuck.map(({ opp, daysOverdue }) => (
                  <div key={opp.id} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{opp.name}</span>
                    <span className="os-num" style={{ color: "var(--os-danger)" }}>
                      {daysOverdue} ימים
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </PageRail>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: "var(--os-space-3)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>מסע הלקוח במכירה</h1>
        <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
          מנוע ההתאמה: מנוע מקומי מבוסס כללים · נתוני הדגמה
        </span>
      </div>

      {/* VC-C: primary KPIs only drive the current workflow — the open pipeline,
          its value (financial → neutral until it needs action), and deals that
          need attention. Zero stays neutral; amber shows only when >0. No glow.
          Passive win/loss measurements move to "מדדים נוספים". */}
      <div
        data-testid="sales-metrics"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--os-space-4)",
        }}
      >
        <KpiCard
          title="הזדמנויות פתוחות"
          value={conversion.open}
          accent="blue"
          icon="briefcase"
          muted={conversion.open === 0}
        />
        <KpiCard
          title="שווי צנרת פתוחה"
          value={ils(conversion.openValue)}
          icon="target"
          muted
        />
        <KpiCard
          title="עסקאות תקועות"
          value={stuck.length}
          accent="warning"
          icon="alert"
          muted={stuck.length === 0}
        />
      </div>

      <details data-testid="sales-more-metrics" className="os-more-metrics">
        <summary>מדדים נוספים</summary>
        <div className="os-more-metrics__grid">
          <div className="os-more-metrics__item">
            <span>אחוז זכייה (הוכרעו)</span>
            <span className="os-num">
              {conversion.winRate === null ? "טרם נמדד" : `${conversion.winRate}%`}
            </span>
          </div>
          <div className="os-more-metrics__item">
            <span>זכיות</span>
            <span className="os-num">{conversion.won}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>הפסדים</span>
            <span className="os-num">{conversion.lost}</span>
          </div>
        </div>
      </details>

      {/* the journey stepper */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)", overflowX: "auto" }}>
        <SectionTitle title="שלבי המסע" subtitle="מספר ההזדמנויות הפעילות בכל שלב" />
        <div style={{ marginBlockStart: "var(--os-space-3)", minInlineSize: 900 }}>
          <Stepper
            steps={JOURNEY_STEPS.map((s) => ({
              id: s.id,
              label: s.label,
              count: counts[s.id] ?? 0,
            }))}
          />
        </div>
      </Panel>

      {/* opportunities */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
        <SectionTitle
          title="הזדמנויות פעילות"
          subtitle="קידום שלב נשמר גם ברשומת ההזדמנות וגם במיקום המסע המקומי"
        />
        <div className="os-table-wrap" style={{ marginBlockStart: "var(--os-space-3)" }}>
          <div className="os-table-scroll">
            <table className="os-table" data-testid="opps-table">
              <thead>
                <tr>
                  <th>הזדמנות</th>
                  <th>שלב במסע</th>
                  <th>שווי</th>
                  <th>סגירה צפויה</th>
                  <th>בעלים</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {openOpps.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="os-table__empty" role="status">
                        <span>אין הזדמנויות פעילות</span>
                        <span className="os-table__empty-reason">
                          כל ההזדמנויות הוכרעו. הזדמנות חדשה נוצרת מליד שמבשיל ב-CRM.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  openOpps.map((o) => {
                    const step = journeyStepOf(o, positions);
                    const stepDef = JOURNEY_STEPS.find((s) => s.id === step);
                    return (
                      <tr key={o.id}>
                        <td>{o.name}</td>
                        <td data-testid={`journey-step-${o.id}`}>
                          {stepDef?.label ?? step}
                        </td>
                        <td>
                          <span className="os-num">{ils(o.amount)}</span>
                        </td>
                        <td>
                          <span
                            className="os-num"
                            style={
                              o.expectedClose < today ? { color: "var(--os-danger)" } : undefined
                            }
                          >
                            {dateHe(o.expectedClose)}
                          </span>
                        </td>
                        <td>{userName(o.ownerId)}</td>
                        <td>
                          <OsButton
                            size="sm"
                            variant="cyan"
                            data-testid={`advance-${o.id}`}
                            onClick={() => void advance(o)}
                          >
                            קדם שלב
                          </OsButton>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        {closedWonOpps.length > 0 && (
          <div
            style={{
              marginBlockStart: "var(--os-space-3)",
              fontSize: "var(--os-text-2xs, 11px)",
              color: "var(--os-text-2)",
            }}
          >
            נסגרו בזכייה: {closedWonOpps.map((o) => o.name).join(" · ")}
          </div>
        )}
      </Panel>

      {/* need assessment + matching */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
        <SectionTitle
          title="אבחון צרכים והתאמת מדפסת"
          subtitle="מנוע מקומי מבוסס כללים — ממליץ אך ורק מתוך קטלוג הדגמים של טרגון"
          icon="printer"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--os-space-3)",
            marginBlockStart: "var(--os-space-3)",
            alignItems: "end",
          }}
        >
          <div className="os-qc-field">
            <label className="os-qc-label" htmlFor="need-usecase">
              ייעוד עיקרי
            </label>
            <select
              id="need-usecase"
              className="os-qc-input"
              value={useCase}
              onChange={(e) => setUseCase(e.target.value as UseCase)}
            >
              {USE_CASES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="os-qc-field">
            <span className="os-qc-label">חומרי הדפסה</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {MATERIALS.map((m) => (
                <label
                  key={m}
                  style={{
                    display: "inline-flex",
                    gap: 4,
                    alignItems: "center",
                    fontSize: "var(--os-text-sm, 13px)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={materials.includes(m)}
                    onChange={(e) =>
                      setMaterials((prev) =>
                        e.target.checked ? [...prev, m] : prev.filter((x) => x !== m),
                      )
                    }
                  />
                  <span className="os-ltr">{m}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="os-qc-field">
            <label className="os-qc-label" htmlFor="need-volume">
              נפח הדפסה נדרש
            </label>
            <select
              id="need-volume"
              className="os-qc-input"
              value={buildVolume}
              onChange={(e) => setBuildVolume(e.target.value as BuildVolume)}
            >
              {BUILD_VOLUMES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="os-qc-field">
            <label className="os-qc-label" htmlFor="need-budget">
              תקציב (₪)
            </label>
            <input
              id="need-budget"
              className="os-qc-input"
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
            {budgetError && (
              <span className="os-qc-error" role="alert">
                {budgetError}
              </span>
            )}
          </div>
          <div>
            <OsButton icon="target" onClick={runMatch} data-testid="run-match">
              הפעלת מנוע ההתאמה
            </OsButton>
          </div>
        </div>

        {matchState && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "var(--os-space-3)",
              marginBlockStart: "var(--os-space-4)",
            }}
            data-testid="match-results"
          >
            {matchState.results.length === 0 ? (
              <EmptyState
                icon="printer"
                title="אין דגמים בקטלוג"
                reason="קטלוג הדגמים ריק — לא ניתן להמליץ מחוץ לקטלוג."
              />
            ) : (
              matchState.results.map((r, i) => {
                const estimate = solutionEstimate(r, products, matchState.need);
                const topMatch = i === 0;
                return (
                  <Panel
                    key={r.model.id}
                    variant="raised"
                    accent={topMatch ? "blue" : undefined}
                    style={{ padding: "var(--os-space-4)", display: "grid", gap: 10 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 8,
                      }}
                    >
                      <strong>{r.model.name}</strong>
                      {topMatch && (
                        <span
                          style={{
                            color: "var(--accent-primary-text)",
                            fontSize: "var(--os-text-2xs)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ההתאמה המובילה
                        </span>
                      )}
                    </div>
                    <div
                      style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}
                    >
                      {r.model.manufacturer} · {r.model.technology} ·{" "}
                      <span className="os-num">{ils(r.model.price)}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "var(--os-space-4)",
                        flexWrap: "wrap",
                        fontSize: "var(--os-text-2xs, 11px)",
                        color: "var(--os-text-2)",
                      }}
                    >
                      <span>
                        התאמות <span className="os-num">{r.suitability.length}</span>
                      </span>
                      {r.limitations.length > 0 && (
                        <span>
                          מגבלות <span className="os-num">{r.limitations.length}</span>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "var(--os-text-sm, 13px)" }}>
                      אומדן פתרון מלא:{" "}
                      <strong className="os-num">{ils(estimate.total)}</strong>{" "}
                      <span
                        style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}
                      >
                        (לפני מע"מ)
                      </span>
                    </div>
                    <OsButton
                      size="sm"
                      variant={topMatch ? "cyan" : "ghost"}
                      onClick={() => setPreviewMatch(r)}
                      data-testid={`match-details-${r.model.id}`}
                    >
                      פירוט התאמה ואישור
                    </OsButton>
                  </Panel>
                );
              })
            )}
          </div>
        )}
      </Panel>

      {/* VC-C: the recommendation's evidence (matching rules, limitations) and
          the full solution breakdown are shown here, on demand — not on every
          result card at once. Approval lives with the evidence it acts on. */}
      {previewMatch &&
        matchState &&
        (() => {
          const estimate = solutionEstimate(previewMatch, products, matchState.need);
          return (
            <Drawer
              open
              onClose={() => setPreviewMatch(null)}
              title={`פירוט התאמה — ${previewMatch.model.name}`}
            >
              <div
                style={{
                  display: "grid",
                  gap: "var(--os-space-4)",
                  fontSize: "var(--os-text-sm, 13px)",
                }}
                data-testid="match-detail"
              >
                <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
                  {previewMatch.model.manufacturer} · {previewMatch.model.technology} ·{" "}
                  <span className="os-num">{ils(previewMatch.model.price)}</span>
                </div>

                <div>
                  <strong style={{ color: "var(--success-text)" }}>התאמה</strong>
                  <ul style={{ margin: "4px 0 0", paddingInlineStart: "1.1em" }}>
                    {previewMatch.suitability.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                    {previewMatch.suitability.length === 0 && (
                      <li>לא נמצאו כללי התאמה חיוביים</li>
                    )}
                  </ul>
                </div>

                {previewMatch.limitations.length > 0 && (
                  <div>
                    <strong style={{ color: "var(--warning-text)" }}>מגבלות</strong>
                    <ul style={{ margin: "4px 0 0", paddingInlineStart: "1.1em" }}>
                      {previewMatch.limitations.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    borderBlockStart: "1px solid var(--os-border)",
                    paddingBlockStart: "var(--os-space-3)",
                  }}
                >
                  <div>
                    <strong>מדפסת: </strong>
                    {previewMatch.model.name} —{" "}
                    <span className="os-num">{ils(previewMatch.model.price)}</span>
                  </div>
                  {estimate.accessories.map((a) => (
                    <div key={a.product.id}>
                      <strong>אביזר: </strong>
                      {a.product.name} ({a.reason}) —{" "}
                      <span className="os-num">{ils(a.product.price)}</span>
                    </div>
                  ))}
                  {estimate.recommendedCourse && (
                    <div>
                      <strong>קורס מומלץ: </strong>
                      {estimate.recommendedCourse.name} —{" "}
                      <span className="os-num">{ils(estimate.recommendedCourse.price)}</span>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    borderBlockStart: "1px solid var(--os-border)",
                    paddingBlockStart: "var(--os-space-3)",
                  }}
                >
                  <strong>
                    אומדן כולל: <span className="os-num">{ils(estimate.total)}</span> (לפני מע"מ)
                  </strong>
                </div>

                <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                  אישור ייצור טיוטת הצעת מחיר במסך המסמכים. ההמלצה הופקה על ידי מנוע מקומי מבוסס
                  כללים מתוך קטלוג טרגון בלבד.
                </div>

                <div style={{ display: "flex", gap: "var(--os-space-2)", flexWrap: "wrap" }}>
                  {creatingQuote ? (
                    <OsButton variant="approve" disabled disabledReason="הטיוטה נוצרת…">
                      אישור ויצירת טיוטת הצעה
                    </OsButton>
                  ) : (
                    <OsButton
                      variant="approve"
                      icon="check"
                      data-testid="approve-quote"
                      onClick={() => void createDraftQuote(previewMatch)}
                    >
                      אישור ויצירת טיוטת הצעה
                    </OsButton>
                  )}
                  <OsButton variant="ghost" onClick={() => setPreviewMatch(null)}>
                    ביטול
                  </OsButton>
                </div>
              </div>
            </Drawer>
          );
        })()}
    </div>
  );
}
