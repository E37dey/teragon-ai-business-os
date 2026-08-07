// Grouped navigation model — Product V2 (S13.1): six calm primary groups.
// Every nav path is a real route; documented exclusions stay reachable;
// active-item/group resolution works.
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, activeItemForPath, groupOfPath } from "@/app/nav/navGroups";
import { APP_ROUTES } from "@/app/routes";

const ROUTE_PATHS = new Set(APP_ROUTES.map((r) => r.path));

describe("NAV_GROUPS integrity", () => {
  it("has the six Product V2 primary groups", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      "מרכז השליטה",
      "לקוחות ואנשי קשר",
      "AI וסוכנים",
      "ידע וזיכרון",
      "תפעול ואוטומציה",
      "מערכת ומתקדם",
    ]);
  });

  it("demoted governance lives under System & Advanced (not everyday nav)", () => {
    expect(groupOfPath("/governance")?.id).toBe("system");
  });

  it("every nav item path exists in the canonical route table", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(ROUTE_PATHS.has(item.path), `nav path ${item.path} missing from APP_ROUTES`).toBe(
          true,
        );
      }
    }
  });

  it("nav item paths are unique (no destination in two groups)", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("includes the wave-9 system routes", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.path));
    expect(paths).toContain("/system-health");
    expect(paths).toContain("/settings");
  });

  it("surfaces Customers and Contacts in the everyday nav (Product V2)", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.path));
    expect(paths).toContain("/customers");
    expect(paths).toContain("/contacts");
    expect(groupOfPath("/customers")?.id).toBe("customers");
  });

  it("keeps academic/submission reachable but demoted under System & Advanced", () => {
    for (const p of ["/submission", "/implementation", "/faq", "/personas"]) {
      expect(groupOfPath(p)?.id).toBe("system");
      expect(ROUTE_PATHS.has(p)).toBe(true);
    }
  });
});

describe("active item + group resolution", () => {
  it("exact path resolves to its item and group", () => {
    expect(activeItemForPath("/service")).toBe("/service");
    expect(groupOfPath("/service")?.id).toBe("operations");
  });

  it("nested path resolves by longest prefix (collaboration → AI group)", () => {
    expect(groupOfPath("/agents/collaboration")?.id).toBe("ai");
    expect(activeItemForPath("/agents/collaboration")).toBe("/agents/collaboration");
  });

  it("customer card resolves to the Customers group by prefix", () => {
    expect(groupOfPath("/customers/cu-1")?.id).toBe("customers");
  });

  it("root path activates the command center without matching everything", () => {
    expect(activeItemForPath("/")).toBe("/");
    expect(groupOfPath("/")?.id).toBe("command");
    expect(activeItemForPath("/settings")).toBe("/settings");
  });
});
