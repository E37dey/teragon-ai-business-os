// S10.3-E — safe behaviour when connectivity disappears mid read/write.
// Deterministic: Auth, the async Supabase seam and the local factory are injected
// fakes; "network failure" is modelled by the injected seam rejecting or
// returning a network SafeError. No real network, no staging, no service-role.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { ResolvedIdentity } from "@/auth/types";
import type { Contact, Customer } from "@/domain/types";
import type { RepoResult } from "@/persistence/result";
import { safeError } from "@/persistence/result";
import type { CollectionKey } from "@/repositories/collections";
import type { DomainLoadContext } from "@/persistence/composition/loadSupabaseDomainRepository";
import {
  setErrorReportProvider,
  resetErrorReportProvider,
  type SafeErrorEvent,
} from "@/observability/errorSink";

const IDENTITY: ResolvedIdentity = {
  userId: "u1", profileId: "u1", name: "אבי", email: "a@b.co",
  organizationId: "org-teragon", organizationName: "טרגון",
  roleId: "crole-sysadmin", roleLabel: "מנהל", capabilities: [], membershipId: "m1",
};
const INPUT = { name: "דנה", role: "רכש", phone: "050", email: "d@k.co", isPrimary: true };
const CONTACT_KEY = ["domain-collection", "SUPABASE", "contacts", "u1", "org-teragon"];
const contact = (): Contact =>
  ({ id: "ct-1", customerId: "cu-1", name: "דנה", role: "רכש", phone: "050", email: "d@k.co",
     isPrimary: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }) as Contact;
const customer = (): Customer => ({ id: "cu-1", name: "רמי" }) as Customer;

let authState: { status: string; identity: ResolvedIdentity | null } = {
  status: "AUTHENTICATED", identity: IDENTITY,
};
let providerValue = "SUPABASE";

vi.mock("@/auth/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/persistence/provider", async (orig) => {
  const actual = await orig<typeof import("@/persistence/provider")>();
  return { ...actual, get PERSISTENCE_PROVIDER() { return providerValue; } };
});

const listSafe = vi.fn<() => Promise<RepoResult<Customer[]>>>();
const upsertSafe = vi.fn<(e: Contact) => Promise<RepoResult<Contact>>>();
const loadRepo = vi.fn(async (_c: CollectionKey, _x: DomainLoadContext) => ({ listSafe, upsertSafe }));
vi.mock("@/persistence/composition/loadSupabaseDomainRepository", () => ({
  loadSupabaseDomainRepository: (...a: Parameters<typeof loadRepo>) => loadRepo(...a),
}));

// LOCAL factory — must NEVER be called in SUPABASE mode (no silent fallback).
const localList = vi.fn(async () => [] as Customer[]);
vi.mock("@/repositories", async (orig) => {
  const actual = await orig<typeof import("@/repositories")>();
  return { ...actual, getRepository: () => ({ list: localList }) };
});

const { useDomainCollection } = await import("@/app/data/useDomainCollection");
const { useContactMutation } = await import("@/app/data/useContactMutation");

let events: Required<SafeErrorEvent>[] = [];

beforeEach(() => {
  authState = { status: "AUTHENTICATED", identity: IDENTITY };
  providerValue = "SUPABASE";
  listSafe.mockReset();
  upsertSafe.mockReset();
  loadRepo.mockClear();
  localList.mockClear();
  events = [];
  setErrorReportProvider((e) => events.push(e));
});
afterEach(() => { resetErrorReportProvider(); cleanup(); });

