// S14.4 Phase 3 — HUMAN-APPROVED WRITE-BACK to the connected Obsidian Vault.
// This is NOT synchronization. Every mutation follows:
//   user intent → write proposal → preview/diff → explicit human approval →
//   ONE bounded write → post-write read-back verification.
// Creating a proposal performs NO bridge write. Approval permits exactly one
// mutation attempt (state guard + plugin idempotency by mutationId). Conflict
// (the note changed since preview) refuses the overwrite.
import {
  appendNote,
  createNote,
  readNote,
  sha256Hex,
  updateNote,
  type BridgeCode,
  type WriteMeta,
} from "./vaultBridgeClient";
import { getObsidianToken } from "./obsidianCredential";
import { CEO_USER_ID } from "@/repositories/seed";
import { CEO_NAME_HE } from "@/memory/adapters/legacyBridge";

export type WriteOperation = "create" | "update" | "append";
export type WriteProposalState = "PROPOSED" | "APPROVED" | "WRITTEN" | "CONFLICT" | "REJECTED" | "FAILED";

export interface WriteProposal {
  readonly proposalId: string;
  readonly operation: WriteOperation;
  readonly vaultName: string;
  readonly path: string;
  readonly baseContent: string | null; // current content captured at preview (update/append)
  readonly baseHash: string | null; // hash of baseContent → expectedHash (conflict guard)
  readonly proposedContent: string | null; // create/update: the full new document
  readonly appendBlock: string | null; // append: the exact block to add
  readonly proposedHash: string; // create/update: hash(proposedContent); append: hash(block)
  readonly createdAt: string;
  readonly requesterId: string;
  readonly requesterName: string;
  readonly correlationId: string;
  readonly mutationId: string;
  readonly state: WriteProposalState;
  readonly approvedById: string | null;
  readonly approvedByName: string | null;
  readonly approvedAt: string | null;
  readonly resultHash: string | null;
  readonly failureCode: BridgeCode | null;
}

export interface Identity {
  readonly id: string;
  readonly name: string;
}
// Existing product-wide governance identity (demo fixture — same as /memory).
const DEFAULT_IDENTITY: Identity = { id: CEO_USER_ID, name: CEO_NAME_HE };

/** Client-side mirror of the bridge's path guard (early UX rejection). */
export function isSafeMarkdownPath(rel: string): boolean {
  if (!rel || typeof rel !== "string" || rel.length > 1024 || rel.includes("\0")) return false;
  const norm = rel.replace(/\\/g, "/");
  if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm)) return false;
  if (norm.split("/").some((s) => s === "..")) return false;
  if (/(^|\/)\.obsidian(\/|$)/.test(norm)) return false;
  return /\.(md|markdown)$/i.test(norm);
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export interface CreateProposalInput {
  operation: WriteOperation;
  vaultName: string;
  path: string;
  proposedContent?: string; // create/update
  appendBlock?: string; // append
  baseContent?: string | null; // update/append current content (for diff + conflict)
  requester?: Identity;
  now?: string; // injectable timestamp (tests)
}

/** Build a TERAGON-side write proposal. Performs NO bridge write. */
export async function createWriteProposal(input: CreateProposalInput): Promise<WriteProposal> {
  const requester = input.requester ?? DEFAULT_IDENTITY;
  const baseContent = input.operation === "create" ? null : (input.baseContent ?? null);
  const baseHash = baseContent !== null ? await sha256Hex(baseContent) : null;
  const proposedHash =
    input.operation === "append" ? await sha256Hex(input.appendBlock ?? "") : await sha256Hex(input.proposedContent ?? "");
  return {
    proposalId: uid("owp"),
    operation: input.operation,
    vaultName: input.vaultName,
    path: input.path,
    baseContent,
    baseHash,
    proposedContent: input.operation === "append" ? null : (input.proposedContent ?? ""),
    appendBlock: input.operation === "append" ? (input.appendBlock ?? "") : null,
    proposedHash,
    createdAt: input.now ?? new Date().toISOString(),
    requesterId: requester.id,
    requesterName: requester.name,
    correlationId: uid("cid"),
    mutationId: uid("mut"),
    state: "PROPOSED",
    approvedById: null,
    approvedByName: null,
    approvedAt: null,
    resultHash: null,
    failureCode: null,
  };
}

/** Explicit human approval. Records approver + time. Idempotent on state. */
export function approveWriteProposal(p: WriteProposal, who: Identity = DEFAULT_IDENTITY, now?: string): WriteProposal {
  if (p.state !== "PROPOSED") return p;
  return { ...p, state: "APPROVED", approvedById: who.id, approvedByName: who.name, approvedAt: now ?? new Date().toISOString() };
}

/** Explicit human rejection. Performs NO bridge write. */
export function rejectWriteProposal(p: WriteProposal): WriteProposal {
  if (p.state !== "PROPOSED") return p;
  return { ...p, state: "REJECTED" };
}

/**
 * Execute an APPROVED proposal: exactly one bounded write, then read-back
 * verification. State guard prevents re-execution; the plugin additionally
 * blocks duplicate mutationId. Returns the proposal in its terminal state.
 */
export async function executeWriteProposal(
  p: WriteProposal,
  opts: { token?: string | null; baseUrl?: string } = {},
): Promise<WriteProposal> {
  if (p.state !== "APPROVED") return p; // only an approved, not-yet-written proposal may execute
  const token = opts.token ?? getObsidianToken();
  if (!token) return { ...p, state: "FAILED", failureCode: "UNAUTHORIZED" };
  const meta: WriteMeta = { mutationId: p.mutationId, correlationId: p.correlationId };

  const write =
    p.operation === "create"
      ? createNote(p.path, p.proposedContent ?? "", token, meta, opts.baseUrl)
      : p.operation === "update"
        ? updateNote(p.path, p.proposedContent ?? "", p.baseHash ?? "", token, meta, opts.baseUrl)
        : appendNote(p.path, p.appendBlock ?? "", p.baseHash ?? "", token, meta, opts.baseUrl);

  const res = await write;
  if (!res.ok || !res.data) {
    return { ...p, state: res.code === "CONFLICT" ? "CONFLICT" : "FAILED", failureCode: res.code };
  }

  // POST-WRITE VERIFICATION — read the note back through the read-only capability.
  const readBack = await readNote(p.path, token, opts.baseUrl);
  if (!readBack.ok || !readBack.data) return { ...p, state: "FAILED", failureCode: readBack.code };
  const actualHash = await sha256Hex(readBack.data.content);
  const hashOk = actualHash === res.data.hash;
  const blockPresent = p.operation !== "append" || readBack.data.content.includes(p.appendBlock ?? "");
  if (!hashOk || !blockPresent) return { ...p, state: "FAILED", failureCode: "ERROR" };

  return { ...p, state: "WRITTEN", resultHash: actualHash };
}
