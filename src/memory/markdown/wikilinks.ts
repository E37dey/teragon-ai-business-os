// TERAGON AI BUSINESS OS — wiki links (Wave 6, W6-B, Phase 6.5).
// [[Title]] · [[Title|Display]] · [[Title#Section]] · [[Title#^block]]
// Resolution against existing records (+ alias index from imported
// frontmatter) → resolved / unresolved / ambiguous / broken.
// AMBIGUOUS IS NEVER AUTO-PICKED: the result carries candidates + the
// mandated Hebrew message; a human chooses.
import type { MemoryLink, MemoryLinkResolution, MemoryRecordV2 } from "@/domain/memory";
import type { MemoryStores } from "@/memory/repositories/memoryStores";
import { isMemoryRecordV2, fromLegacyMemoryRecord } from "@/memory/adapters/legacyBridge";
import { slugify } from "@/memory/core/text";
import type { ParsedWikiLink } from "./types";

export const AMBIGUOUS_LINK_MESSAGE_HE = "קיימות מספר התאמות — נדרשת בחירה";

// ---------------------------------------------------------------------------
// parse
// ---------------------------------------------------------------------------

/** parse the inner text of one [[...]] into its structured parts. */
export function parseWikiLinkText(inner: string): ParsedWikiLink {
  const raw = inner;
  const pipe = inner.indexOf("|");
  const targetPart = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
  const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim();

  let target = targetPart;
  let section: string | null = null;
  let blockRef: string | null = null;
  const hash = targetPart.indexOf("#");
  if (hash !== -1) {
    target = targetPart.slice(0, hash).trim();
    const suffix = targetPart.slice(hash + 1).trim();
    if (suffix.startsWith("^")) blockRef = suffix.slice(1).trim();
    else section = suffix;
  }
  const display = alias && alias.length > 0 ? alias : target || section || blockRef || raw;
  return { raw, target, display, section, blockRef };
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/gu;

/** all wikilink occurrences in a body (order preserved, NOT de-duped). */
export function extractWikiLinksDetailed(markdown: string): ParsedWikiLink[] {
  const out: ParsedWikiLink[] = [];
  let m: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((m = WIKILINK_RE.exec(markdown)) !== null) {
    const inner = (m[1] ?? "").trim();
    if (inner) out.push(parseWikiLinkText(inner));
  }
  return out;
}

// ---------------------------------------------------------------------------
// resolution
// ---------------------------------------------------------------------------

export interface WikiLinkResolutionResult {
  resolution: MemoryLinkResolution;
  resolvedRecordId: string | null;
  candidateIds: string[];
  /** the mandated Hebrew UI message for ambiguous links; null otherwise */
  messageHe: string | null;
}

/** alias index: normalized alias → record ids that claim it. */
export type AliasIndex = ReadonlyMap<string, readonly string[]>;

export function buildAliasIndex(entries: ReadonlyArray<{ recordId: string; aliases: readonly string[] }>): AliasIndex {
  const map = new Map<string, string[]>();
  for (const { recordId, aliases } of entries) {
    for (const alias of aliases) {
      const key = slugify(alias);
      if (!key) continue;
      const list = map.get(key) ?? [];
      if (!list.includes(recordId)) list.push(recordId);
      map.set(key, list);
    }
  }
  return map;
}

/**
 * Resolve one wikilink target against records (title/slug) + alias index.
 * - exactly one ACTIVE match ⇒ resolved
 * - several matches ⇒ ambiguous (candidates + Hebrew message; never auto-pick)
 * - only ARCHIVED matches ⇒ broken (the target existed but is gone)
 * - nothing ⇒ unresolved
 */
export function resolveWikiLink(
  target: string,
  records: readonly MemoryRecordV2[],
  aliases: AliasIndex = new Map(),
  selfId: string | null = null,
): WikiLinkResolutionResult {
  const slug = slugify(target);
  const matchIds = new Set<string>();
  const archivedIds = new Set<string>();
  for (const r of records) {
    if (selfId !== null && r.id === selfId) continue;
    if (r.title === target || r.slug === slug) {
      if (r.archivedAt === null) matchIds.add(r.id);
      else archivedIds.add(r.id);
    }
  }
  for (const id of aliases.get(slug) ?? []) {
    if (selfId !== null && id === selfId) continue;
    const rec = records.find((r) => r.id === id);
    if (!rec) continue;
    if (rec.archivedAt === null) matchIds.add(id);
    else archivedIds.add(id);
  }
  const ids = [...matchIds].sort((a, b) => a.localeCompare(b));
  if (ids.length === 1) {
    return { resolution: "resolved", resolvedRecordId: ids[0] ?? null, candidateIds: [], messageHe: null };
  }
  if (ids.length > 1) {
    return {
      resolution: "ambiguous",
      resolvedRecordId: null,
      candidateIds: ids,
      messageHe: AMBIGUOUS_LINK_MESSAGE_HE,
    };
  }
  if (archivedIds.size > 0) {
    return { resolution: "broken", resolvedRecordId: null, candidateIds: [], messageHe: null };
  }
  return { resolution: "unresolved", resolvedRecordId: null, candidateIds: [], messageHe: null };
}

// ---------------------------------------------------------------------------
// backlinks — pure recomputation + store application
// ---------------------------------------------------------------------------

/**
 * PURE: recompute every record's backlinks from links that are resolved.
 * Invoked after any of the 5 triggers: import / approve / rename / archive /
 * supersede (via recomputeBacklinks below — W6-A exposes no workflow hook, so
 * callers invoke it explicitly; see docs/integration-requests-w6b.md).
 */
export function computeBacklinks(
  records: readonly MemoryRecordV2[],
  links: readonly MemoryLink[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of records) map.set(r.id, []);
  for (const link of links) {
    if (link.resolution !== "resolved" || !link.resolvedRecordId) continue;
    const from = records.find((r) => r.id === link.fromRecordId);
    if (!from || from.archivedAt !== null) continue; // archived sources drop out
    const list = map.get(link.resolvedRecordId);
    if (list && !list.includes(link.fromRecordId)) list.push(link.fromRecordId);
  }
  for (const list of map.values()) list.sort((a, b) => a.localeCompare(b));
  return map;
}

export interface BacklinkRecomputeResult {
  linksUpdated: number;
  recordsUpdated: number;
}

/**
 * Re-resolve ALL link rows against the current record set, then rewrite each
 * V2 record's cached backlinks. Deterministic; safe to call after import,
 * approve, rename, archive and supersede. Legacy (gen-1) raw records cannot
 * carry a backlink cache — they are bridged on read and skipped honestly.
 */
export async function recomputeBacklinks(
  stores: MemoryStores,
  aliases: AliasIndex = new Map(),
): Promise<BacklinkRecomputeResult> {
  const raw = await stores.records.list();
  const records = raw.map((r) => (isMemoryRecordV2(r) ? r : fromLegacyMemoryRecord(r as never)));
  const links = await stores.links.list();

  let linksUpdated = 0;
  const updatedLinks: MemoryLink[] = [];
  for (const link of links) {
    const next = resolveWikiLink(link.targetText, records, aliases, link.fromRecordId);
    if (
      next.resolution !== link.resolution ||
      next.resolvedRecordId !== link.resolvedRecordId ||
      JSON.stringify(next.candidateIds) !== JSON.stringify(link.candidateIds)
    ) {
      const updated = await stores.links.update(link.id, {
        resolution: next.resolution,
        resolvedRecordId: next.resolvedRecordId,
        candidateIds: next.candidateIds,
      });
      updatedLinks.push(updated);
      linksUpdated += 1;
    } else {
      updatedLinks.push(link);
    }
  }

  const backlinkMap = computeBacklinks(records, updatedLinks);
  let recordsUpdated = 0;
  for (const record of raw) {
    if (!isMemoryRecordV2(record)) continue; // legacy raw shape — no cache field
    const next = backlinkMap.get(record.id) ?? [];
    if (JSON.stringify(next) !== JSON.stringify([...record.backlinks].sort((a, b) => a.localeCompare(b)))) {
      await stores.records.update(record.id, { backlinks: next });
      recordsUpdated += 1;
    }
  }
  return { linksUpdated, recordsUpdated };
}
