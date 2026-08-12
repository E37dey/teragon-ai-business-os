// S9.3-D — contact WRITE seam (create + update) from the SUPABASE customer detail.
// Deterministic: Auth, the async Supabase seam and the local factory are injected
// fakes; no live Supabase, no IndexedDB, no Playwright.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { ResolvedIdentity } from "@/auth/types";
import type { Contact } from "@/domain/types";
import type { RepoResult } from "@/persistence/result";
import type { CollectionKey } from "@/repositories/collections";
import type { DomainLoadContext } from "@/persistence/composition/loadSupabaseDomainRepository";

const IDENTITY: ResolvedIdentity = {
  userId: "u1", profileId: "u1", name: "אבי", email: "a@b.co",
  organizationId: "org-teragon", organizationName: "טרגון",
  roleId: "crole-sysadmin", roleLabel: "מנהל", capabilities: [], membershipId: "m1",
};
const SCOPED_KEY = ["domain-collection", "SUPABASE", "contacts", "u1", "org-teragon"];
const INPUT = { name: "דנה כהן", role: "רכש", phone: "050", email: "d@k.co", isPrimary: true };

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

const upsertSafe = vi.fn<(entity: Contact) => Promise<RepoResult<Contact>>>();
const updateSafe = vi.fn<(id: string, patch: Partial<Contact>) => Promise<RepoResult<Contact>>>();
const listSafe = vi.fn<() => Promise<RepoResult<Contact[]>>>();
const loadRepo = vi.fn(async (_collection: CollectionKey, _ctx: DomainLoadContext) => ({ upsertSafe, updateSafe, listSafe }));
vi.mock("@/persistence/composition/loadSupabaseDomainRepository", () => ({
  loadSupabaseDomainRepository: (...a: Parameters<typeof loadRepo>) => loadRepo(...a),
}));

const localList = vi.fn(async () => [] as Contact[]);
vi.mock("@/repositories", async (orig) => {
  const actual = await orig<typeof import("@/repositories")>();
  return { ...actual, getRepository: () => ({ list: localList }) };
});

const { useContactMutation } = await import("@/app/data/useContactMutation");
const { CustomerContactsPanel } = await import("@/modules/contacts/CustomerContactsPanel");
const { ToastProvider } = await import("@/design-system");

beforeEach(() => {
  authState = { status: "AUTHENTICATED", identity: IDENTITY };
  providerValue = "SUPABASE";
  upsertSafe.mockReset();
  updateSafe.mockReset();
  listSafe.mockReset();
  listSafe.mockResolvedValue({ ok: true, data: [] });
  loadRepo.mockClear();
  localList.mockClear();
});
afterEach(cleanup);

function setup(): {
  qc: QueryClient;
  result: { current: ReturnType<typeof useContactMutation> };
  rerender: () => void;
} {
  // gcTime must NOT be 0 here: applyCacheOnSuccess writes through setQueryData,
  // which creates a query with no observer — with gcTime 0 that entry is garbage
  // collected before the assertion can read it, making the test race the GC
  // rather than the behavior under test.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useContactMutation(), { wrapper });
  return { qc, result: view.result, rerender: () => view.rerender() };
}

function renderPanel(customerId = "cu-1"): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <CustomerContactsPanel customerId={customerId} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

