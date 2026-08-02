// S9.2-A1d1 — customer DETAIL authenticated remote read + reduced Customer-360.
// Deterministic: Auth, route params, the async Supabase seam, and the local
// factory are injected/spied; no live Supabase, no IndexedDB writes, no network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
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
const record = (over: Partial<Customer> = {}): Customer =>
  ({ id: "cu-1", name: "רמי לוי", type: "עסק", phone: "050-1", email: "r@l.co", city: "תל אביב",
     organizationId: null, printerSummary: "", courseNames: [], revenue: 0,
     contactState: "פעיל", review: null, status: "פעיל",
     createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", ...over }) as Customer;
const RECORD_KEY = ["domain-record", "SUPABASE", "customers", "cu-1", "u1", "org-teragon"];

let authState: { status: string; identity: ResolvedIdentity | null } = { status: "AUTHENTICATED", identity: IDENTITY };
let providerValue = "SUPABASE";
let paramId: string | undefined = "cu-1";

vi.mock("@/auth/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/persistence/provider", async (o) => {
  const a = await o<typeof import("@/persistence/provider")>();
  return { ...a, get PERSISTENCE_PROVIDER() { return providerValue; } };
});
vi.mock("react-router-dom", async (o) => {
  const a = await o<typeof import("react-router-dom")>();
  return { ...a, useParams: () => ({ id: paramId }) };
});

const getSafe = vi.fn<[string], Promise<RepoResult<Customer | undefined>>>();
const updateSafe = vi.fn<[string, Partial<Customer>], Promise<RepoResult<Customer>>>();
const loadRepo = vi.fn(async () => ({ getSafe, updateSafe }));
vi.mock("@/persistence/composition/loadSupabaseDomainRepository", () => ({
  loadSupabaseDomainRepository: (...a: unknown[]) => loadRepo(...(a as [])),
}));
vi.mock("@/repositories", async (o) => {
  const a = await o<typeof import("@/repositories")>();
  return { ...a, getRepository: vi.fn(a.getRepository) };
});
vi.mock("@/app/data/hooks", async (o) => {
  const a = await o<typeof import("@/app/data/hooks")>();
  return { ...a, invalidateCollections: vi.fn(async () => undefined) };
});

const { SupabaseCustomerDetail } = await import("@/modules/customers/SupabaseCustomerDetail");
const { useDomainRecord } = await import("@/app/data/useDomainRecord");
const { routeDomain } = await import("@/app/data/routeDomain");
const { DomainNotConnectedGateView } = await import("@/persistence/composition/DomainNotConnectedGate");
const { getRepository } = await import("@/repositories");
const { ToastProvider } = await import("@/design-system");

beforeEach(() => {
  authState = { status: "AUTHENTICATED", identity: IDENTITY };
  providerValue = "SUPABASE";
  paramId = "cu-1";
  getSafe.mockReset();
  updateSafe.mockReset();
  loadRepo.mockClear();
  (getRepository as unknown as ReturnType<typeof vi.fn>).mockClear();
});
afterEach(cleanup);

function renderDetail(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <SupabaseCustomerDetail />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

describe("S9.2-A1d1 · route gate for /customers/:id", () => {
  it("maps the detail route to customers; unrelated route stays unmapped", () => {
    expect(routeDomain("/customers/cu-1")).toBe("customers");
    expect(routeDomain("/leads")).toBeNull();
  });
  it("SUPABASE mounts the detail route, blocks an unrelated one", () => {
    const child = <div data-testid="body">B</div>;
    const { rerender } = render(
      <DomainNotConnectedGateView provider="SUPABASE" pathname="/customers/cu-1">{child}</DomainNotConnectedGateView>,
    );
    expect(screen.getByTestId("body")).toBeTruthy();
    rerender(<DomainNotConnectedGateView provider="SUPABASE" pathname="/leads">{child}</DomainNotConnectedGateView>);
    expect(screen.queryByTestId("body")).toBeNull();
  });
});

describe("S9.2-A1d1 · SupabaseCustomerDetail read", () => {
  it("loads the customer remotely by id, with the CANONICAL org, and shows core info", async () => {
    getSafe.mockResolvedValue({ ok: true, data: record() });
    renderDetail();
    await waitFor(() => expect(screen.getByTestId("customer-detail-supabase")).toBeTruthy());
    expect(screen.getByText("רמי לוי")).toBeTruthy();
    expect(screen.getByText("r@l.co")).toBeTruthy();
    expect(getSafe).toHaveBeenCalledWith("cu-1");
    const ctx = loadRepo.mock.calls[0]?.[1] as { identity: ResolvedIdentity };
    expect(ctx.identity.organizationId).toBe("org-teragon");
    expect(getRepository).not.toHaveBeenCalled(); // no IndexedDB / no fallback
  });

  it("shows exactly one compact deferred-sections notice and mounts NO disconnected sections", async () => {
    getSafe.mockResolvedValue({ ok: true, data: record() });
    renderDetail();
    await waitFor(() => expect(screen.getByTestId("customer-detail-supabase")).toBeTruthy());
    expect(screen.getAllByText("המידע המשלים יחובר בשלבי ההטמעה הבאים")).toHaveLength(1);
    expect(screen.queryByText("אנשי קשר")).toBeNull();
    expect(screen.queryByText("מדפסות הלקוח")).toBeNull();
    expect(screen.queryByText("הצעות מחיר פתוחות")).toBeNull();
  });

  it("loading state before the remote resolves", () => {
    getSafe.mockImplementation(() => new Promise(() => {})); // never resolves
    renderDetail();
    expect(screen.getByText("טוען את כרטיס הלקוח מהשרת…")).toBeTruthy();
  });

  it("invalid id → safe validation state, no remote call", () => {
    paramId = undefined;
    renderDetail();
    expect(screen.getByText("מזהה לקוח שגוי")).toBeTruthy();
    expect(loadRepo).not.toHaveBeenCalled();
  });

  it("not-found → remote returned no record", async () => {
    getSafe.mockResolvedValue({ ok: true, data: undefined });
    renderDetail();
    await waitFor(() => expect(screen.getByText("לקוח לא נמצא")).toBeTruthy());
  });

  it("safe remote-error state (no raw error, no local fallback)", async () => {
    getSafe.mockResolvedValue({ ok: false, error: safeError("unauthorized", "customers") });
    renderDetail();
    await waitFor(() => expect(screen.getByText("טעינת כרטיס הלקוח נכשלה")).toBeTruthy());
    expect(screen.getByText("אין הרשאה לפעולה זו")).toBeTruthy();
    expect(getRepository).not.toHaveBeenCalled();
  });

  it("edit action uses the existing remote update flow", async () => {
    getSafe.mockResolvedValue({ ok: true, data: record() });
    updateSafe.mockResolvedValue({ ok: true, data: record({ name: "רמי מעודכן" }) });
    renderDetail();
    await waitFor(() => expect(screen.getByText("רמי לוי")).toBeTruthy());
    fireEvent.click(screen.getByText("עריכת לקוח"));
    await waitFor(() => expect(screen.getByText("שמירה")).toBeTruthy());
    fireEvent.click(screen.getByText("שמירה"));
    await waitFor(() => expect(updateSafe).toHaveBeenCalledTimes(1));
    expect(updateSafe.mock.calls[0]?.[0]).toBe("cu-1");
  });
});

describe("S9.2-A1d1 · useDomainRecord session safety + LOCAL parity", () => {
  it("logout removes the protected detail record from cache", async () => {
    getSafe.mockResolvedValue({ ok: true, data: record() });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(() => useDomainRecord<Customer>("customers", "cu-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(RECORD_KEY)).toBeDefined();
    await act(async () => {
      authState = { status: "UNAUTHENTICATED", identity: null };
      rerender();
    });
    await waitFor(() => expect(qc.getQueryData(RECORD_KEY)).toBeUndefined());
  });

  it("LOCAL renders the existing Customer-360, not the reduced SUPABASE view", async () => {
    providerValue = "LOCAL_INDEXEDDB";
    const { default: CustomerDetailPage } = await import("@/modules/customers/CustomerDetailPage");
    const { RailProvider } = await import("@/app/rail");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ToastProvider>
            <RailProvider>
              <CustomerDetailPage />
            </RailProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId("customer-detail-supabase")).toBeNull();
  });
});
