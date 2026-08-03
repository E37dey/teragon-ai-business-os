// S9.2-A1c — composition-aware customer WRITE seam + SUPABASE create/edit UI.
// Deterministic: Auth, the async Supabase seam, the local factory, and the local
// create action are injected fakes; no live Supabase, no IndexedDB, no network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { ResolvedIdentity } from "@/auth/types";
import type { Customer } from "@/domain/types";
import type { PersistenceProvider } from "@/persistence/provider";
import type { RepoResult } from "@/persistence/result";
import type { CustomerInput } from "@/app/quick-create/actions";
import type { CollectionKey } from "@/repositories/collections";
import type { DomainLoadContext } from "@/persistence/composition/loadSupabaseDomainRepository";

const IDENTITY: ResolvedIdentity = {
  userId: "u1", profileId: "u1", name: "אבי", email: "a@b.co",
  organizationId: "org-teragon", organizationName: "טרגון",
  roleId: "crole-sysadmin", roleLabel: "מנהל", capabilities: [], membershipId: "m1",
};
// Typed as the real CustomerInput so `type` keeps its literal union instead of
// widening to string — the fixture must satisfy the same contract as the UI.
const INPUT: CustomerInput = { name: "רמי לוי", type: "עסק", phone: "050", email: "r@l.co", city: "תל אביב" };
const record = (over: Partial<Customer> = {}): Customer =>
  ({ id: "cu-x", name: "רמי לוי", type: "עסק", phone: "050", email: "r@l.co", city: "תל אביב",
     organizationId: null, printerSummary: "", courseNames: [], revenue: 0,
     contactState: "פעיל", review: null, status: "פעיל",
     createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over }) as Customer;
const SCOPED_KEY = ["domain-collection", "SUPABASE", "customers", "u1", "org-teragon"];

let authState: { status: string; identity: ResolvedIdentity | null } = {
  status: "AUTHENTICATED", identity: IDENTITY,
};
let providerValue = "SUPABASE";

vi.mock("@/auth/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/persistence/provider", async (orig) => {
  const actual = await orig<typeof import("@/persistence/provider")>();
  return { ...actual, get PERSISTENCE_PROVIDER() { return providerValue; } };
});

// vi.fn takes ONE function-type generic; the legacy <Args, Return> pair silently
// resolved to `never`, which is what cascaded into the TS2345 mock errors.
const upsertSafe = vi.fn<(entity: Customer) => Promise<RepoResult<Customer>>>();
const updateSafe = vi.fn<(id: string, patch: Partial<Customer>) => Promise<RepoResult<Customer>>>();
const listSafe = vi.fn(async (): Promise<RepoResult<Customer[]>> => ({ ok: true, data: [record()] }));
// Mirrors loadSupabaseDomainRepository(collection, ctx) so `mock.calls` carries
// the real tuple type and the context can be asserted without a cast.
const loadRepo = vi.fn(async (_collection: CollectionKey, _ctx: DomainLoadContext) => ({ upsertSafe, updateSafe, listSafe }));
vi.mock("@/persistence/composition/loadSupabaseDomainRepository", () => ({
  loadSupabaseDomainRepository: (...a: Parameters<typeof loadRepo>) => loadRepo(...a),
}));

const createCustomerSpy = vi.fn(async (input: typeof INPUT) => record({ id: "cu-local", name: input.name }));
vi.mock("@/app/quick-create/actions", async (orig) => {
  const actual = await orig<typeof import("@/app/quick-create/actions")>();
  return { ...actual, createCustomer: (...a: unknown[]) => createCustomerSpy(...(a as [typeof INPUT])) };
});

const localUpdate = vi.fn(async (id: string, patch: Partial<Customer>) => record({ id, ...patch }));
vi.mock("@/repositories", async (orig) => {
  const actual = await orig<typeof import("@/repositories")>();
  return { ...actual, getRepository: () => ({ update: localUpdate }) };
});
vi.mock("@/app/data/hooks", async (orig) => {
  const actual = await orig<typeof import("@/app/data/hooks")>();
  return { ...actual, invalidateCollections: vi.fn(async () => undefined) };
});

const { useCustomerMutation } = await import("@/app/data/useCustomerMutation");
const { default: CustomersPage } = await import("@/modules/customers/CustomersPage");
const { ToastProvider } = await import("@/design-system");
const { RailProvider } = await import("@/app/rail");

beforeEach(() => {
  authState = { status: "AUTHENTICATED", identity: IDENTITY };
  providerValue = "SUPABASE";
  upsertSafe.mockReset();
  updateSafe.mockReset();
  loadRepo.mockClear();
  createCustomerSpy.mockClear();
  localUpdate.mockClear();
});
afterEach(cleanup);

function setup(provider?: PersistenceProvider) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useCustomerMutation(provider), { wrapper });
  return { qc, ...view };
}

