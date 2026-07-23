// W7-G (7.25) GAP-FILL — "direct URL to a protected artefact" + "hidden draft
// evidence is not usable".
//
// HONEST STATE (documented in docs/WAVE_7_SECURITY_REPORT.md): the app has NO
// authentication system — demo mode, single CEO identity. Every route is
// reachable by direct URL, deliberately. What IS enforced and pinned here:
// (1) the route table is closed — only canonical APP_ROUTES paths exist, an
//     unknown deep link lands on the NotFound element (no accidental surface);
// (2) the demo-mode guard (guardDestructiveAction) is the only "protection"
//     layer — its behavior is ALREADY pinned by tests/presentation/
//     demoMode.test.ts, so it is not re-tested here (gap-fill only);
// (3) a draft (טיוטה) knowledge article attached as gate evidence can never
//     satisfy a criterion or make the gate ready — hidden drafts are unusable
//     even when someone force-attaches them by direct reference.
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/app/routes";
import { appRouteObjects } from "@/app/router";
import { validateGate } from "@/domain/stage-gates";
import { makeArticle } from "../knowledge/helpers";
import { defOf, makeCtx, makeGateV2, makeRef, NOW } from "../stage-gates/helpers";

describe("W7-G 7.25 — direct-URL access model (honest: no auth, closed route table)", () => {
  it("the shell mounts EXACTLY the canonical APP_ROUTES + a catch-all NotFound", () => {
    const top = appRouteObjects[0];
    const shell = top?.children?.find((c) => c.path === "/");
    expect(shell).toBeDefined();
    const paths = (shell?.children ?? []).map((c) => (c.index ? "/" : `/${c.path}`));
    // every canonical route is mounted…
    for (const r of APP_ROUTES.filter((r) => r.path !== "/submission/presentation")) {
      expect(paths).toContain(r.path);
    }
    // …and the ONLY non-canonical child is the catch-all
    const extras = paths.filter(
      (p) => p !== "/*" && !APP_ROUTES.some((r) => r.path === p),
    );
    expect(extras).toEqual([]);
    expect((shell?.children ?? []).some((c) => c.path === "*")).toBe(true);
  });

  it("/submission/presentation is deliberately top-level (full-screen) — a documented, intended public surface", () => {
    const top = appRouteObjects[0];
    const presentation = top?.children?.find((c) => c.path === "/submission/presentation");
    expect(presentation).toBeDefined();
    expect(APP_ROUTES.some((r) => r.path === "/submission/presentation")).toBe(true);
  });

  it("no route defines a loader/auth guard — pinned so the security report stays honest", () => {
    const walk = (nodes: readonly (typeof appRouteObjects)[number][]): boolean =>
      nodes.every((n) => n.loader === undefined && walk(n.children ?? []));
    expect(walk(appRouteObjects)).toBe(true);
  });
});

describe("W7-G 7.25 — hidden DRAFT evidence stays unusable at the GATE level", () => {
  it("a force-attached draft article never satisfies the criterion nor readies the gate", () => {
    const draft = makeArticle({
      approval: { state: "טיוטה", approvalId: null, decidedById: null, decidedAt: null, noteHe: "" },
    });
    const g1 = defOf("G1");
    const gate = makeGateV2("sg-1", {
      attachedEvidence: [
        makeRef({ refType: "knowledgeArticle", refId: draft.id, criterionKey: "g1-goal" }),
      ],
    });
    const v = validateGate(gate, g1, makeCtx({ knowledgeArticles: [draft] }), NOW);
    const goal = v.criteria.find((c) => c.def.key === "g1-goal");
    expect(goal?.validCount).toBe(0);
    expect(goal?.invalidCount).toBe(1);
    expect(goal?.state).not.toBe("מולא");
    expect(v.readyForGo).toBe(false);
  });
});
