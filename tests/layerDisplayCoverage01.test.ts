import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { barSideCoverage } from "../shared/dprProgrammeLink";

const bar = {
  side: "both_sides",
  chainageFrom: 2.5,
  chainageTo: 3.8,
} as const;

describe("LAYER-01 DPR layer/lift display", () => {
  it.each([
    ["client/src/components/DprPreviewDialog.tsx", "layerDisplayName(p.activity, p.layerNo)"],
    ["client/src/pages/DprDetails.tsx", "layerDisplayName(item.activity, item.layerNo)"],
    ["client/src/pages/SitePreview.tsx", "layerDisplayName(item.activity, item.layerNo)"],
    ["client/src/pages/GuidedDpr.tsx", "layerDisplayName(e.activity, e.layerNo)"],
  ])("shows the recorded layer conditionally in %s", (file, displayCall) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("layerNo != null");
    expect(source).toContain(displayCall);
    expect(source).not.toMatch(/layerNo\s*\?\?\s*1/);
  });
});

describe("LAYER-01 layer-aware programme-bar coverage", () => {
  it("qualifies a fully recorded Layer 1 without claiming all layered work is complete", () => {
    const coverage = barSideCoverage(bar, [
      { side: "LHS", fromKm: 2.5, toKm: 3.8, layerNo: 1 },
      { side: "RHS", fromKm: 2.5, toKm: 3.8, layerNo: 1 },
    ]);
    expect(coverage.fullyCovered).toBe(false);
    expect(coverage.byLayer).toHaveLength(1);
    expect(coverage.byLayer[0]).toMatchObject({ layerNo: 1, fullyCovered: true });
  });

  it("reports each recorded layer independently", () => {
    const coverage = barSideCoverage(bar, [
      { side: "LHS", fromKm: 2.5, toKm: 3.8, layerNo: 1 },
      { side: "RHS", fromKm: 2.5, toKm: 3.8, layerNo: 1 },
      { side: "LHS", fromKm: 2.5, toKm: 3.0, layerNo: 2 },
    ]);
    expect(coverage.byLayer.map((row) => row.layerNo)).toEqual([1, 2]);
    expect(coverage.byLayer.map((row) => row.fullyCovered)).toEqual([true, false]);
    expect(coverage.byLayer[1].lhs).toEqual([[2.5, 3]]);
    expect(coverage.byLayer[1].rhs).toEqual([]);
  });

  it("keeps legacy non-layered coverage unchanged", () => {
    const coverage = barSideCoverage(bar, [
      { side: "LHS", fromKm: 2.5, toKm: 3.8, layerNo: null },
      { side: "RHS", fromKm: 2.5, toKm: 3.8 },
    ]);
    expect(coverage.byLayer).toBeUndefined();
    expect(coverage.fullyCovered).toBe(true);
  });

  it("threads layerNo through storage and presents qualified per-layer wording", () => {
    const storage = readFileSync("server/storage.ts", "utf8");
    const picker = readFileSync("client/src/components/ProgrammeBarPicker.tsx", "utf8");
    expect(storage).toContain("layerNo: progressEntries.layerNo");
    expect(storage).toContain("layerNo: r.layerNo != null ? Number(r.layerNo) : null");
    expect(picker).toContain("Recorded layer coverage");
    expect(picker).toContain("full range recorded for this layer only");
    expect(picker).toContain("does not indicate that all required layers are complete");
  });
});