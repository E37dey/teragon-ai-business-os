// S14.3 Phase 2 — GOVERNED MANUAL IMPORT of an Obsidian note into memoryRecords.
// This is NOT synchronization. It reuses the existing governed pipeline end-to-end:
//   ObsidianVaultAdapter.importVault → prepareImport → commitImport → PROPOSALS ONLY.
// A named human then approves via the existing ProposalQueue (workflow.approve),
// which is the SOLE writer into memoryRecords. Nothing here mutates memoryRecords,
// memoryEntries, or the Obsidian vault; no new import engine is introduced.
import { getMemoryEngine } from "@/memory/core/engine";
import { ObsidianVaultAdapter } from "@/memory/import/vaultAdapter";
import { CEO_USER_ID } from "@/repositories/seed";
import { CEO_NAME_HE } from "@/memory/adapters/legacyBridge";
import type { MemoryImportJob } from "@/domain/memory";
import type { MemoryStores } from "@/memory/repositories/memoryStores";
import type { AgentStores } from "@/repositories/agentStores";
import type { MemoryProposalWorkflow } from "@/memory/core/proposalWorkflow";

// The governed source refId the import pipeline assigns (kind "external"). Stable
// per Vault-relative path within the single connected vault (TERAGON OS).
export const OBSIDIAN_IMPORT_REF_PREFIX = "imported-markdown:";
export function obsidianImportRefId(path: string): string {
  return `${OBSIDIAN_IMPORT_REF_PREFIX}${path}`;
}

export type ImportClassification = "new" | "changed" | "unchanged";

export interface ClassifyResult {
  readonly status: ImportClassification;
  readonly existingSourceId: string | null;
  readonly existingCapturedAt: string | null;
}

function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t\r\n]+$/g, "");
}

/**
 * READ-ONLY duplicate/change detection against already-imported governed sources
 * (keyed by vault-relative path via the source refId). No store is mutated.
 * - `new`       — never imported.
 * - `unchanged` — a governed source exists with identical content.
 * - `changed`   — a governed source exists but the note content differs.
 */
export async function classifyObsidianNote(
  path: string,
  content: string,
  stores: MemoryStores = getMemoryEngine().stores,
): Promise<ClassifyResult> {
  const refId = obsidianImportRefId(path);
  const matches = (await stores.sources.list()).filter((s) => s.refId === refId);
  if (matches.length === 0) return { status: "new", existingSourceId: null, existingCapturedAt: null };
  const latest = matches.reduce((a, b) => (a.capturedAt >= b.capturedAt ? a : b));
  const status: ImportClassification = normalize(latest.excerpt) === normalize(content) ? "unchanged" : "changed";
  return { status, existingSourceId: latest.id, existingCapturedAt: latest.capturedAt };
}

export interface ImportEngineDeps {
  stores: MemoryStores;
  agentStores: AgentStores;
  workflow: MemoryProposalWorkflow;
}

function defaultDeps(): ImportEngineDeps {
  const { stores, agentStores, workflow } = getMemoryEngine();
  return { stores, agentStores, workflow };
}

/**
 * Create a GOVERNED import proposal from an Obsidian note. Proposals only —
 * produces a memoryImportJob + memorySources + a `ממתין לאישור` memoryProposal.
 * NEVER writes memoryRecords (approval, via the ProposalQueue, does that).
 */
export async function createObsidianImportProposal(
  note: { path: string; content: string },
  deps: ImportEngineDeps = defaultDeps(),
): Promise<MemoryImportJob> {
  const adapter = new ObsidianVaultAdapter({
    ...deps,
    requestedById: CEO_USER_ID,
    requestedByName: CEO_NAME_HE,
  });
  return adapter.importVault([{ path: note.path, content: note.content }]);
}
