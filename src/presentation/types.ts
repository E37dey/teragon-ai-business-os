// TERAGON AI BUSINESS OS — presentation domain types (Wave 7, W7-F, 7.21).
// The CANONICAL submission presentation is HTML (this app) — no PPTX
// dependency. EXACTLY 5 sections × 120 seconds = 600 seconds (10 minutes).
// Honesty: actualRehearsalSeconds is null until a REAL rehearsal was measured
// ("טרם נמדד"); backup images reference REAL captured screenshots under
// docs/screenshots/** and carry an honesty note when the exact Wave-7 screen
// has not been captured yet.
import type { BaseEntity, ISODate } from "@/domain/types";

// ---------------------------------------------------------------------------
// the five mandated sections
// ---------------------------------------------------------------------------

/** stable section keys, in presentation order */
export const PRESENTATION_SECTION_KEYS = [
  "problem-audience",
  "personas-tracks",
  "implementation-gates",
  "material-demo",
  "metrics-risk",
] as const;

export type PresentationSectionKey = (typeof PRESENTATION_SECTION_KEYS)[number];

/** the EXACTLY-5 mandated Hebrew titles, in order */
export const PRESENTATION_SECTION_TITLES = [
  "הבעיה והקהל",
  "שבע פרסונות ומסלולי ההדרכה",
  "תכנית הטמעה בשישה שלבים ו-Stage Gates",
  "הדגמת Quick Start או Microlearning",
  "שלוש רמות המדידה והסיכון המרכזי",
] as const;

export type PresentationSectionTitle = (typeof PRESENTATION_SECTION_TITLES)[number];

/** which LIVE component the section embeds (read-only) as its visual */
export type PresentationVisualKey =
  | "as-is-to-be" // AsIsToBe presentation view (W7-A)
  | "training-matrix" // TrainingMatrix (W7-B)
  | "roadmap-summary" // 6-stage roadmap summary (reads the live programme)
  | "quick-start-microlearning" // Quick Start walkthrough + MicrolearningPreview (W7-D)
  | "metrics-summary"; // 3-level metric summary (reads live metricDefinitions)

// ---------------------------------------------------------------------------
// timing
// ---------------------------------------------------------------------------

export interface PresentationTiming {
  /** planned seconds for the section — 120 for every section (5 × 120 = 600) */
  targetSeconds: number;
  /**
   * measured seconds from a REAL rehearsal run — null until one happened.
   * null renders as "טרם נמדד"; never fabricated.
   */
  actualRehearsalSeconds: number | null;
  /** when the last rehearsal measurement was recorded (null ⇒ never) */
  lastRehearsedAt: ISODate | null;
}

// ---------------------------------------------------------------------------
// demo link + backup image
// ---------------------------------------------------------------------------

export interface PresentationDemoLink {
  /** a REAL app route (validated against APP_ROUTES in tests) */
  route: string;
  labelHe: string;
  /** what to show there during the live demo */
  noteHe: string;
}

/** bundled backup-asset keys — resolved to real image URLs by the module layer */
export const BACKUP_ASSET_KEYS = [
  "command-center",
  "crm",
  "approval-evidence",
  "approval-panel",
  "learning-metrics",
] as const;

export type BackupAssetKey = (typeof BACKUP_ASSET_KEYS)[number];

export interface PresentationBackupImage {
  /** canonical source file under docs/screenshots/** (repo-relative) */
  sourceFile: string;
  /** bundled asset key (copied into src/modules/presentation/assets) */
  assetKey: BackupAssetKey;
  /** the route the screenshot actually captured */
  capturedRoute: string;
  /** the wave whose QA pass captured it */
  capturedWave: number;
  captionHe: string;
  /**
   * honesty note — when the exact Wave-7 target screen has no captured
   * screenshot yet, this says so explicitly and explains what IS shown.
   */
  honestyNoteHe: string;
}

// ---------------------------------------------------------------------------
// entities (collections: presentationSections / presenterNotes / demoSteps)
// ---------------------------------------------------------------------------

export interface PresentationSection extends BaseEntity {
  /** 1..5 — presentation order */
  order: number;
  key: PresentationSectionKey;
  titleHe: PresentationSectionTitle;
  /** what the section must achieve */
  objectiveHe: string;
  /** the ONE message the audience must leave with */
  mainMessageHe: string;
  visual: PresentationVisualKey;
  /** what the embedded live visual shows */
  visualDescriptionHe: string;
  demoLink: PresentationDemoLink;
  backupImage: PresentationBackupImage;
  timing: PresentationTiming;
  /** donor attribution — content rewritten, never copied as-is */
  sourceNoteHe: string;
  contentVersion: number;
}

export type PresenterNoteEmphasis = "רגיל" | "מסר מרכזי" | "הערת כנות";

export interface PresenterNote extends BaseEntity {
  /** owning section id ("ps-1".."ps-5") */
  sectionId: string;
  /** reading order within the section */
  order: number;
  textHe: string;
  emphasis: PresenterNoteEmphasis;
}

export type DemoStepStatus = "לא בוצע" | "בוצע";

export interface DemoStep extends BaseEntity {
  /** 1..11 — the deterministic evaluator path order */
  order: number;
  titleHe: string;
  /** what the evaluator should see/verify at this step */
  objectiveHe: string;
  /** a REAL app route (validated in tests) */
  route: string;
  /** concrete on-screen evidence to point at */
  evidenceHe: string;
  /** progress — persisted in the demoSteps collection (survives refresh) */
  status: DemoStepStatus;
  completedAt: ISODate | null;
}

// ---------------------------------------------------------------------------
// exactly-5 guard (same contract shape as exactly7Personas)
// ---------------------------------------------------------------------------

export interface Exactly5Result {
  ok: boolean;
  count: number;
  problemsHe: string[];
}

export const NOT_MEASURED = "טרם נמדד";
