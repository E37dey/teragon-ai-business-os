// S10.3 — demo-only pilot safety baseline.
// Proves the banner renders, that demo mode fails CLOSED, that outbound side
// effects are blocked, and that the shipped demo seed carries no routable
// third-party contact data.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import {
  DEMO_BANNER_HE,
  externalSideEffectDecision,
  isDemoMode,
  isExternalSideEffectAllowed,
  type ExternalChannel,
} from "@/app/demoMode";
import { DemoModeBanner } from "@/app/DemoModeBanner";

const CHANNELS: ExternalChannel[] = ["email", "sms", "webhook", "push", "third-party-api"];

/** import.meta.env is frozen per module; stub it per test. */
function withDemoEnv(value: string | undefined, fn: () => void): void {
  vi.stubEnv("VITE_DEMO_MODE", value as string);
  try { fn(); } finally { vi.unstubAllEnvs(); }
}

afterEach(cleanup);

describe("S10.3 · demo mode is fail-closed", () => {
  it("is ON by default (no flag set)", () => {
    withDemoEnv(undefined, () => expect(isDemoMode()).toBe(true));
  });

  it("stays ON for every value except an explicit 'false'", () => {
    for (const v of ["", "0", "no", "FALSE ", "off", "true", "yes", "maybe"]) {
      withDemoEnv(v, () => {
        const expected = v.trim().toLowerCase() !== "false";
        expect(isDemoMode(), `VITE_DEMO_MODE=${JSON.stringify(v)}`).toBe(expected);
      });
    }
  });

  it("turns OFF only for an explicit 'false'", () => {
    withDemoEnv("false", () => expect(isDemoMode()).toBe(false));
  });
});

describe("S10.3 · persistent Hebrew banner", () => {
  it("renders the exact product wording in demo mode", () => {
    withDemoEnv(undefined, () => {
      render(<DemoModeBanner />);
      expect(screen.getByTestId("demo-mode-banner")).toBeTruthy();
      expect(screen.getByText(DEMO_BANNER_HE)).toBeTruthy();
      expect(DEMO_BANNER_HE).toBe("סביבת הדגמה — הנתונים במערכת סינתטיים ואינם נתוני העסק");
    });
  });

  it("is announced to assistive tech and offers NO dismiss control", () => {
    withDemoEnv(undefined, () => {
      const { container } = render(<DemoModeBanner />);
      expect(screen.getByRole("status")).toBeTruthy();
      expect(container.querySelectorAll("button")).toHaveLength(0);
    });
  });

  it("disappears only when demo mode is explicitly disabled", () => {
    withDemoEnv("false", () => {
      render(<DemoModeBanner />);
      expect(screen.queryByTestId("demo-mode-banner")).toBeNull();
    });
  });

  it("is mounted above the router in the application entrypoint", () => {
    const main = readFileSync("src/main.tsx", "utf8");
    expect(main).toContain("<DemoModeBanner />");
    // above RouterProvider ⇒ visible on every route, including /login
    expect(main.indexOf("<DemoModeBanner />")).toBeLessThan(main.indexOf("<RouterProvider"));
  });
});

describe("S10.3 · outbound side effects blocked", () => {
  it("blocks EVERY external channel in demo mode", () => {
    withDemoEnv(undefined, () => {
      for (const c of CHANNELS) {
        const d = externalSideEffectDecision(c);
        expect(d.allowed, c).toBe(false);
        expect(d.reason, c).toBe("demo_mode_blocked");
        expect(d.messageHe.length).toBeGreaterThan(0);
        expect(isExternalSideEffectAllowed(c)).toBe(false);
      }
    });
  });

  it("still blocks third-party APIs outside demo mode while remote AI is off", () => {
    withDemoEnv("false", () => {
      vi.stubEnv("VITE_AI_REMOTE_ENABLED", "false");
      const d = externalSideEffectDecision("third-party-api");
      expect(d.allowed).toBe(false);
      expect(d.reason).toBe("ai_remote_disabled");
    });
  });

  it("never leaks a technical detail in the refusal message", () => {
    withDemoEnv(undefined, () => {
      const msg = externalSideEffectDecision("email").messageHe;
      for (const leak of ["http", "://", "Error", "stack", "@"]) expect(msg).not.toContain(leak);
    });
  });
});

describe("S10.3 · demo seed carries no routable third-party contacts", () => {
  const seed = readFileSync("src/repositories/seed/seedData.ts", "utf8");

  it("uses example.com for EVERY seeded email address", () => {
    const domains = [...seed.matchAll(/"[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})"/g)]
      .map((m) => m[1]);
    expect(domains.length).toBeGreaterThan(0);
    expect([...new Set(domains)]).toEqual(["example.com"]);
  });

  it("contains no consumer mailbox providers", () => {
    expect(seed).not.toMatch(/@(gmail|hotmail|outlook|yahoo|walla|icloud)\./i);
  });

  it("keeps the staging SQL seed on a non-routable domain", () => {
    const sql = readFileSync("supabase/migrations/014_staging_seed.sql", "utf8");
    const domains = [...sql.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+)/g)].map((m) => m[1]);
    for (const d of new Set(domains)) expect(d).toMatch(/\.local$|example\.com$/);
  });
});
