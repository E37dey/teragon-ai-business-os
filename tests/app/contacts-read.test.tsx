// S9.3-B — contacts LIST read (route-aware gate + composition-aware read).
// Deterministic: Auth, the async Supabase seam and the local factory are all
// injected fakes; no live Supabase, no IndexedDB, no network, no Playwright.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { ResolvedIdentity } from "@/auth/types";
import type { Contact } from "@/domain/types";
import type { RepoResult } from "@/persistence/result";
import { safeError } from "@/persistence/result";
import type { CollectionKey } from "@/repositories/collections";
import type { DomainLoadContext } from "@/persistence/composition/loadSupabaseDomainRepository";

const IDENTITY: ResolvedIdentity = {
  userId: "u1", profileId: "u1", name: "אבי", email: "a@b.co",
  organizationId: "org-teragon", organizationName: "טרגון",
  roleId: "crole-sysadmin", roleLabel: "מנהל", capabilities: [], membershipId: "m1",
};

const contact = (over: Partial<Contact> = {}): Contact =>
  ({ id: "ct-1", customerId: "cu-1", name: "דנה כהן", role: "רכש", phone: "050",
     email: "d@k.co", isPrimary: true,
     createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over }) as Contact;

let authState: { status: string; identity: ResolvedIdentity | null } = {
  status: "AUTHENTICATED", identity: IDENTITY,
};
let providerValue = "SUPABASE";

vi.mock("@/auth/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/persistence/provider", async (orig) => {
  const actual = await orig<typeof import("@/persistence/provider")>();
  return { ...actual, get PERSISTENCE_PROVIDER() { return providerValue; } };
});

const listSafe = vi.fn<() => Promise<RepoResult<Contact[]>>>();
// Mirrors loadSupabaseDomainRepository(collection, ctx) so mock.calls is a real tuple.
const loadRepo = vi.fn(async (_collection: CollectionKey, _ctx: DomainLoadContext) => ({ listSafe }));
vi.mock("@/persistence/composition/loadSupabaseDomainRepository", () => ({
  loadSupabaseDomainRepository: (...a: Parameters<typeof loadRepo>) => loadRepo(...a),
}));

const localList = vi.fn(async () => [] as Contact[]);
vi.mock("@/repositories", async (orig) => {
  const actual = await orig<typeof import("@/repositories")>();
  return { ...actual, getRepository: () => ({ list: localList }) };
});

// Imports AFTER mocks so the mocked modules are bound.
const { routeDomain } = await import("@/app/data/routeDomain");
const { DomainNotConnectedGateView } = await import("@/persistence/composition/DomainNotConnectedGate");
const { isSupabaseConnectedDomain } = await import("@/persistence/composition/domainComposition");
const { APP_ROUTES } = await import("@/app/routes");
const { default: ContactsPage } = await import("@/modules/contacts/ContactsPage");

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
const renderPage = (): ReturnType<typeof render> => {
  const Wrapper = qcWrapper();
  return render(<Wrapper><ContactsPage /></Wrapper>);
};

describe("S9.3-B · contacts route registration + connected contract", () => {
  it("registers /contacts as a canonical app route", () => {
    expect(APP_ROUTES.some((r) => r.path === "/contacts")).toBe(true);
  });
  it("maps the contacts LIST route to the contacts domain", () => {
    expect(routeDomain("/contacts")).toBe("contacts");
  });
  it("does NOT map a contact DETAIL route — detail is a later checkpoint", () => {
    expect(routeDomain("/contacts/ct-1")).toBeNull();
  });
  it("marks contacts connected without disturbing customers", () => {
    expect(isSupabaseConnectedDomain("contacts")).toBe(true);
    expect(isSupabaseConnectedDomain("customers")).toBe(true); // stays LIVE_VALIDATED
    expect(isSupabaseConnectedDomain("leads")).toBe(false);
  });
  it("SUPABASE mounts /contacts through the route-aware gate", () => {
    render(
      <DomainNotConnectedGateView provider="SUPABASE" pathname="/contacts">
        <div data-testid="page-body">BODY</div>
      </DomainNotConnectedGateView>,
    );
    expect(screen.getByTestId("page-body")).toBeTruthy();
  });
});

describe("S9.3-B · ContactsPage read states", () => {
  it("success — renders the contacts returned by the authenticated remote read", async () => {
    listSafe.mockResolvedValue({
      ok: true,
      data: [contact(), contact({ id: "ct-2", name: "רון לוי", role: "תפעול", email: "r@l.co", isPrimary: false })],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("contacts-page")).toBeTruthy());
    expect(screen.getByText("דנה כהן")).toBeTruthy();
    expect(screen.getByText("רון לוי")).toBeTruthy();
    expect(screen.getByText("רכש")).toBeTruthy();
    expect(screen.getByText("תפעול")).toBeTruthy();
    expect(screen.getByText("d@k.co")).toBeTruthy();
    expect(screen.getByText("r@l.co")).toBeTruthy();
    expect(screen.getByText("ראשי")).toBeTruthy();
    expect(screen.getByText("משני")).toBeTruthy();
    expect(localList).not.toHaveBeenCalled(); // no IndexedDB in SUPABASE mode
  });

  it("reads with the CANONICAL identity organization, never a browser-supplied one", async () => {
    listSafe.mockResolvedValue({ ok: true, data: [contact()] });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("contacts-page")).toBeTruthy());
    expect(loadRepo).toHaveBeenCalledTimes(1);
    const [collection, ctx] = loadRepo.mock.calls[0]!;
    expect(collection).toBe("contacts");
    expect(ctx.identity?.organizationId).toBe("org-teragon");
  });

  it("loading — shows a busy status before the read resolves", () => {
    listSafe.mockImplementation(() => new Promise<RepoResult<Contact[]>>(() => undefined));
    renderPage();
    expect(screen.getByRole("status").textContent).toMatch(/טוען אנשי קשר/);
  });

  it("empty — renders the page with an honest empty reason, not an error", async () => {
    listSafe.mockResolvedValue({ ok: true, data: [] });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("contacts-page")).toBeTruthy());
    expect(screen.getByText("אין אנשי קשר להצגה")).toBeTruthy();
    expect(screen.queryByText("טעינת אנשי הקשר נכשלה")).toBeNull();
  });

  it("repository failure — fails closed with the SAFE message and NO rows", async () => {
    listSafe.mockResolvedValue({ ok: false, error: safeError("network", "קריאת אנשי הקשר נכשלה") });
    renderPage();
    await waitFor(() => expect(screen.getByText("טעינת אנשי הקשר נכשלה")).toBeTruthy());
    expect(screen.queryByTestId("contacts-page")).toBeNull();
    expect(screen.queryByText("דנה כהן")).toBeNull();
    expect(localList).not.toHaveBeenCalled(); // never falls back to local data
  });

  it("unauthenticated — the loader is never called and no protected rows render", async () => {
    authState = { status: "UNAUTHENTICATED", identity: null };
    listSafe.mockResolvedValue({ ok: true, data: [contact()] });
    renderPage();
    await waitFor(() => expect(loadRepo).not.toHaveBeenCalled());
    expect(screen.queryByText("דנה כהן")).toBeNull();
  });

  it("domain-not-connected — an unconnected route is blocked in SUPABASE mode", () => {
    render(
      <DomainNotConnectedGateView provider="SUPABASE" pathname="/leads">
        <div data-testid="page-body">BODY</div>
      </DomainNotConnectedGateView>,
    );
    expect(screen.queryByTestId("page-body")).toBeNull();
  });
});
