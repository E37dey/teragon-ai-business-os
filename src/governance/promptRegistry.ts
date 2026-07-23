// TERAGON AI BUSINESS OS — prompt registry derivation (Wave 8, W8-B).
// The registry stores ONE sha-256 checksum per prompt version — never the
// protected text. In Mode A the protected prompt for each agent/operation is
// built server-side from layered components (see src/server/promptSecurity.ts);
// the client-side fingerprint below is computed over the canonical prompt
// IDENTITY material derived from the frozen definition, so the checksum is
// stable, reproducible and verifiable — while the composed protected text
// itself never appears in any record or DOM payload.
import { AGENT_DEFINITIONS, AGENT_IDS, type AgentDefinition } from "@/agents/definitions";
import type { PromptVersionRecord } from "@/domain/governance";
import type { ISODate } from "@/domain/types";
import { sha256Hex } from "./checksum";

/** Owner of the server-side system-policy prompt layer. */
export const SYSTEM_PROMPT_OWNER = { id: "u-noa", name: "נעה פרידמן" } as const;

/**
 * The canonical fingerprint source for an agent prompt version. This composed
 * string is treated as PROTECTED: it is hashed and immediately discarded —
 * never persisted, never rendered (guard-tested in tests/governance).
 */
export function promptFingerprintSource(def: AgentDefinition): string {
  return [
    "teragon-protected-prompt",
    def.id,
    def.codeName,
    def.promptVersion,
    def.purposeHe,
    def.allowedOperations.join(","),
    def.approvalRequiredFor.join(","),
  ].join("␞"); // symbol-for-record-separator — unambiguous joining
}

/** Fingerprint source of the server-owned system-policy layer. */
export function systemPolicyFingerprintSource(): string {
  return ["teragon-protected-prompt", "system-policy", "v1", "server-owned-layer-1"].join("␞");
}

/**
 * Derive the full prompt-registry records: one per governed agent (version
 * from the frozen definition) + one for the server system-policy layer.
 * approvalId is null — prompt versions were never formally approved, and the
 * rail surfaces exactly that (honesty over cosmetics).
 */
export function derivePromptRegistry(now: ISODate): PromptVersionRecord[] {
  const records: PromptVersionRecord[] = AGENT_IDS.map((id) => {
    const def = AGENT_DEFINITIONS[id];
    if (!def) throw new Error(`הגדרת סוכן חסרה: ${id}`);
    return {
      id: `pv-${def.id}-${def.promptVersion}`,
      createdAt: now,
      updatedAt: now,
      agentId: def.id,
      operation: null,
      labelHe: `פרומפט תפקיד — ${def.nameHe} (${def.codeName})`,
      version: def.promptVersion,
      active: true,
      ownerId: SYSTEM_PROMPT_OWNER.id,
      ownerName: SYSTEM_PROMPT_OWNER.name,
      approvalId: null, // honest: no formal approval record exists yet
      approvedById: null,
      checksumSha256: sha256Hex(promptFingerprintSource(def)),
      protectedTextStored: false,
    } satisfies PromptVersionRecord;
  });
  records.push({
    id: "pv-system-policy-v1",
    createdAt: now,
    updatedAt: now,
    agentId: null,
    operation: "system-policy",
    labelHe: "שכבת מדיניות המערכת (שרת) — שכבה 1",
    version: "v1",
    active: true,
    ownerId: SYSTEM_PROMPT_OWNER.id,
    ownerName: SYSTEM_PROMPT_OWNER.name,
    approvalId: null,
    approvedById: null,
    checksumSha256: sha256Hex(systemPolicyFingerprintSource()),
    protectedTextStored: false,
  });
  return records;
}