describe("S9.3-D · contact create", () => {
  it("create success — writes through the contacts repository and caches the record", async () => {
    upsertSafe.mockResolvedValue({ ok: true, data: contact() });
    const { qc, result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => { res = await result.current.create(INPUT, "cu-1", "ct-1"); });
    expect(res.ok).toBe(true);
    expect(upsertSafe).toHaveBeenCalledTimes(1);
    expect((qc.getQueryData(SCOPED_KEY) as Contact[])[0]?.id).toBe("ct-1");
  });

  it("customerId/org integrity — the parent comes from the ARGUMENT, never the form", async () => {
    upsertSafe.mockResolvedValue({ ok: true, data: contact() });
    const { result } = setup();
    await act(async () => {
      // A hostile form payload cannot re-parent or set an organization.
      await result.current.create(
        { ...INPUT, customerId: "cu-attacker", organization_id: "attacker-org" } as typeof INPUT,
        "cu-1",
        "ct-1",
      );
    });
    const written = upsertSafe.mock.calls[0]![0];
    expect(written.customerId).toBe("cu-1");
    expect(JSON.stringify(written)).not.toContain("cu-attacker");
    expect(JSON.stringify(written)).not.toContain("attacker-org");
    // org scoping comes from the canonical identity via the loader context
    const [collection, ctx] = loadRepo.mock.calls[0]!;
    expect(collection).toBe("contacts");
    expect(ctx.identity?.organizationId).toBe("org-teragon");
  });

  it("required-name validation fails closed with NO remote call", async () => {
    const { result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => { res = await result.current.create({ ...INPUT, name: "  " }, "cu-1", "ct-1"); });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_FAILED");
    expect(upsertSafe).not.toHaveBeenCalled();
    expect(loadRepo).not.toHaveBeenCalled();
  });

  it("duplicate submit with the same id collapses to ONE logical write", async () => {
    upsertSafe.mockResolvedValue({ ok: true, data: contact() });
    const { result } = setup();
    await act(async () => {
      await Promise.all([
        result.current.create(INPUT, "cu-1", "ct-dup"),
        result.current.create(INPUT, "cu-1", "ct-dup"),
      ]);
    });
    expect(upsertSafe).toHaveBeenCalledTimes(1);
  });

  it("repository failure — safe typed error and NOTHING cached", async () => {
    upsertSafe.mockResolvedValue({ ok: false, error: { code: "network", message: "תקלת רשת — נסו שוב", retriable: true } });
    const { qc, result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => { res = await result.current.create(INPUT, "cu-1", "ct-1"); });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("REMOTE_WRITE_FAILED");
    expect(qc.getQueryData(SCOPED_KEY)).toBeUndefined();
  });

  it("unauthorized — a write resolving after logout does NOT repopulate protected cache", async () => {
    let resolveUpsert!: (r: RepoResult<Contact>) => void;
    upsertSafe.mockImplementation(() => new Promise<RepoResult<Contact>>((r) => { resolveUpsert = r; }));
    const { qc, result, rerender } = setup();
    let p!: Promise<unknown>;
    await act(async () => { p = result.current.create(INPUT, "cu-1", "ct-1"); await Promise.resolve(); });
    // user logs out mid-write — rerender so the hook's auth snapshot updates
    authState = { status: "UNAUTHENTICATED", identity: null };
    rerender();
    await act(async () => { resolveUpsert({ ok: true, data: contact() }); await p; });
    expect(qc.getQueryData(SCOPED_KEY)).toBeUndefined();
  });
});

describe("S9.3-D · contact update", () => {
  it("update success — patches through the repository and refreshes the cache", async () => {
    updateSafe.mockResolvedValue({ ok: true, data: contact({ name: "דנה מעודכנת" }) });
    const { qc, result } = setup();
    await act(async () => { await result.current.update("ct-1", { ...INPUT, name: "דנה מעודכנת" }); });
    expect(updateSafe).toHaveBeenCalledTimes(1);
    expect((qc.getQueryData(SCOPED_KEY) as Contact[])[0]?.name).toBe("דנה מעודכנת");
  });

  it("an update patch can NEVER re-parent a contact to another customer", async () => {
    updateSafe.mockResolvedValue({ ok: true, data: contact() });
    const { result } = setup();
    await act(async () => {
      await result.current.update("ct-1", { ...INPUT, customerId: "cu-attacker" } as typeof INPUT);
    });
    const patch = updateSafe.mock.calls[0]![1];
    expect(patch).not.toHaveProperty("customerId");
    expect(JSON.stringify(patch)).not.toContain("cu-attacker");
  });
});

describe("S9.3-D · panel refresh after a successful save", () => {
  it("the saved contact appears in the panel without a manual reload", async () => {
    listSafe.mockResolvedValue({ ok: true, data: [] });
    upsertSafe.mockResolvedValue({ ok: true, data: contact({ name: "איש קשר חדש" }) });
    renderPanel("cu-1");
    await waitFor(() => expect(screen.getByTestId("customer-contacts")).toBeTruthy());
    expect(screen.getByText("אין אנשי קשר ללקוח זה")).toBeTruthy();

    fireEvent.click(screen.getByText("איש קשר חדש"));
    fireEvent.change(screen.getByLabelText("שם *"), { target: { value: "איש קשר חדש" } });
    // the list refetch after invalidation returns the saved row
    listSafe.mockResolvedValue({ ok: true, data: [contact({ name: "איש קשר חדש" })] });
    fireEvent.submit(screen.getByText("שמירה").closest("form")!);

    await waitFor(() => expect(upsertSafe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("אין אנשי קשר ללקוח זה")).toBeNull());
  });

  it("blank name shows the required-field error and never calls the repository", async () => {
    listSafe.mockResolvedValue({ ok: true, data: [] });
    renderPanel("cu-1");
    await waitFor(() => expect(screen.getByTestId("customer-contacts")).toBeTruthy());
    fireEvent.click(screen.getByText("איש קשר חדש"));
    fireEvent.submit(screen.getByText("שמירה").closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/שם איש הקשר/));
    expect(upsertSafe).not.toHaveBeenCalled();
  });
});
