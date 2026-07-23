/// <reference types="node" />
// W9-A · FINAL INTERACTION AUDIT — unit gate wired into the vitest suite.
//
// These tests make the static control auditor and the "no placeholder / no
// dead route" contract part of the standard `npm test` gate (not just an
// out-of-band script). They:
//   1. assert the canonical route table is well-formed (31 real routes);
//   2. assert EVERY route object resolves to a real page — none falls back to
//      RoutedPlaceholder (the "0 placeholders" contract);
//   3. run the static auditor and assert zero HIGH-severity dead controls;
//   4. assert the auditor's own rule self-test passes (detection is real).
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { isValidElement, type ReactElement } from "react";
import { appRouteObjects } from "@/app/router";
import { RoutedPlaceholder } from "@/app/routerPages";
import { APP_ROUTES } from "@/app/routes";
import type { RouteObject } from "react-router-dom";

const AUDITOR = "scripts/interaction-audit/audit.mjs";

function runAuditor(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("node", [AUDITOR, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 120_000,
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("canonical route table", () => {
  it("has 31 real routes with unique paths and Hebrew titles", () => {
    expect(APP_ROUTES.length).toBe(31);
    const paths = APP_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const r of APP_ROUTES) {
      expect(r.title.trim().length, `route ${r.path} has an empty title`).toBeGreaterThan(0);
      expect(r.navPath.startsWith("/"), `route ${r.path} navPath must be absolute`).toBe(true);
    }
  });
});

describe("no placeholder / no dead route contract", () => {
  // walk the route tree, collecting every element type
  function collectTypes(routes: RouteObject[], acc: unknown[]): void {
    for (const r of routes) {
      const el = (r as { element?: unknown }).element;
      if (isValidElement(el)) acc.push((el as ReactElement).type);
      const children = (r as { children?: RouteObject[] }).children;
      if (children) collectTypes(children, acc);
    }
  }

  it("no route element falls back to RoutedPlaceholder", () => {
    const types: unknown[] = [];
    collectTypes(appRouteObjects, types);
    const placeholders = types.filter((t) => t === RoutedPlaceholder);
    expect(placeholders.length, "at least one route is still a placeholder").toBe(0);
  });
});

describe("static control auditor (dead-control gate)", () => {
  it("reports zero HIGH-severity findings across src/**", () => {
    const { code, out } = runAuditor(["--no-write"]);
    // exit code 0 ⇒ no high-severity findings (the auditor's own contract)
    expect(out).toMatch(/findings: high=\d+/);
    const m = /findings: high=(\d+)/.exec(out);
    const high = m && m[1] ? Number.parseInt(m[1], 10) : -1;
    expect(high, `auditor reported HIGH findings:\n${out}`).toBe(0);
    expect(code).toBe(0);
  });

  it("passes its own rule self-test (detection is genuine)", () => {
    const { code, out } = runAuditor(["--selftest"]);
    expect(out, out).toMatch(/0 missed · 0 false-positive/);
    expect(code).toBe(0);
  });
});
