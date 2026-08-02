// TERAGON Business Graph — collection → entity-type resolution (Phase 5).
// ---------------------------------------------------------------------------
// The `ChangeEvent.collection` is a repository key (e.g. "customers"). The event
// adapter must map it to the closed `GraphEntityType` vocabulary and know that
// type's `organizationField` — WITHOUT reading a repository. Both facts already
// live, declaratively, in the Phase-2 ENTITY_REGISTRY. This module derives a
// reverse lookup (repository → entry) from that single source of truth. A
// collection that is not in the registry is UNSUPPORTED — never guessed.
import { ENTITY_REGISTRY, ENTITY_REGISTRY_ENTRIES, type EntityRegistryEntry } from "../registry/entityRegistry";
import type { GraphEntityType } from "../contracts/identity";

/** repository (collection key) → its single registry entry. */
const COLLECTION_TO_ENTRY: ReadonlyMap<string, EntityRegistryEntry> = (() => {
  const map = new Map<string, EntityRegistryEntry>();
  for (const entry of ENTITY_REGISTRY_ENTRIES) {
    if (entry.repository !== null) {
      // repository keys are unique per GraphEntityType (asserted by the registry
      // exhaustiveness test); a collision would be a registry bug, not runtime.
      map.set(entry.repository, entry);
    }
  }
  return map;
})();

/** The registry entry for a collection key, or null when the collection is unknown. */
export function registryEntryForCollection(collection: string): EntityRegistryEntry | null {
  return COLLECTION_TO_ENTRY.get(collection) ?? null;
}

/** The graph entity type a collection maps to, or null when unsupported. */
export function entityTypeForCollection(collection: string): GraphEntityType | null {
  return COLLECTION_TO_ENTRY.get(collection)?.entityType ?? null;
}

/** True when this collection maps to a known, closed graph entity type. */
export function isSupportedCollection(collection: string): boolean {
  return COLLECTION_TO_ENTRY.has(collection);
}

/** Re-exported for callers that already hold the entity type. */
export function organizationFieldForEntityType(entityType: GraphEntityType): string | null {
  return ENTITY_REGISTRY[entityType].organizationField;
}
