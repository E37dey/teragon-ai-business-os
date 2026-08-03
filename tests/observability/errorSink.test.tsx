// S10.0-B — provider-neutral error sink + root render boundary.
// Deterministic: no network, no vendor SDK, no Supabase. The provider is
// injected per test and reset afterwards so tests stay isolated.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import {
  reportError,
  sanitizeErrorEvent,
  setErrorReportProvider,
  resetErrorReportProvider,
  type SafeErrorEvent,
} from "@/observability/errorSink";
import { RootErrorBoundary } from "@/app/RootErrorBoundary";

afterEach(() => {
  resetErrorReportProvider(); // isolation: never leak a provider into the next test
  cleanup();
});

function Boom(): ReactElement {
  throw new Error("secret@example.com row payload 42");
}

describe("S10.0-B · sink whitelist", () => {
  it("keeps ONLY the six allowed fields", () => {
    const out = sanitizeErrorEvent({
      kind: "domain_read_denied", code: "unauthorized", domain: "contacts",
      route: "/contacts", correlationId: "abc-1", timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(Object.keys(out).sort()).toEqual(
      ["code", "correlationId", "domain", "kind", "route", "timestamp"],
    );
  });

  it("DISCARDS unsafe extra fields an unsanitized caller spreads in", () => {
    const hostile = {
      kind: "render_error", code: "X",
      message: "secret@example.com", stack: "at foo()", rows: [{ id: 1 }],
      payload: { a: 1 }, email: "a@b.co", userId: "u1", session: "tok",
      headers: { auth: "Bearer x" }, token: "eyJabc", body: "raw",
    } as unknown as SafeErrorEvent;
    const out = sanitizeErrorEvent(hostile);
    const serialized = JSON.stringify(out);
    for (const leak of ["secret@example.com", "at foo()", "Bearer", "eyJabc", "u1", "raw"]) {
      expect(serialized).not.toContain(leak);
    }
    expect(Object.keys(out)).toHaveLength(6);
  });

  it("collapses object values and strips a route query string", () => {
    const out = sanitizeErrorEvent({
      kind: "render_error",
      code: { toString: () => "leak" } as unknown as string,
      route: "/contacts?email=a@b.co&id=ct-1",
    });
    expect(out.code).toBe("[REDACTED]");
    expect(out.route).toBe("/contacts");
  });

  it("fills a timestamp when omitted", () => {
    expect(sanitizeErrorEvent({ kind: "render_error", code: "X" }).timestamp).toMatch(/^\d{4}-/);
  });
});

describe("S10.0-B · sink robustness", () => {
  it("delivers the sanitized event to an injected provider", () => {
    const seen: unknown[] = [];
    setErrorReportProvider((e) => seen.push(e));
    reportError({ kind: "domain_write_denied", code: "unauthorized", domain: "contacts" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: "domain_write_denied", code: "unauthorized", domain: "contacts" });
  });

  it("a THROWING provider never propagates to the caller", () => {
    setErrorReportProvider(() => { throw new Error("transport down"); });
    expect(() => reportError({ kind: "render_error", code: "X" })).not.toThrow();
  });

  it("defaults to a no-op provider (reports nowhere until opted in)", () => {
    // reset already ran in afterEach of the previous test
    expect(() => reportError({ kind: "render_error", code: "X" })).not.toThrow();
  });
});

describe("S10.0-B · root error boundary", () => {
  it("catches a render error, reports ONCE, and shows the safe Hebrew screen", () => {
    const events: { kind: string; code: string }[] = [];
    setErrorReportProvider((e) => events.push(e));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<RootErrorBoundary onReload={() => undefined}><Boom /></RootErrorBoundary>);

    expect(screen.getByTestId("root-error-boundary")).toBeTruthy();
    expect(screen.getByText("אירעה תקלה בלתי צפויה")).toBeTruthy();
    expect(screen.getByRole("button", { name: "רענון המסך" })).toBeTruthy();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "render_error", code: "UNCAUGHT_RENDER_ERROR" });
    spy.mockRestore();
  });

  it("exposes NO technical detail from the thrown error", () => {
    setErrorReportProvider(() => undefined);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(
      <RootErrorBoundary onReload={() => undefined}><Boom /></RootErrorBoundary>,
    );
    const html = container.innerHTML;
    expect(html).not.toContain("secret@example.com");
    expect(html).not.toContain("payload");
    expect(html).not.toContain("Error");
    spy.mockRestore();
  });

  it("a FAILING provider still leaves the recovery screen usable", () => {
    setErrorReportProvider(() => { throw new Error("transport down"); });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onReload = vi.fn();
    render(<RootErrorBoundary onReload={onReload}><Boom /></RootErrorBoundary>);
    expect(screen.getByTestId("root-error-boundary")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "רענון המסך" }));
    expect(onReload).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("renders children untouched when nothing throws", () => {
    render(<RootErrorBoundary><div data-testid="ok">fine</div></RootErrorBoundary>);
    expect(screen.getByTestId("ok")).toBeTruthy();
    expect(screen.queryByTestId("root-error-boundary")).toBeNull();
  });
});
