// S14.6 Phase 4 — the split-mode visual Agent→Note relationship renders a directional
// connector for a REAL read trace, and an honest empty state when none exist.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CrossViewRelations } from "@/modules/ai-workspace/visual/CrossViewRelations";
import { __resetRetrievalTraceForTests, recordRetrieval } from "@/agents/obsidian/retrievalTrace";

beforeEach(() => __resetRetrievalTraceForTests());
afterEach(() => {
  cleanup();
  __resetRetrievalTraceForTests();
});

describe("CrossViewRelations (split-mode visual Agent→Note)", () => {
  it("no trace ⇒ explicit empty state, no relation", () => {
    render(<CrossViewRelations />);
    expect(screen.getByTestId("cross-view-empty")).toBeTruthy();
    expect(screen.queryAllByTestId("cross-view-relation")).toHaveLength(0);
  });

  it("a real read trace ⇒ one directional Wiki→AI Operations.md relation with source + a11y text", () => {
    recordRetrieval({ id: "c1", agentId: "ag-wiki", action: "read", vaultName: "TERAGON OS", notePath: "AI Operations.md", basename: "AI Operations", resultCount: 1, at: 100, correlationId: "c1", success: true });
    render(<CrossViewRelations />);
    const rel = screen.getByTestId("cross-view-relation");
    expect(rel.getAttribute("data-agent")).toBe("ag-wiki");
    expect(rel.getAttribute("data-note")).toBe("AI Operations.md");
    expect(rel.textContent).toContain("סוכן ידע"); // Wiki nameHe
    expect(rel.textContent).toContain("AI Operations");
    expect(rel.textContent).toContain("TERAGON OS"); // source attribution
    expect(rel.textContent).toContain("סוכן ידע קרא את AI Operations מ-Obsidian"); // accessible sentence
  });

  it("a search-only trace ⇒ still empty (searches create no single-note relation)", () => {
    recordRetrieval({ id: "s1", agentId: "ag-wiki", action: "search", vaultName: "TERAGON OS", query: "ai", resultCount: 3, at: 100, correlationId: "s1", success: true });
    render(<CrossViewRelations />);
    expect(screen.getByTestId("cross-view-empty")).toBeTruthy();
  });
});
