import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ results: [] as unknown[][] }));
vi.mock("../server/db", () => ({
  db: { select: () => {
    const result = state.results.shift() ?? [];
    const builder: any = {
      from: () => builder, where: () => builder, innerJoin: () => builder, orderBy: () => builder,
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return builder;
  } },
}));
import { storage } from "../server/storage";
const trip = { id: 3, site: "SYNTHETIC", material: "Soil", quantity: 800, uom: "CFT", boqItemId: 32,
  date: "2026-01-01", workType: "road", unloadedAt: "yard", yardLabel: "SYNTHETIC YARD" };
const recipes = [{ boqItemId: 32, materialName: "Soil", uom: "Cum", qtyPerBoqUnit: 999 }];
const materials = [{ name: "Soil", bulkDensity: 1.6 }];
describe("MAT-03 trip read enrichment", () => {
  it("enriches trip list using authorized returned rows", async () => {
    state.results = [[trip], recipes, materials];
    const [row] = await storage.getSiteMaterialTrips({ permittedSiteNames: ["SYNTHETIC"] });
    expect(row).toMatchObject({ boqQuantity: { quantity: 800 / 35.3147, uom: "Cum" } });
    expect(state.results).toHaveLength(0);
  });
  it("preserves enrichment and edit fields through reduced received report mapping", async () => {
    state.results = [[trip], [], recipes, materials, []];
    const [row] = await storage.getAllMaterialsReceived({ permittedSiteNames: ["SYNTHETIC"] });
    expect(row).toMatchObject({ source: "trip", workType: "road", unloadedAt: "yard", yardLabel: "SYNTHETIC YARD",
      boqQuantity: { quantity: 800 / 35.3147, uom: "Cum" } });
    expect(state.results).toHaveLength(0);
  });
  it("does not query trip or metadata rows for empty permission scope", async () => {
    state.results = [[trip]];
    expect(await storage.getSiteMaterialTrips({ permittedSiteNames: [] })).toEqual([]);
    expect(await storage.getAllMaterialsReceived({ permittedSiteNames: [] })).toEqual([]);
    expect(state.results).toHaveLength(1);
  });
  it("does not fabricate a conversion for missing density in the received report", async () => {
    state.results = [[trip], [], recipes, [{ name: "Soil", bulkDensity: null }], []];
    expect((await storage.getAllMaterialsReceived())[0].boqQuantity).toBeNull();
  });
});