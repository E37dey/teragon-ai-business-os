// S10.0-C — domain failure observability + correlation.
// Deterministic: Auth and the Supabase seam are injected fakes; the sink
// provider is injected per test and reset afterwards. No network, no vendor SDK.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { ResolvedIdentity } from "@/auth/types";
import type { Contact, Customer } from "@/domain/types";
import type { RepoResult, SafeError } from "@/persistence/result";
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
const contact = (): Contact =>
  ({ id: "ct-1", customerId: "cu-1", name: "דנה", role: "רכש", phone: "050", email: "d@k.co",
     isPrimary: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }) as Contact;

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
vi.mock("@/repositories", async (orig) => {
  const actual = await orig<typeof import("@/repositories")>();
  return { ...actual, getRepository: () => ({ list: async () => [] }) };
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
  events = [];
  setErrorReportProvider((e) => events.push(e));
});
afterEach(() => {
  resetErrorReportProvider();
  cleanup();
});

function wrapper(): (p: { children: ReactNode }) => ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const denial = (): SafeError => safeError("unauthorized", "אין הרשאה לפעולה זו");
const netFail = (): SafeError => safeError("network", "תקלת רשת");

describe("S10.0-C · read observability", () => {
  it("an UNAUTHORIZED read reports exactly one denial", async () => {
    listSafe.mockResolvedValue({ ok: false, error: denial() });
    const { result } = renderHook(() => useDomainCollection<Customer>("customers"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "domain_read_denied", code: "unauthorized", domain: "customers" });
  });

  it("an ORDINARY read failure reports one failure, not a denial", async () => {
    listSafe.mockResolvedValue({ ok: false, error: netFail() });
    const { result } = renderHook(() => useDomainCollection<Customer>("customers"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "domain_read_failed", code: "network" });
  });

  it("a SUCCESSFUL read reports NOTHING", async () => {
    listSafe.mockResolvedValue({ ok: true, data: [] });
    const { result } = renderHook(() => useDomainCollection<Customer>("customers"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(events).toHaveLength(0);
  });

  it("a rerender does NOT duplicate the event", async () => {
    listSafe.mockResolvedValue({ ok: false, error: denial() });
    const { result, rerender } = renderHook(() => useDomainCollection<Customer>("customers"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    rerender(); rerender(); rerender();
    expect(events).toHaveLength(1);
  });

  it("carries no payload/PII — only the six whitelisted fields", async () => {
    listSafe.mockResolvedValue({ ok: false, error: denial() });
    const { result } = renderHook(() => useDomainCollection<Customer>("customers"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(Object.keys(events[0]!).sort()).toEqual(
      ["code", "correlationId", "domain", "kind", "route", "timestamp"],
    );
    expect(JSON.stringify(events[0])).not.toContain("אין הרשאה"); // no error message
  });
});

describe("S10.0-C · write observability", () => {
  it("an UNAUTHORIZED mutation reports one denial", async () => {
    upsertSafe.mockResolvedValue({ ok: false, error: denial() });
    const { result } = renderHook(() => useContactMutation(), { wrapper: wrapper() });
    await act(async () => { await result.current.create(INPUT, "cu-1", "ct-1"); });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "domain_write_denied", code: "unauthorized", domain: "contacts" });
  });

  it("an ORDINARY mutation failure reports one failure", async () => {
    upsertSafe.mockResolvedValue({ ok: false, error: netFail() });
    const { result } = renderHook(() => useContactMutation(), { wrapper: wrapper() });
    await act(async () => { await result.current.create(INPUT, "cu-1", "ct-1"); });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "domain_write_failed", code: "network" });
  });

  it("a SUCCESSFUL mutation reports NOTHING", async () => {
    upsertSafe.mockResolvedValue({ ok: true, data: contact() });
    const { result } = renderHook(() => useContactMutation(), { wrapper: wrapper() });
    await act(async () => { await result.current.create(INPUT, "cu-1", "ct-1"); });
    expect(events).toHaveLength(0);
  });

  it("each separate operation gets a DISTINCT correlationId", async () => {
    upsertSafe.mockResolvedValue({ ok: false, error: netFail() });
    const { result } = renderHook(() => useContactMutation(), { wrapper: wrapper() });
    await act(async () => { await result.current.create(INPUT, "cu-1", "ct-a"); });
    await act(async () => { await result.current.create(INPUT, "cu-1", "ct-b"); });
    expect(events).toHaveLength(2);
    expect(events[0]!.correlationId).not.toBe(events[1]!.correlationId);
    expect(events[0]!.correlationId).toBeTruthy();
  });

  it("a FAILING sink provider does not change the returned result", async () => {
    setErrorReportProvider(() => { throw new Error("transport down"); });
    upsertSafe.mockResolvedValue({ ok: false, error: netFail() });
    const { result } = renderHook(() => useContactMutation(), { wrapper: wrapper() });
    let res!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => { res = await result.current.create(INPUT, "cu-1", "ct-1"); });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("REMOTE_WRITE_FAILED"); // UI behavior unchanged
  });
});
