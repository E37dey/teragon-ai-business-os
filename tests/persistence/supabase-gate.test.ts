// S9.1-A — targeted tests: legacy repository hard gate + local boot shutdown in
// SUPABASE mode. Deterministic (no IndexedDB, no live backend). The default suite
// runs in LOCAL mode, so these use the factory test seam / injected boot deps to
// exercise the SUPABASE branch.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRepository,
  ProviderBypassError,
  __setProviderForTests,
  __resetRepositoriesForTests,
} from "@/repositories/factory";
import { bootLocalPersistence, type BootPersistenceDeps } from "@/app/bootPersistence";

afterEach(() => {
  __setProviderForTests(null);
  __resetRepositoriesForTests();
});

describe("S9.1-A · getRepository hard gate", () => {
  it("fails closed in SUPABASE mode — throws ProviderBypassError, opens no IndexedDB", () => {
    __setProviderForTests("SUPABASE");
    expect(() => getRepository("customers")).toThrow(ProviderBypassError);
  });

  it("the error identifies the domain safely and leaks no credential material", () => {
    __setProviderForTests("SUPABASE");
    try {
      getRepository("contacts");
      throw new Error("expected ProviderBypassError");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderBypassError);
      const e = err as ProviderBypassError;
      expect(e.collection).toBe("contacts");
      expect(e.code).toBe("PROVIDER_BYPASS_FORBIDDEN");
      expect(e.message).not.toMatch(/key|token|password|secret|service_role|eyJ/i);
    }
  });

  it("LOCAL mode behavior is unchanged — returns a repository", () => {
    __setProviderForTests("LOCAL_INDEXEDDB");
    expect(getRepository("customers")).toBeDefined();
  });
});

describe("S9.1-A · local boot init shutdown", () => {
  function spies(): BootPersistenceDeps {
    return {
      seedIfEmpty: vi.fn().mockResolvedValue([]),
      runMigrationsAtBoot: vi.fn().mockResolvedValue(undefined),
      applyUiSettingsAtBoot: vi.fn().mockResolvedValue(undefined),
      syncNotifications: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("SUPABASE mode is a strict no-op — zero seed / migration / sync invocations", async () => {
    const deps = spies();
    const result = await bootLocalPersistence(deps, "SUPABASE");
    expect(result.ran).toBe(false);
    expect(deps.seedIfEmpty).not.toHaveBeenCalled();
    expect(deps.runMigrationsAtBoot).not.toHaveBeenCalled();
    expect(deps.applyUiSettingsAtBoot).not.toHaveBeenCalled();
    expect(deps.syncNotifications).not.toHaveBeenCalled();
  });

  it("LOCAL mode runs the full local boot sequence once each", async () => {
    const deps = spies();
    const result = await bootLocalPersistence(deps, "LOCAL_INDEXEDDB");
    expect(result.ran).toBe(true);
    expect(deps.seedIfEmpty).toHaveBeenCalledTimes(1);
    expect(deps.runMigrationsAtBoot).toHaveBeenCalledTimes(1);
    expect(deps.applyUiSettingsAtBoot).toHaveBeenCalledTimes(1);
    expect(deps.syncNotifications).toHaveBeenCalledTimes(1);
  });
});
