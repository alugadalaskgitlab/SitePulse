import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  dprBoqItemDisplayName,
  dprSelectableBoqItems,
  resolveDprBoqProjectId,
} from "../shared/dprBoqSelection";

describe("shared DPR BOQ selection", () => {
  it("uses one project rule and lets Edit preserve the DPR's saved project", () => {
    const projects = [
      { id: 30, status: "draft", barCount: 12 },
      { id: 20, status: "active", barCount: 0 },
      { id: 10, status: "active", barCount: 4 },
    ];

    expect(resolveDprBoqProjectId(projects)).toBe(10);
    expect(resolveDprBoqProjectId(projects, 20)).toBe(20);
    expect(resolveDprBoqProjectId(projects, 999)).toBe(10);
  });

  it("preserves API ordering and excludes only explicit DPR opt-outs", () => {
    const apiItems = [
      { id: 41, includeInDpr: true },
      { id: 17, includeInDpr: false },
      { id: 29, includeInDpr: null },
      { id: 8 },
    ];

    expect(dprSelectableBoqItems(apiItems).map((item) => item.id)).toEqual([41, 29, 8]);
  });

  it("shows only BOQ-owned saved names, never canonical/SNL labels", () => {
    expect(dprBoqItemDisplayName({
      id: 1,
      displayName: "Clearing and grubbing",
      itemName: "Older BOQ name",
      description: "Full BOQ description",
      canonicalDisplayName: "SNL replacement",
      snlShortLabel: "SDB replacement",
    })).toBe("Clearing and grubbing");
  });

  it("routes all three DPR activity selectors through the same hook and picker", () => {
    for (const page of ["GuidedDpr", "SiteEntry", "SiteEdit"]) {
      const source = readFileSync(`client/src/pages/${page}.tsx`, "utf8");
      expect(source, page).toContain("useDprBoqItems");
      expect(source, page).toContain("<BillItemPicker");
      expect(source, page).toContain("dprBoqItemDisplayName");
    }
  });
});