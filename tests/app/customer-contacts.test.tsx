// S9.3-C — customer-scoped contacts read inside the SUPABASE customer detail.
// Deterministic: Auth, route params, the async Supabase seam and the local
// factory are injected fakes; no live Supabase, no IndexedDB, no Playwright.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
const loadRepo = vi.fn(async (_collection: CollectionKey, _ctx: DomainLoadContext) => ({ listSafe }));
vi.mock("@/persistence/composition/loadSupabaseDomainRepository", () => ({
  loadSupabaseDomainRepository: (...a: Parameters<typeof loadRepo>) => loadRepo(...a),
}));

const localList = vi.fn(async () => [] as Contact[]);
vi.mock("@/repositories", async (orig) => {
  const actual = await orig<typeof import("@/repositories")>();
  return { ...actual, getRepository: () => ({ list: localList }) };
});

const { CustomerContactsPanel } = await import("@/modules/contacts/CustomerContactsPanel");

beforeEach(() => {
  authState = { status: "AUTHENTICATED", identity: IDENTITY };
  providerValue = "SUPABASE";
  listSafe.mockReset();
  loadRepo.mockClear();
  localList.mockClear();
});
afterEach(cleanup);

function wrapper(): (p: { children: ReactNode }) => ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}
const renderPanel = (customerId = "cu-1"): ReturnType<typeof render> => {
  const W = wrapper();
  return render(<W><CustomerContactsPanel customerId={customerId} /></W>);
};

describe("S9.3-C · CustomerContactsPanel — customer-scoped read", () => {
  it("shows the contacts belonging to the current customer", async () => {
    listSafe.mockResolvedValue({
      ok: true,
      data: [contact(), contact({ id: "ct-2", name: "רון לוי", role: "תפעול", email: "r@l.co", isPrimary: false })],
    });
    renderPanel("cu-1");
    await waitFor(() => expect(screen.getByTestId("customer-contacts")).toBeTruthy());
    expect(screen.getByText("דנה כהן")).toBeTruthy();
    expect(screen.getByText("רון לוי")).toBeTruthy();
    expect(screen.getByText("רכש")).toBeTruthy();
    expect(screen.getByText("d@k.co")).toBeTruthy();
    expect(screen.getByText("ראשי")).toBeTruthy();
    expect(screen.getByText("משני")).toBeTruthy();
    expect(localList).not.toHaveBeenCalled(); // no IndexedDB fallback in SUPABASE
  });

  it("EXCLUDES contacts belonging to another customer", async () => {
    listSafe.mockResolvedValue({
      ok: true,
      data: [
        contact({ id: "ct-1", customerId: "cu-1", name: "שייך ללקוח" }),
        contact({ id: "ct-9", customerId: "cu-999", name: "לקוח אחר", email: "other@x.co" }),
      ],
    });
    renderPanel("cu-1");
    await waitFor(() => expect(screen.getByTestId("customer-contacts")).toBeTruthy());
    expect(screen.getByText("שייך ללקוח")).toBeTruthy();
    expect(screen.queryByText("לקוח אחר")).toBeNull();
    expect(screen.queryByText("other@x.co")).toBeNull();
    expect(screen.getByText(/1 אנשי קשר ללקוח זה/)).toBeTruthy();
  });

  it("empty — a customer with no contacts gets an honest empty reason, not an error", async () => {
    listSafe.mockResolvedValue({ ok: true, data: [contact({ customerId: "cu-other" })] });
    renderPanel("cu-1");
    await waitFor(() => expect(screen.getByTestId("customer-contacts")).toBeTruthy());
    expect(screen.getByText("אין אנשי קשר ללקוח זה")).toBeTruthy();
    expect(screen.queryByText("טעינת אנשי הקשר נכשלה")).toBeNull();
  });

  it("loading — shows a busy status before the read resolves", () => {
    listSafe.mockImplementation(() => new Promise<RepoResult<Contact[]>>(() => undefined));
    renderPanel();
    expect(screen.getByRole("status").textContent).toMatch(/טוען אנשי קשר/);
  });

  it("repository failure — fails closed with the SAFE message and NO rows", async () => {
    listSafe.mockResolvedValue({ ok: false, error: safeError("network", "קריאת אנשי הקשר נכשלה") });
    renderPanel();
    await waitFor(() => expect(screen.getByText("טעינת אנשי הקשר נכשלה")).toBeTruthy());
    expect(screen.queryByTestId("customer-contacts")).toBeNull();
    expect(screen.queryByText("דנה כהן")).toBeNull();
    expect(localList).not.toHaveBeenCalled();
  });

  it("reads with the CANONICAL identity organization, never a browser-supplied one", async () => {
    listSafe.mockResolvedValue({ ok: true, data: [contact()] });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("customer-contacts")).toBeTruthy());
    const [collection, ctx] = loadRepo.mock.calls[0]!;
    expect(collection).toBe("contacts");
    expect(ctx.identity?.organizationId).toBe("org-teragon");
  });

  it("unauthenticated — the loader is never called and no contact rows render", async () => {
    authState = { status: "UNAUTHENTICATED", identity: null };
    listSafe.mockResolvedValue({ ok: true, data: [contact()] });
    renderPanel();
    await waitFor(() => expect(loadRepo).not.toHaveBeenCalled());
    expect(screen.queryByText("דנה כהן")).toBeNull();
  });
});
