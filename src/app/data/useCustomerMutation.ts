// TERAGON AI BUSINESS OS — Gate S9.2-A1c: composition-aware customer WRITE seam.
//
// The ONE mutation path a customer screen uses. Provider-aware:
//   * LOCAL_INDEXEDDB → the existing approved local behavior (createCustomer /
//     the local factory update) — unchanged.
//   * SUPABASE → authenticated, identity-aware writes through
//     loadSupabaseDomainRepository("customers", ...). Requires an active session
//     + canonical identity, uses identity.organizationId only, NEVER calls
//     getRepository, NEVER instantiates IndexedDB, NEVER falls back locally.
//
// IDEMPOTENCY (no schema change): create reuses ONE deterministic submission id
// and writes through the repository's upsertSafe — concurrent identical submits
// collapse to a single in-flight write here AND at the repository, and a later
// retry of the same id is an onConflict:"id" no-op update, so a double click or
// an uncertain-response retry yields exactly one logical customer.
//
// SESSION SAFETY: the issuing identity is captured; a write that resolves after
// logout / an identity change does NOT repopulate protected customer cache.
//
// No raw Supabase error, session, or credential is ever exposed — only a stable
// typed code + a safe Hebrew message.
import { useCallback, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Customer } from "@/domain/types";
import { customerSchema } from "@/domain/schemas";
import { getRepository } from "@/repositories";
import { invalidateCollections } from "@/app/data/hooks";
import {
  createCustomer,
  customerInputSchema,
  type CustomerInput,
} from "@/app/quick-create/actions";
import { PERSISTENCE_PROVIDER, type PersistenceProvider } from "@/persistence/provider";
import { useAuth } from "@/auth/useAuth";
import { loadSupabaseDomainRepository } from "@/persistence/composition/loadSupabaseDomainRepository";
import { DomainCompositionError } from "@/persistence/composition/domainComposition";
import type { SafeError } from "@/persistence/result";

export type CustomerMutationErrorCode =
  | "AUTH_REQUIRED"
  | "IDENTITY_INVALID"
  | "DOMAIN_NOT_CONNECTED"
  | "REMOTE_REPOSITORY_LOAD_FAILED"
  | "REMOTE_WRITE_FAILED"
  | "VALIDATION_FAILED"
  | "DUPLICATE_SUBMISSION";

export interface CustomerMutationError {
  readonly code: CustomerMutationErrorCode;
  readonly message: string; // safe, Hebrew, no leak
}

export type CustomerMutationResult =
  | { readonly ok: true; readonly data: Customer }
  | { readonly ok: false; readonly error: CustomerMutationError };

const SAFE_MESSAGES: Record<CustomerMutationErrorCode, string> = {
  AUTH_REQUIRED: "נדרשת התחברות מחדש כדי לשמור",
  IDENTITY_INVALID: "זהות המשתמש אינה תקינה — התחברו מחדש",
  DOMAIN_NOT_CONNECTED: "מודול הלקוחות אינו מחובר לשרת",
  REMOTE_REPOSITORY_LOAD_FAILED: "טעינת מאגר הלקוחות נכשלה — נסו שוב",
  REMOTE_WRITE_FAILED: "שמירת הלקוח נכשלה — נסו שוב",
  VALIDATION_FAILED: "אנא מלאו את שדות החובה כנדרש",
  DUPLICATE_SUBMISSION: "הבקשה כבר בטיפול",
};

function fail(code: CustomerMutationErrorCode, message?: string): CustomerMutationResult {
  return { ok: false, error: { code, message: message || SAFE_MESSAGES[code] } };
}

/** Map a thrown composition error (from the loader) to a safe typed result. */
function fromThrown(e: unknown): CustomerMutationResult {
  if (e instanceof DomainCompositionError) {
    const passthrough: CustomerMutationErrorCode[] = [
      "AUTH_REQUIRED",
      "IDENTITY_INVALID",
      "DOMAIN_NOT_CONNECTED",
      "REMOTE_REPOSITORY_LOAD_FAILED",
    ];
    const code = (passthrough as string[]).includes(e.code)
      ? (e.code as CustomerMutationErrorCode)
      : "REMOTE_WRITE_FAILED";
    return fail(code);
  }
  return fail("REMOTE_WRITE_FAILED");
}

/** Map a repository SafeError to a safe typed result (keeps the Hebrew message). */
function fromSafe(error: SafeError): CustomerMutationResult {
  const code: CustomerMutationErrorCode =
    error.code === "validation"
      ? "VALIDATION_FAILED"
      : error.code === "duplicate" || error.code === "conflict"
        ? "DUPLICATE_SUBMISSION"
        : "REMOTE_WRITE_FAILED";
  return fail(code, error.message);
}

/** Build the canonical customer entity for a create. Tenant org is injected by
 *  the repository from the canonical identity — the owning-org field stays null;
 *  no browser-supplied organization value participates in ownership. */
function buildCustomerEntity(input: CustomerInput, id: string): Customer {
  const at = new Date().toISOString();
  return customerSchema.parse({
    id,
    createdAt: at,
    updatedAt: at,
    name: input.name,
    type: input.type,
    phone: input.phone,
    email: input.email,
    city: input.city,
    organizationId: null,
    printerSummary: "",
    courseNames: [],
    revenue: 0,
    contactState: "פעיל",
    review: null,
    status: "פעיל",
  } satisfies Customer);
}

