import { describe, expect, it } from "vitest";
import { matchPrinters, solutionEstimate, type NeedAssessment } from "@/modules/sales/matching";
import type { PrinterModel, Product } from "@/domain/types";

const base = { createdAt: "2026-01-01T08:00:00.000Z", updatedAt: "2026-01-01T08:00:00.000Z" };

function model(
  id: string,
  name: string,
  technology: "FDM" | "רזין",
  price: number,
  tags: string[],
): PrinterModel {
  return { id, ...base, name, manufacturer: "יצרן", technology, price, tags, note: "" };
}

const CATALOGUE: PrinterModel[] = [
  model("pm-mini", "Bambu Lab A1 Mini", "FDM", 1290, ["תחביב", "לימודים"]),
  model("pm-a1", "Bambu Lab A1", "FDM", 1990, ["תחביב", "אב־טיפוס"]),
  model("pm-x1c", "Bambu Lab X1C", "FDM", 6490, ["ייצור קטן", "חלקים טכניים", "מקצועי"]),
  model("pm-mars", "Elegoo Mars 4 Ultra", "רזין", 1450, ["מיניאטורות", "דיוק גבוה"]),
];

const need = (overrides: Partial<NeedAssessment> = {}): NeedAssessment => ({
  useCase: "תחביב",
  materials: ["PLA"],
  buildVolume: "בינוני",
  budget: 4000,
  ...overrides,
});

describe("matchPrinters — deterministic catalogue-only rules engine", () => {
  it("never recommends outside the given catalogue", () => {
    const results = matchPrinters(CATALOGUE, need(), 3);
    const ids = new Set(CATALOGUE.map((m) => m.id));
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(ids.has(r.model.id)).toBe(true);
  });

  it("is deterministic: same input ⇒ same ranking", () => {
    const a = matchPrinters(CATALOGUE, need()).map((r) => r.model.id);
    const b = matchPrinters(CATALOGUE, need()).map((r) => r.model.id);
    expect(a).toEqual(b);
  });

  it("resin need ranks the resin printer first", () => {
    const results = matchPrinters(CATALOGUE, need({ materials: ["רזין"], useCase: "מיניאטורות" }));
    expect(results[0]?.model.id).toBe("pm-mars");
    expect(results[0]?.suitability.join(" ")).toContain("רזין");
  });

  it("technical materials favor the technical machine and flag limits on others", () => {
    const results = matchPrinters(
      CATALOGUE,
      need({ materials: ["ABS"], budget: 10000, useCase: "חלקים טכניים" }),
    );
    expect(results[0]?.model.id).toBe("pm-x1c");
    const nonTechnical = results.find((r) => r.model.id === "pm-a1");
    if (nonTechnical) {
      expect(nonTechnical.limitations.join(" ")).toContain("תא סגור");
    }
  });

  it("over-budget models are penalized and honestly flagged", () => {
    const results = matchPrinters(CATALOGUE, need({ budget: 1500 }), 4);
    const x1c = results.find((r) => r.model.id === "pm-x1c");
    expect(x1c?.overBudget).toBe(true);
    expect(x1c?.limitations.join(" ")).toContain("גבוה מהתקציב");
    expect(results[0]?.overBudget).toBe(false);
  });

  it("empty catalogue returns no results (no invention)", () => {
    expect(matchPrinters([], need())).toEqual([]);
  });
});

describe("solutionEstimate", () => {
  const products: Product[] = [
    {
      id: "prod-course",
      ...base,
      name: "קורס אישי",
      category: "קורס",
      description: "",
      price: 2490,
      active: true,
    },
    {
      id: "prod-fil",
      ...base,
      name: "פילמנט PETG",
      category: "חומר גלם",
      description: "",
      price: 95,
      active: true,
    },
  ];

  it("totals printer + accessories + course from the products catalogue", () => {
    const match = matchPrinters(CATALOGUE, need())[0];
    expect(match).toBeDefined();
    if (!match) return;
    const est = solutionEstimate(match, products, need());
    const accessoriesTotal = est.accessories.reduce((s, a) => s + a.product.price, 0);
    expect(est.printerPrice).toBe(match.model.price);
    expect(est.recommendedCourse?.id).toBe("prod-course");
    expect(est.total).toBe(match.model.price + accessoriesTotal + 2490);
  });

  it("no filament accessory for resin printers", () => {
    const match = matchPrinters(CATALOGUE, need({ materials: ["רזין"], useCase: "מיניאטורות" }))[0];
    expect(match?.model.technology).toBe("רזין");
    if (!match) return;
    const est = solutionEstimate(match, products, need({ materials: ["רזין"] }));
    expect(est.accessories.find((a) => a.product.id === "prod-fil")).toBeUndefined();
  });
});
