// TERAGON Business Graph — Phase 11 OPERATOR-AUTH flag tests.
import { describe, expect, it } from "vitest";
import {
  BUSINESS_GRAPH_OPERATOR_AUTH_ENABLED,
  createOperatorAuthPolicy,
  resolveOperatorAuthEnabled,
} from "@/graph";

describe("operator-auth flag", () => {
  it("defaults OFF", () => {
    expect(BUSINESS_GRAPH_OPERATOR_AUTH_ENABLED).toBe(false);
    expect(resolveOperatorAuthEnabled()).toBe(false);
    expect(resolveOperatorAuthEnabled(undefined)).toBe(false);
  });

  it("honors an explicit in-process override only", () => {
    expect(resolveOperatorAuthEnabled(true)).toBe(true);
    expect(resolveOperatorAuthEnabled(false)).toBe(false);
  });

  it("builds a pure policy whose isEnabled reflects the resolved flag", () => {
    expect(createOperatorAuthPolicy().isEnabled()).toBe(false);
    expect(createOperatorAuthPolicy(false).isEnabled()).toBe(false);
    expect(createOperatorAuthPolicy(true).isEnabled()).toBe(true);
  });

  it("is not exposed as a window/global mutable singleton", () => {
    const g = globalThis as Record<string, unknown>;
    expect(g["businessGraphOperatorAuth"]).toBeUndefined();
    expect(g["OperatorAuthenticator"]).toBeUndefined();
    expect("window" in g ? (g["window"] as Record<string, unknown>)["operatorAuth"] : undefined).toBeUndefined();
  });
});