/** Replace-or-append a record into a cached customer list by id. */
function upsertIntoList(prev: Customer[] | undefined, record: Customer): Customer[] {
  const list = prev ?? [];
  const idx = list.findIndex((c) => c.id === record.id);
  if (idx < 0) return [...list, record];
  const next = [...list];
  next[idx] = record;
  return next;
}

// Module-level in-flight registry so concurrent submits collapse across the two
// render/callback identities of a rapid double click. Keyed by op + id.
const inFlight = new Map<string, Promise<CustomerMutationResult>>();

export interface UseCustomerMutation {
  /** Create a customer. `submissionId` MUST be stable across retries of ONE form. */
  create(input: CustomerInput, submissionId: string): Promise<CustomerMutationResult>;
  /** Update a customer's essential fields by id. */
  update(id: string, input: CustomerInput): Promise<CustomerMutationResult>;
  readonly isSubmitting: boolean;
}

export function useCustomerMutation(
  provider: PersistenceProvider = PERSISTENCE_PROVIDER,
): UseCustomerMutation {
  const { status, identity } = useAuth();
  const qc = useQueryClient();
  const [isSubmitting, setSubmitting] = useState(false);

  // Always-current auth snapshot the async completion reads (see applyCache).
  const authRef = useRef({ status, userId: identity?.userId ?? null, orgId: identity?.organizationId ?? null });
  authRef.current = { status, userId: identity?.userId ?? null, orgId: identity?.organizationId ?? null };

  const supabaseWrite = useCallback(
    async (
      key: string,
      run: (repo: Awaited<ReturnType<typeof loadSupabaseDomainRepository<Customer>>>) => Promise<CustomerMutationResult>,
    ): Promise<CustomerMutationResult> => {
      const existing = inFlight.get(key);
      if (existing) return existing; // collapse concurrent identical submits → one write
      const issued = { userId: identity?.userId ?? null, orgId: identity?.organizationId ?? null };
      const promise = (async (): Promise<CustomerMutationResult> => {
        try {
          const repo = await loadSupabaseDomainRepository<Customer>("customers", {
            provider: "SUPABASE",
            sessionActive: status === "AUTHENTICATED",
            identity,
          });
          return await run(repo);
        } catch (e) {
          return fromThrown(e);
        }
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      setSubmitting(true);
      try {
        const res = await promise;
        // Apply cache ONLY if the same identity is still signed in — a write that
        // resolved after logout / identity change must not repopulate protected data.
        if (res.ok) applyCacheOnSuccess(qc, authRef.current, issued, res.data);
        return res;
      } finally {
        setSubmitting(false);
      }
    },
    [qc, status, identity],
  );

  const create = useCallback(
    async (input: CustomerInput, submissionId: string): Promise<CustomerMutationResult> => {
      const parsed = customerInputSchema.safeParse(input);
      if (!parsed.success) return fail("VALIDATION_FAILED");

      if (provider !== "SUPABASE") {
        // LOCAL — existing approved behavior (own id + local invalidation).
        try {
          return { ok: true, data: await createCustomer(parsed.data) };
        } catch {
          return fail("VALIDATION_FAILED");
        }
      }

      const entity = buildCustomerEntity(parsed.data, submissionId);
      return supabaseWrite(`create:${submissionId}`, async (repo) => {
        const res = await repo.upsertSafe(entity); // idempotent by deterministic id
        return res.ok ? { ok: true, data: res.data } : fromSafe(res.error);
      });
    },
    [provider, supabaseWrite],
  );

  const update = useCallback(
    async (id: string, input: CustomerInput): Promise<CustomerMutationResult> => {
      const parsed = customerInputSchema.safeParse(input);
      if (!parsed.success) return fail("VALIDATION_FAILED");
      const patch = { ...parsed.data, updatedAt: new Date().toISOString() };

      if (provider !== "SUPABASE") {
        try {
          const data = await getRepository<Customer>("customers").update(id, patch);
          await invalidateCollections(["customers"]);
          return { ok: true, data };
        } catch {
          return fail("REMOTE_WRITE_FAILED");
        }
      }

      return supabaseWrite(`update:${id}`, async (repo) => {
        const res = await repo.updateSafe(id, patch); // idempotent; RLS rejects cross-org
        return res.ok ? { ok: true, data: res.data } : fromSafe(res.error);
      });
    },
    [provider, supabaseWrite],
  );

  return { create, update, isSubmitting };
}

/** Add the verified remote record to the scoped SUPABASE customer query, then
 *  invalidate ONLY that query — preserving provider/user/org cache boundaries.
 *  Skips entirely when the issuing identity is no longer the signed-in identity. */
function applyCacheOnSuccess(
  qc: QueryClient,
  current: { status: string; userId: string | null; orgId: string | null },
  issued: { userId: string | null; orgId: string | null },
  record: Customer,
): void {
  if (current.status !== "AUTHENTICATED") return;
  if (current.userId !== issued.userId || current.orgId !== issued.orgId) return;
  const key = ["domain-collection", "SUPABASE", "customers", issued.userId, issued.orgId] as const;
  qc.setQueryData<Customer[]>(key, (prev) => upsertIntoList(prev, record));
  void qc.invalidateQueries({ queryKey: key });
}