describe("S9.2-A1c · customer WRITE seam — SUPABASE create", () => {
  it("authenticated create goes through the Supabase loader with the CANONICAL org", async () => {
    upsertSafe.mockResolvedValue({ ok: true, data: record() });
    const { qc, result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => { res = await result.current.create(INPUT, "cu-x"); });
    expect(res.ok).toBe(true);
    expect(loadRepo).toHaveBeenCalledTimes(1);
    const ctx = loadRepo.mock.calls[0]![1];
    expect(ctx.identity?.organizationId).toBe("org-teragon");
    // verified remote record added to the scoped customer query cache
    expect((qc.getQueryData(SCOPED_KEY) as Customer[])[0]?.id).toBe("cu-x");
  });

  it("ignores any browser-supplied organization — the written entity carries no tenant org", async () => {
    upsertSafe.mockResolvedValue({ ok: true, data: record() });
    const { result } = setup();
    await act(async () => {
      await result.current.create({ ...INPUT, organization_id: "attacker-org", organizationId: "attacker-org" } as typeof INPUT, "cu-x");
    });
    const written = upsertSafe.mock.calls[0]![0];
    expect(written.organizationId).toBeNull(); // owning-org null; tenant org is repo/RLS-injected
    expect(JSON.stringify(written)).not.toContain("attacker-org");
  });

  it("success only after the remote returns ok; a remote failure creates NO local record", async () => {
    upsertSafe.mockResolvedValue({ ok: false, error: { code: "network", message: "תקלת רשת — נסו שוב", retriable: true } });
    const { qc, result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => { res = await result.current.create(INPUT, "cu-x"); });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("REMOTE_WRITE_FAILED");
    expect(createCustomerSpy).not.toHaveBeenCalled(); // no local write
    expect(localUpdate).not.toHaveBeenCalled();
    expect(qc.getQueryData(SCOPED_KEY)).toBeUndefined(); // no optimistic cache
  });

  it("client validation fails closed with a safe Hebrew message (no remote call)", async () => {
    const { result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => { res = await result.current.create({ ...INPUT, name: "" }, "cu-x"); });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION_FAILED");
      expect(res.error.message).toMatch(/[א-ת]/);
    }
    expect(loadRepo).not.toHaveBeenCalled();
  });

  it("double submit with the same id collapses to ONE logical write", async () => {
    upsertSafe.mockResolvedValue({ ok: true, data: record() });
    const { result } = setup();
    await act(async () => {
      await Promise.all([
        result.current.create(INPUT, "cu-dup"),
        result.current.create(INPUT, "cu-dup"),
      ]);
    });
    expect(upsertSafe).toHaveBeenCalledTimes(1);
  });

  it("a write resolving AFTER logout does not repopulate protected customer cache", async () => {
    let resolveUpsert!: (r: RepoResult<Customer>) => void;
    upsertSafe.mockImplementation(() => new Promise<RepoResult<Customer>>((r) => { resolveUpsert = r; }));
    const { qc, result, rerender } = setup();
    let p!: Promise<unknown>;
    await act(async () => { p = result.current.create(INPUT, "cu-x"); await Promise.resolve(); });
    // user logs out mid-write
    authState = { status: "UNAUTHENTICATED", identity: null };
    rerender();
    await act(async () => { resolveUpsert({ ok: true, data: record() }); await p; });
    expect(qc.getQueryData(SCOPED_KEY)).toBeUndefined();
  });

  it("never touches the local factory in SUPABASE mode", async () => {
    upsertSafe.mockResolvedValue({ ok: true, data: record() });
    const { result } = setup();
    await act(async () => { await result.current.create(INPUT, "cu-x"); });
    expect(localUpdate).not.toHaveBeenCalled();
    expect(createCustomerSpy).not.toHaveBeenCalled();
  });
});

describe("S9.2-A1c · customer WRITE seam — update + LOCAL parity", () => {
  it("SUPABASE update goes through the remote repository", async () => {
    updateSafe.mockResolvedValue({ ok: true, data: record({ name: "רמי מעודכן" }) });
    const { qc, result } = setup();
    await act(async () => { await result.current.update("cu-x", { ...INPUT, name: "רמי מעודכן" }); });
    expect(updateSafe).toHaveBeenCalledTimes(1);
    expect((qc.getQueryData(SCOPED_KEY) as Customer[])[0]?.name).toBe("רמי מעודכן");
  });

  it("LOCAL create preserves the existing approved behavior (createCustomer, no loader)", async () => {
    const { result } = setup("LOCAL_INDEXEDDB");
    let res!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => { res = await result.current.create(INPUT, "cu-x"); });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe("cu-local");
    expect(createCustomerSpy).toHaveBeenCalledTimes(1);
    expect(loadRepo).not.toHaveBeenCalled();
  });
});

describe("S9.2-A1c · CustomersPage create/edit controls (SUPABASE)", () => {
  it("shows the create action and per-row edit action, no 'not available' notice", async () => {
    upsertSafe.mockResolvedValue({ ok: true, data: record() });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ToastProvider>
            <RailProvider>
              <CustomersPage />
            </RailProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("customers-page")).toBeTruthy());
    expect(screen.getByText("לקוח חדש")).toBeTruthy();
    expect(screen.getByText("עריכה")).toBeTruthy();
    expect(screen.queryByText("יצירת לקוח עדיין אינה זמינה בסביבת התצוגה")).toBeNull();
  });
});
