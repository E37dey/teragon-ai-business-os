// W7-F — the RTL keyboard map. DOCUMENTED SEMANTICS: the presentation reads
// right-to-left, so forward is LEFTWARD — ArrowLeft advances, ArrowRight goes
// back. Space advances, Escape exits, N/T/D/B toggle notes/timer/demo/backup.
import { describe, expect, it } from "vitest";
import { PRESENTATION_KEY_MAP, resolvePresentationKey } from "@/presentation";

describe("RTL arrow semantics", () => {
  it("ArrowLeft = קדימה (next) — the RTL reading direction", () => {
    expect(resolvePresentationKey({ code: "ArrowLeft" })).toBe("next");
  });

  it("ArrowRight = אחורה (prev)", () => {
    expect(resolvePresentationKey({ code: "ArrowRight" })).toBe("prev");
  });
});

describe("the full canonical map", () => {
  it("Space=next, Escape=exit, N=notes, T=timer, D=demo, B=backup", () => {
    expect(resolvePresentationKey({ code: "Space" })).toBe("next");
    expect(resolvePresentationKey({ code: "Escape" })).toBe("exit");
    expect(resolvePresentationKey({ code: "KeyN" })).toBe("toggle-notes");
    expect(resolvePresentationKey({ code: "KeyT" })).toBe("toggle-timer");
    expect(resolvePresentationKey({ code: "KeyD" })).toBe("open-demo");
    expect(resolvePresentationKey({ code: "KeyB" })).toBe("toggle-backup");
  });

  it("the exported map contains exactly these 8 bindings", () => {
    expect(Object.keys(PRESENTATION_KEY_MAP).sort()).toEqual(
      ["ArrowLeft", "ArrowRight", "Escape", "KeyB", "KeyD", "KeyN", "KeyT", "Space"].sort(),
    );
  });
});

describe("pass-through guards", () => {
  it("unmapped keys resolve to null", () => {
    expect(resolvePresentationKey({ code: "KeyZ" })).toBeNull();
    expect(resolvePresentationKey({ code: "ArrowUp" })).toBeNull();
  });

  it("modifier combinations never hijack browser shortcuts", () => {
    expect(resolvePresentationKey({ code: "ArrowLeft", ctrlKey: true })).toBeNull();
    expect(resolvePresentationKey({ code: "KeyT", metaKey: true })).toBeNull();
    expect(resolvePresentationKey({ code: "Space", altKey: true })).toBeNull();
  });

  it("keys typed into an editable element pass through (targetEditable)", () => {
    expect(resolvePresentationKey({ code: "Space", targetEditable: true })).toBeNull();
    expect(resolvePresentationKey({ code: "KeyN", targetEditable: true })).toBeNull();
  });
});
