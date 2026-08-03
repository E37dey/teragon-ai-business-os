// S9.3-D — composition-aware contact WRITE seam (create + update).
//
// Mirrors the proven customer mutation pattern (S9.2-A1c):
//   * SUPABASE only — writes go through loadSupabaseDomainRepository("contacts").
//     There is NO local/IndexedDB fallback; a failed remote write fails closed.
//   * IDEMPOTENCY (no schema change): create uses ONE deterministic submission id
//     with `upsertSafe`, so a double click or an uncertain retry collapses to one
//     logical row (module-level in-flight collapse here + repo in-flight collapse
//     + DB onConflict:"id"). No migration is involved.
//   * SESSION SAFETY: the issuing identity is captured; a write that resolves
//     after logout or an identity change never repopulates protected cache.
//
// INTEGRITY: `ContactInput` deliberately has NO customerId and NO organization
// field. The parent customer is supplied as a separate argument on create and is
// NEVER part of an update patch, so a contact can never be re-parented to another
// customer through this seam. The tenant organization is injected by the
// repository mapper from the CANONICAL identity, and RLS rejects cross-org rows.
import { useCallback, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { PERSISTENCE_PROVIDER, type PersistenceProvider } from "@/persistence/provider";
import { loadSupabaseDomainRepository } from "@/persistence/composition/loadSupabaseDomainRepository";
import { DomainCompositionError } from "@/persistence/composition/domainComposition";
import { contactSchema } from "@/domain/schemas";
import type { Contact } from "@/domain/types";
import type { SafeError } from "@/persistence/result";
import { newCorrelationId, reportDomainFailure, reportSafeCodeFailure } from "@/observability/domainEvents";

/** Form contract. No customerId / organization — see INTEGRITY above. */
export const contactInputSchema = z.object({
  name: z.string().trim().min(1),
  role: z.string(),
  phone: z.string(),
  email: z.string(),
  isPrimary: z.boolean(),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export type ContactMutationErrorCode =
  | "AUTH_REQUIRED"
  | "IDENTITY_INVALID"
  | "DOMAIN_NOT_CONNECTED"
  | "REMOTE_REPOSITORY_LOAD_FAILED"
  | "REMOTE_WRITE_FAILED"
  | "VALIDATION_FAILED"
  | "DUPLICATE_SUBMISSION";

export interface ContactMutationError {
  readonly code: ContactMutationErrorCode;
  readonly message: string; // safe, Hebrew, no leak
}

export type ContactMutationResult =
  | { readonly ok: true; readonly data: Contact }
  | { readonly ok: false; readonly error: ContactMutationError };

const SAFE_MESSAGES: Record<ContactMutationErrorCode, string> = {
  AUTH_REQUIRED: "נדרשת התחברות מחדש כדי לשמור",
  IDENTITY_INVALID: "זהות המשתמש אינה תקינה — התחברו מחדש",
  DOMAIN_NOT_CONNECTED: "מודול אנשי הקשר אינו מחובר לשרת",
  REMOTE_REPOSITORY_LOAD_FAILED: "טעינת מאגר אנשי הקשר נכשלה — נסו שוב",
  REMOTE_WRITE_FAILED: "שמירת איש הקשר נכשלה — נסו שוב",
  VALIDATION_FAILED: "אנא מלאו את שדות החובה כנדרש",
  DUPLICATE_SUBMISSION: "הבקשה כבר בטיפול",
};

function fail(code: ContactMutationErrorCode, message?: string): ContactMutationResult {
  return { ok: false, error: { code, message: message || SAFE_MESSAGES[code] } };
}

function fromThrown(e: unknown): ContactMutationResult {
  if (e instanceof DomainCompositionError) {
    const passthrough: ContactMutationErrorCode[] = [
      "AUTH_REQUIRED",
      "IDENTITY_INVALID",
      "DOMAIN_NOT_CONNECTED",
      "REMOTE_REPOSITORY_LOAD_FAILED",
    ];
    const code = (passthrough as string[]).includes(e.code)
      ? (e.code as ContactMutationErrorCode)
      : "REMOTE_WRITE_FAILED";
    return fail(code);
  }
  return fail("REMOTE_WRITE_FAILED");
}

function fromSafe(error: SafeError): ContactMutationResult {
  const code: ContactMutationErrorCode =
    error.code === "validation"
      ? "VALIDATION_FAILED"
      : error.code === "duplicate" || error.code === "conflict"
        ? "DUPLICATE_SUBMISSION"
        : "REMOTE_WRITE_FAILED";
  return fail(code, error.message);
}

/** Canonical contact entity for a create. The parent customer comes from the
 *  ARGUMENT (the detail page's current customer), never from the form. */
function buildContactEntity(input: ContactInput, customerId: string, id: string): Contact {
  const at = new Date().toISOString();
  return contactSchema.parse({
    id,
    createdAt: at,
    updatedAt: at,
    customerId,
    name: input.name,
    role: input.role,
    phone: input.phone,
    email: input.email,
    isPrimary: input.isPrimary,
  } satisfies Contact);
}

function upsertIntoList(prev: Contact[] | undefined, record: Contact): Contact[] {
  const list = prev ?? [];
  const idx = list.findIndex((c) => c.id === record.id);
  if (idx < 0) return [...list, record];
  const next = [...list];
  next[idx] = record;
  return next;
}

// Module-level in-flight registry so concurrent submits collapse across the two
// render/callback identities of a rapid double click. Keyed by op + id.
const inFlight = new Map<string, Promise<ContactMutationResult>>();

export interface UseContactMutation {
  /** Create a contact for `customerId`. `submissionId` MUST be stable across retries. */
  create(input: ContactInput, customerId: string, submissionId: string): Promise<ContactMutationResult>;
  /** Update a contact's editable fields. Never changes its parent customer. */
  update(id: string, input: ContactInput): Promise<ContactMutationResult>;
  readonly isSubmitting: boolean;
}

export function useContactMutation(
  provider: PersistenceProvider = PERSISTENCE_PROVIDER,
): UseContactMutation {
  const { status, identity } = useAuth();
  const qc = useQueryClient();
  const [isSubmitting, setSubmitting] = useState(false);

  const authRef = useRef({ status, userId: identity?.userId ?? null, orgId: identity?.organizationId ?? null });
  authRef.current = { status, userId: identity?.userId ?? null, orgId: identity?.organizationId ?? null };

  const supabaseWrite = useCallback(
    async (
      key: string,
      run: (
        repo: Awaited<ReturnType<typeof loadSupabaseDomainRepository<Contact>>>,
        correlationId: string,
      ) => Promise<ContactMutationResult>,
    ): Promise<ContactMutationResult> => {
      const existing = inFlight.get(key);
      if (existing) return existing; // collapse concurrent identical submits → one write
      const issued = { userId: identity?.userId ?? null, orgId: identity?.organizationId ?? null };
      // S10.0-C: ONE correlation id per ACTUAL write. A collapsed duplicate
      // submit returns the in-flight promise above, so it cannot double-report.
      const correlationId = newCorrelationId();
      const promise = (async (): Promise<ContactMutationResult> => {
        try {
          const repo = await loadSupabaseDomainRepository<Contact>("contacts", {
            provider: "SUPABASE",
            sessionActive: status === "AUTHENTICATED",
            identity,
          });
          return await run(repo, correlationId);
        } catch (e) {
          reportDomainFailure("write", "contacts", e, correlationId);
          return fromThrown(e);
        }
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      setSubmitting(true);
      try {
        const res = await promise;
        if (res.ok) applyCacheOnSuccess(qc, authRef.current, issued, res.data);
        return res;
      } finally {
        setSubmitting(false);
      }
    },
    [qc, status, identity],
  );

  const create = useCallback(
    async (input: ContactInput, customerId: string, submissionId: string): Promise<ContactMutationResult> => {
      const parsed = contactInputSchema.safeParse(input);
      if (!parsed.success) return fail("VALIDATION_FAILED");
      if (!customerId) return fail("VALIDATION_FAILED");
      // Contacts are a SUPABASE-only surface (the LOCAL detail page keeps its own
      // existing behavior), so there is no local write path here.
      if (provider !== "SUPABASE") return fail("DOMAIN_NOT_CONNECTED");

      const entity = buildContactEntity(parsed.data, customerId, submissionId);
      return supabaseWrite(`create:${submissionId}`, async (repo, correlationId) => {
        const res = await repo.upsertSafe(entity); // idempotent by deterministic id
        // Report from the RAW SafeError code: fromSafe collapses "unauthorized"
        // into REMOTE_WRITE_FAILED, which would lose the denial signal.
        if (!res.ok) reportSafeCodeFailure("write", "contacts", res.error.code, correlationId);
        return res.ok ? { ok: true, data: res.data } : fromSafe(res.error);
      });
    },
    [provider, supabaseWrite],
  );

  const update = useCallback(
    async (id: string, input: ContactInput): Promise<ContactMutationResult> => {
      const parsed = contactInputSchema.safeParse(input);
      if (!parsed.success) return fail("VALIDATION_FAILED");
      if (provider !== "SUPABASE") return fail("DOMAIN_NOT_CONNECTED");
      // No customerId in the patch → a contact can never be re-parented, and RLS
      // rejects any id outside the caller's organization.
      const patch = { ...parsed.data, updatedAt: new Date().toISOString() };

      return supabaseWrite(`update:${id}`, async (repo, correlationId) => {
        const res = await repo.updateSafe(id, patch);
        if (!res.ok) reportSafeCodeFailure("write", "contacts", res.error.code, correlationId);
        return res.ok ? { ok: true, data: res.data } : fromSafe(res.error);
      });
    },
    [provider, supabaseWrite],
  );

  return { create, update, isSubmitting };
}

/** Add the verified remote record to the scoped SUPABASE contacts query, then
 *  invalidate ONLY that query — which is what refreshes the customer's contacts
 *  panel. Skipped entirely when the issuing identity is no longer signed in. */
function applyCacheOnSuccess(
  qc: QueryClient,
  current: { status: string; userId: string | null; orgId: string | null },
  issued: { userId: string | null; orgId: string | null },
  record: Contact,
): void {
  if (current.status !== "AUTHENTICATED") return;
  if (current.userId !== issued.userId || current.orgId !== issued.orgId) return;
  const key = ["domain-collection", "SUPABASE", "contacts", issued.userId, issued.orgId] as const;
  qc.setQueryData<Contact[]>(key, (prev) => upsertIntoList(prev, record));
  void qc.invalidateQueries({ queryKey: key });
}
