import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StockDensityWarning } from "../client/src/components/StockDensityWarning";

const state = vi.hoisted(() => ({ results: [] as unknown[][] }));
vi.mock("../server/db", () => ({
  db: {
    select: () => {
      const result = state.results.shift() ?? [];
      const builder: any = {
        from: () => builder, where: () => builder, innerJoin: () => builder, leftJoin: () => builder,
        then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  },
}));
import { storage } from "../server/storage";

// All quantities and density in these tests are synthetic, never persisted.
function seed(density: number | null, matched = true) {
  state.results = [
    matched ? [{ name: "GSB", bulkDensity: density }] : [],
    [],
    [
      { site: "Synthetic site", material: "GSB", quantity: 10, uom: "Cum", unloadedAt: "yard", date: "2026-01-02" },
      { site: "Synthetic site", material: "GSB", quantity: 5, uom: "MT", unloadedAt: null, date: "2026-01-01" },
    ],
    [{ site: "Synthetic site", boqItemId: 1, quantity: 2 }],
    [{ boqItemId: 1, materialName: "GSB", qtyPerBoqUnit: 3, wastagePct: 0, uom: "Cum" }],
    [],
    [{ id: 1, name: "Synthetic site" }],
    [{ siteId: 1, description: "GSB", qty: 30, approvedQty: 20, uom: "Cum" }],
    [],
  ];
}

describe("MAT-03 Part D density omissions", () => {
  it("retains all three skipped sources and native quantities without affecting convertible MT", async () => {
    seed(null);
    const [r] = await storage.getSiteMaterialReconciliation();
    expect(r).toMatchObject({ ordered: 0, delivered: 5, consumed: 0, lying: 5, toSupply: 0, deliveredAtYard: 0, deliveredAtStretch: 5 });
    expect(r.densitySkips).toEqual({
      ordered: { count: 1, quantities: { CUM: 20 } },
      delivered: { count: 1, quantities: { CUM: 10 } },
      consumed: { count: 1, quantities: { CUM: 6 } },
    });
    const html = renderToStaticMarkup(<StockDensityWarning skips={r.densitySkips} matched={r.matched} />);
    expect(html).toContain("MT totals incomplete");
    expect(html).toContain("10 CUM");
    expect(html).toContain("recipe calculations");
  });

  it("uses supplied synthetic density with unchanged stock math and unloading split; no warning", async () => {
    seed(2);
    const [r] = await storage.getSiteMaterialReconciliation();
    expect(r).toMatchObject({ ordered: 40, delivered: 25, consumed: 12, lying: 13, toSupply: 15, deliveredAtYard: 20, deliveredAtStretch: 5 });
    expect(Object.values(r.densitySkips).every(s => s.count === 0)).toBe(true);
    expect(renderToStaticMarkup(<StockDensityWarning skips={r.densitySkips} matched />)).toBe("");
  });

  it("counts store issues only when linked to the exact project and BOQ item", async () => {
    seed(2);
    state.results[3] = [{
      site: "Synthetic site",
      boqItemId: 1,
      quantity: 2,
      layerConfig: { layerType: "none" },
      itemUnit: "MT",
    }];
    state.results[5] = [
      {
        siteName: "Synthetic site", projectSiteId: 1, issueSiteId: 1,
        boqProjectId: 9, boqItemId: 1, layerConfig: { layerType: "none" },
        materialName: "GSB", materialText: null, quantity: 4, uom: "MT",
      },
      {
        siteName: "Synthetic site", projectSiteId: 1, issueSiteId: 1,
        boqProjectId: null, boqItemId: null, layerConfig: { layerType: "none" },
        materialName: "GSB", materialText: null, quantity: 50, uom: "MT",
      },
      {
        siteName: "Synthetic site", projectSiteId: 1, issueSiteId: 2,
        boqProjectId: 9, boqItemId: 1, layerConfig: { layerType: "none" },
        materialName: "GSB", materialText: null, quantity: 25, uom: "MT",
      },
    ];

    const [row] = await storage.getSiteMaterialReconciliation();
    expect(row.consumed).toBe(4);
  });

  it("retains a missing-master material even when every record needs density", async () => {
    seed(null, false);
    state.results[2] = (state.results[2] as any[]).slice(0, 1);
    const [r] = await storage.getSiteMaterialReconciliation();
    expect(r).toMatchObject({ material: "GSB", matched: false, ordered: 0, delivered: 0, consumed: 0 });
    expect(r.densitySkips.delivered.count).toBe(1);
    expect(renderToStaticMarkup(<StockDensityWarning skips={r.densitySkips} matched={false} />)).toContain("Match this material");
  });

  it("does not mislabel unsupported units as missing density", async () => {
    seed(null);
    state.results[2] = [{ site: "Synthetic site", material: "GSB", quantity: 4, uom: "Nos" }];
    state.results[3] = [];
    state.results.splice(4, 1); // No recipes query with no progress.
    state.results[6] = [];
    expect(await storage.getSiteMaterialReconciliation()).toEqual([]);
  });

  it("preserves empty permission scope", async () => {
    seed(null);
    expect(await storage.getSiteMaterialReconciliation({ permittedSiteNames: [] })).toEqual([]);
    expect(state.results).toHaveLength(9);
  });
});