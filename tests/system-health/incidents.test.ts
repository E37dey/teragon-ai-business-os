// W8-D — health incidents: opened only from states that justify one, written
// zod-valid into governanceIncidents, duplicate-guarded per component.
import { beforeEach, describe, expect, it } from "vitest";
import { healthIncidentSchema } from "@/domain/system-health";
import { __resetRepositoriesForTests } from "@/repositories";
import { uncheckedComponent } from "@/system-health/checks";
import { incidentJustified, openHealthIncident } from "@/system-health/incidents";
import { makeEnv, T0 } from "./helpers";

beforeEach(() => __resetRepositoriesForTests());

function componentIn(state: string) {
  return { ...uncheckedComponent("netlify-functions"), state } as never;
}

describe("incidentJustified", () => {
  it("only דורש תשומת לב / לא זמין justify an incident — never green or unchecked", () => {
    expect(incidentJustified(componentIn("דורש תשומת לב"))).toBe(true);
    expect(incidentJustified(componentIn("לא זמין"))).toBe(true);
    expect(incidentJustified(componentIn("תקין"))).toBe(false);
    expect(incidentJustified(componentIn("טרם נבדק"))).toBe(false);
    expect(incidentJustified(componentIn("לא הוגדר"))).toBe(false);
  });
});

describe("openHealthIncident", () => {
  it("refuses to open from a state that does not require care", async () => {
    const env = await makeEnv();
    await expect(
      openHealthIncident({ collection: env.collection }, componentIn("תקין"), "בודק", () => T0),
    ).rejects.toThrow(/אין לפתוח אירוע/);
  });

  it("writes a zod-valid incident and guards against duplicates per component", async () => {
    const env = await makeEnv();
    const component = componentIn("לא זמין");
    const first = await openHealthIncident({ collection: env.collection }, component, "בודק", () => T0);
    expect(() => healthIncidentSchema.parse(first)).not.toThrow();
    expect(first.status).toBe("פתוח");
    expect(first.source).toBe("system-health");

    const second = await openHealthIncident({ collection: env.collection }, component, "בודק", () => T0);
    expect(second.id).toBe(first.id);
    expect(await env.collection("governanceIncidents").list()).toHaveLength(1);
  });
});
