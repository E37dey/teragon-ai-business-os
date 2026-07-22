// Grouped navigation model — every nav path is a real route; documented
// exclusions stay reachable; active-item/group resolution works.
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, activeItemForPath, groupOfPath } from "@/app/nav/navGroups";
import { APP_ROUTES } from "@/app/routes";

const ROUTE_PATHS = new Set(APP_ROUTES.map((r) => r.path));

describe("NAV_GROUPS integrity", () => {
  it("has the 5 canonical groups", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      "ניהול העסק",
      "שירות והדרכה",
      "ידע ואוטומציה",
      "הטמעה והגשה",
      "ניהול המערכת",
    ]);
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

  it("nav item paths are unique", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("includes the two new wave-9 placeholder routes", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.path));
    expect(paths).toContain("/system-health");
    expect(paths).toContain("/settings");
  });

  it("/customers is deliberately NOT in the nav but stays a real route", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.path));
    expect(paths).not.toContain("/customers");
    expect(ROUTE_PATHS.has("/customers")).toBe(true);
  });
});

describe("active item + group resolution", () => {
  it("exact path resolves to its item and group", () => {
    expect(activeItemForPath("/service")).toBe("/service");
    expect(groupOfPath("/service")?.id).toBe("service");
  });

  it("nested path resolves by longest prefix (customer card → CRM group stays open)", () => {
    expect(groupOfPath("/agents/collaboration")?.id).toBe("knowledge");
    expect(activeItemForPath("/agents/collaboration")).toBe("/agents/collaboration");
  });

  it("root path activates the command center without matching everything", () => {
    expect(activeItemForPath("/")).toBe("/");
    expect(groupOfPath("/")?.id).toBe("business");
    expect(activeItemForPath("/settings")).toBe("/settings");
  });
});
