// S18 Phase 8 — Business Workflow Packs. A tiny, FROZEN, TRUSTED configuration layer over the
// EXISTING bounded workflow + governed-action stack (Phase-5 knowledgeWorkflow, Phase-6
// governedAction, Phase-3 obsidianWrite). This is configuration only — NOT a new engine, registry,
// proposal system, or write service. Pack config is trusted application code; untrusted Vault
// content can NEVER alter a pack's id, target, or verb (see the injection regression). No Agent #8,
// no action #15: packs only ever drive the audited 7 agents / 14-action + governed-write stack.
export type PackCategory = "knowledge" | "operations";
export type GovernedVerb = "append" | "create" | "update";

export interface WorkflowPack {
  readonly id: string;
  readonly nameHe: string;
  readonly nameEn: string;
  readonly descriptionHe: string;
  readonly category: PackCategory;
  /** a helpful, editable business intent prefilled on selection ("" = reuse prior context). */
  readonly intentTemplate: string;
  /** the real agents this pack legitimately drives (audited roles only). */
  readonly allowedAgents: readonly string[];
  /** requires a live Obsidian connection to run honestly. */
  readonly knowledgeRequired: boolean;
  /** can produce a governed Phase-6 write proposal (a real persisted, verified outcome). */
  readonly governedActionSupported: boolean;
  /** the governed write target (synthetic business-knowledge note) — trusted, never from Vault. */
  readonly targetStrategy: { readonly verb: GovernedVerb; readonly path: string } | null;
}

/** The ONLY two Phase-8 packs. No placeholder/"coming soon" packs. */
export const WORKFLOW_PACKS: readonly WorkflowPack[] = Object.freeze([
  Object.freeze({
    id: "governed-knowledge-capture",
    nameHe: "תיעוד ידע מבוקר",
    nameEn: "Governed Knowledge Capture",
    descriptionHe: "הפיכת ידע והמלצה לתיעוד מאושר ומאומת ביומן ההחלטות ב-Obsidian.",
    category: "knowledge" as PackCategory,
    intentTemplate: "בדוק את הידע על AI Operations והכן עדכון מבוקר ליומן ההחלטות",
    allowedAgents: Object.freeze(["ag-orchestrator", "ag-wiki"]),
    knowledgeRequired: true,
    governedActionSupported: true,
    targetStrategy: Object.freeze({ verb: "append" as GovernedVerb, path: "Decisions Log.md" }),
  }),
  Object.freeze({
    id: "operational-recovery",
    nameHe: "התאוששות תפעולית",
    nameEn: "Operational Recovery",
    descriptionHe: "בדיקת כשל בתהליך ידע והפעלה מחדש מפורשת — אינה מבצעת מוטציה מבוקרת.",
    category: "operations" as PackCategory,
    intentTemplate: "",
    allowedAgents: Object.freeze(["ag-orchestrator", "ag-wiki"]),
    knowledgeRequired: true, // the RETRIED knowledge workflow itself needs Obsidian
    governedActionSupported: false, // retry is an explicit new run, NOT a governed mutation
    targetStrategy: null,
  }),
]);

const BY_ID = new Map(WORKFLOW_PACKS.map((p) => [p.id, p] as const));

export const WORKFLOW_PACK_IDS: readonly string[] = WORKFLOW_PACKS.map((p) => p.id);

export function getWorkflowPack(id: string | null | undefined): WorkflowPack | null {
  return id ? BY_ID.get(id) ?? null : null;
}
