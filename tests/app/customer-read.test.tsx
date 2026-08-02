// S9.2-A1b — route-aware gate + composition-aware customer read integration.
// Deterministic: Auth, the async Supabase seam, and the local factory are all
// injected fakes; no live Supabase, no IndexedDB, no network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { ResolvedIdentity } from "@/auth/types";
import type { Customer } from "@/domain/types";
import type { RepoResult } from "@/persistence/result";
import { safeError } from "@/persistence/result";

const IDENTITY: ResolvedIdentity = {
  userId: "u1", profileId: "u1", name: "אבי", email: "a@b.co",
  organizationId: "org-teragon", organizationName: "טרגון",
  roleId: "crole-sysadmin", roleLabel: "מנהל", capabilities: [], membershipId: "m1",
};

// Mutable auth + provider state the mocks read (reset per test).
let authState: { status: string; identity: ResolvedIdentity | null } = {
  status: "AUTHENTICATED",
  identity: IDENTITY,
};
let providerValue = "SUPABASE";

vi.mock("@/auth/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/persistence/provider", async (orig) => {
  const actual = await orig<typeof import("@/persistence/provider")>();
  return { ...actual, get PERSISTENCE_PROVIDER() { return providerValue; } };
});

const listSafe = vi.fn<[], Promise<RepoResult<Customer[]>>>();
const loadRepo = vi.fn(async () => ({ listSafe }));
vi.mock("@/persistence/composition/loadSupabaseDomainRepository", () => ({
  loadSupabaseDomainRepository: (...a: unknown[]) => loadRepo(...(a as [])),
}));

const localList = vi.fn(async () => [{ id: "cu-local", name: "מקומי" }] as Customer[]);
vi.mock("@/repositories", async (orig) => {
  const actual = await orig<typeof import("@/repositories")>();
  return { ...actual, getRepository: () => ({ list: localList }) };
});

// Imports AFTER mocks so the mocked modules are bound.
const { routeDomain } = await import("@/app/data/routeDomain");
const { DomainNotConnectedGateView } = await import(
  "@/persistence/composition/DomainNotConnectedGate"
);
const { useDomainCollection, domainReadMessage } = await import("@/app/data/useDomainCollection");
const { default: CustomersPage } = await import("@/modules/customers/CustomersPage");
const { ToastProvider } = await import("@/design-system");
const { RailProvider } = await import("@/app/rail");

beforeEach(() => {
  authState = { status: "AUTHENTICATED", identity: IDENTITY };
  providerValue = "SUPABASE";
  listSafe.mockReset();
  loadRepo.mockClear();
  localList.mockClear();
});
afterEach(cleanup);

function qcWrapper(): (p: { children: ReactNode }) => ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("S9.2-A1b · routeDomain (route → domain via the central contract)", () => {
  it("maps the customer LIST route to the customers domain", () => {
    expect(routeDomain("/customers")).toBe("customers");
  });
  it("does NOT map the customer DETAIL route (deferred broad rewrite → stays blocked)", () => {
    expect(routeDomain("/customers/cu-1")).toBeNull();
  });
  it("returns null for unconnected domains", () => {
    expect(routeDomain("/leads")).toBeNull();
    expect(routeDomain("/")).toBeNull();
  });
});

describe("S9.2-A1b · DomainNotConnectedGateView (route-aware)", () => {
  const child = <div data-testid="page-body">BODY</div>;

  it("LOCAL renders the page on any route", () => {
    render(
      <DomainNotConnectedGateView provider="LOCAL_INDEXEDDB" pathname="/leads">
        {child}
      </DomainNotConnectedGateView>,
    );
    expect(screen.getByTestId("page-body")).toBeTruthy();
  });
  it("SUPABASE mounts the connected customer LIST route", () => {
    render(
      <DomainNotConnectedGateView provider="SUPABASE" pathname="/customers">
        {child}
      </DomainNotConnectedGateView>,
    );
    expect(screen.getByTestId("page-body")).toBeTruthy();
    expect(screen.queryByText("DOMAIN_NOT_CONNECTED")).toBeNull();
  });
  it("SUPABASE blocks the customer DETAIL route (notice, page never mounts)", () => {
    render(
      <DomainNotConnectedGateView provider="SUPABASE" pathname="/customers/cu-1">
        {child}
      </DomainNotConnectedGateView>,
    );
    expect(screen.queryByTestId("page-body")).toBeNull();
    expect(screen.getByText("DOMAIN_NOT_CONNECTED")).toBeTruthy();
  });
  it("SUPABASE blocks every other domain route", () => {
    render(
      <DomainNotConnectedGateView provider="SUPABASE" pathname="/leads">
        {child}
      </DomainNotConnectedGateView>,
    );
    expect(screen.queryByTestId("page-body")).toBeNull();
    expect(screen.getByText("DOMAIN_NOT_CONNECTED")).toBeTruthy();
  });
});

describe("S9.2-A1b · useDomainCollection (composition read hook)", () => {
  it("SUPABASE + authenticated → reads via the loader using the CANONICAL org", async () => {
    listSafe.mockResolvedValue({ ok: true, data: [{ id: "cu-1", name: "רמי" }] as Customer[] });
    const { result } = renderHook(() => useDomainCollection<Customer>("customers"), {
      wrapper: qcWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.id).toBe("cu-1");
    expect(loadRepo).toHaveBeenCalledTimes(1);
    const ctx = loadRepo.mock.calls[0]?.[1] as { identity: ResolvedIdentity } | undefined;
    expect(ctx?.identity.organizationId).toBe("org-teragon");
  });

  it("SUPABASE + NOT authenticated → query disabled, loader never called (no leak)", async () => {
    authState = { status: "UNAUTHENTICATED", identity: null };
    const { result } = renderHook(() => useDomainCollection<Customer>("customers"), {
      wrapper: qcWrapper(),
    });
    await Promise.resolve();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(loadRepo).not.toHaveBeenCalled();
  });

  it("SUPABASE remote failure → typed, user-safe error (no silent empty success)", async () => {
    listSafe.mockResolvedValue({ ok: false, error: safeError("unauthorized", "customers") });
    const { result } = renderHook(() => useDomainCollection<Customer>("customers"), {
      wrapper: qcWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(domainReadMessage(result.current.error)).toBe("אין הרשאה לפעולה זו");
  });

  it("SUPABASE loader rejection → error, NEVER a local fallback", async () => {
    loadRepo.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useDomainCollection<Customer>("customers"), {
      wrapper: qcWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(localList).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("LOCAL → uses the local factory, NOT the Supabase loader", async () => {
    const { result } = renderHook(
      () => useDomainCollection<Customer>("customers", "LOCAL_INDEXEDDB"),
      { wrapper: qcWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.id).toBe("cu-local");
    expect(loadRepo).not.toHaveBeenCalled();
  });
});

describe("S9.2-A1b · CustomersPage in SUPABASE mode", () => {
  function renderPage(): void {
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
  }

  it("renders remote customers and hides the IndexedDB create control", async () => {
    listSafe.mockResolvedValue({
      ok: true,
      data: [
        { id: "cu-1", name: "רמי לוי", type: "עסק", city: "תל אביב", printerSummary: "2",
          revenue: 1000, contactState: "פעיל" } as Customer,
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("customers-page")).toBeTruthy());
    expect(screen.getByText("רמי לוי")).toBeTruthy();
    expect(screen.queryByText("לקוח חדש")).toBeNull();
    expect(screen.getByText("יצירת לקוח עדיין אינה זמינה בסביבת התצוגה")).toBeTruthy();
  });
});