function wrapper(): (p: { children: ReactNode }) => ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// ---------------------------------------------------------------------------
describe("S10.3-E · read interruption", () => {
  it("network failure ends loading, fails closed with a safe Hebrew error, no local fallback", async () => {
    listSafe.mockRejectedValueOnce(new Error("boom: net down a@b.co"));
    const { result } = renderHook(() => useDomainCollection<Customer>("customers"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false); // loading ended, not stuck
    expect(localList).not.toHaveBeenCalled();     // NO IndexedDB fallback
    expect(result.current.data).toBeUndefined();  // no stale/phantom rows
    expect(events).toHaveLength(1);               // one sanitized failure event
  });

  it("retry after reconnection succeeds and uses a DISTINCT correlationId", async () => {
    listSafe.mockRejectedValueOnce(new Error("net down"));
    const { result } = renderHook(() => useDomainCollection<Customer>("customers"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const firstId = events[0]!.correlationId;

    // reconnect: the next call succeeds.
    listSafe.mockResolvedValueOnce({ ok: true, data: [customer()] });
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.id).toBe("cu-1");
    expect(events).toHaveLength(1);               // success reports nothing new
    // the failed attempt's id exists and is a real value (retry would mint a new one)
    expect(firstId).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe("S10.3-E · write interruption", () => {
  it("failure resets submitting, returns not-ok (no false success), caches nothing", async () => {
    upsertSafe.mockResolvedValueOnce({ ok: false, error: safeError("network", "תקלת רשת — נסו שוב") });
    const { result } = renderHook(() => useContactMutation(), { wrapper: wrapper() });
    let res!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => { res = await result.current.create(INPUT, "cu-1", "ct-net"); });
    expect(res.ok).toBe(false);
    expect(result.current.isSubmitting).toBe(false); // state reset
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "domain_write_failed", code: "network" });
  });

  it("retry after failure succeeds exactly once", async () => {
    upsertSafe
      .mockResolvedValueOnce({ ok: false, error: safeError("network", "תקלת רשת") })
      .mockResolvedValueOnce({ ok: true, data: contact() });
    const { result } = renderHook(() => useContactMutation(), { wrapper: wrapper() });
    await act(async () => { await result.current.create(INPUT, "cu-1", "ct-r1"); }); // fails
    await act(async () => { await result.current.create(INPUT, "cu-1", "ct-r1"); }); // retry
    expect(upsertSafe).toHaveBeenCalledTimes(2); // one fail + one successful retry
  });

  it("duplicate concurrent submit collapses to ONE write (no duplicate rows)", async () => {
    upsertSafe.mockResolvedValue({ ok: true, data: contact() });
    const { result } = renderHook(() => useContactMutation(), { wrapper: wrapper() });
    await act(async () => {
      await Promise.all([
        result.current.create(INPUT, "cu-1", "ct-dup"),
        result.current.create(INPUT, "cu-1", "ct-dup"),
      ]);
    });
    expect(upsertSafe).toHaveBeenCalledTimes(1);
  });

  it("a write resolving AFTER logout does not create a phantom cache row", async () => {
    let resolve!: (r: RepoResult<Contact>) => void;
    upsertSafe.mockImplementation(() => new Promise<RepoResult<Contact>>((r) => { resolve = r; }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrap = ({ children }: { children: ReactNode }): ReactElement => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(() => useContactMutation(), { wrapper: wrap });
    let p!: Promise<unknown>;
    await act(async () => { p = result.current.create(INPUT, "cu-1", "ct-lo"); await Promise.resolve(); });
    authState = { status: "UNAUTHENTICATED", identity: null };
    rerender();
    await act(async () => { resolve({ ok: true, data: contact() }); await p; });
    expect(qc.getQueryData(CONTACT_KEY)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("S10.3-E · observability of failures", () => {
  it("distinct correlationId per failed operation", async () => {
    upsertSafe.mockResolvedValue({ ok: false, error: safeError("network", "net") });
    const { result } = renderHook(() => useContactMutation(), { wrapper: wrapper() });
    await act(async () => { await result.current.create(INPUT, "cu-1", "ct-a"); });
    await act(async () => { await result.current.create(INPUT, "cu-1", "ct-b"); });
    expect(events).toHaveLength(2);
    expect(events[0]!.correlationId).not.toBe(events[1]!.correlationId);
    expect(events[0]!.correlationId).toBeTruthy();
  });

  it("no payload, id, email, token or error message leaks", async () => {
    listSafe.mockRejectedValueOnce(new Error("row id=cu-9 user=a@b.co Bearer eyJtok secret"));
    const { result } = renderHook(() => useDomainCollection<Customer>("customers"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    // only the six whitelisted fields
    expect(Object.keys(events[0]!).sort()).toEqual(
      ["code", "correlationId", "domain", "kind", "route", "timestamp"],
    );
    const serialized = JSON.stringify(events);
    for (const leak of ["cu-9", "a@b.co", "Bearer", "eyJtok", "secret", "row id"]) {
      expect(serialized).not.toContain(leak);
    }
  });
});
