import { describe, expect, it } from "vitest";
import { openUsageHandoffContext, type OpenUsageLike } from "../shared/dprPlantLink";

describe("06Y Site DPR continuity client contracts", () => {
  it("renders supplied Site-to-Site handoff context without making it a second usage", () => {
    const successor: OpenUsageLike = {
      id: 91,
      equipmentId: 14,
      openingReading: 0,
      handoffFromSite: "North Camp",
      handoffAt: "11:30",
      inheritedOpeningReading: 0,
    };
    expect(openUsageHandoffContext(successor)).toBe("Handoff from North Camp · 11:30 · Opening 0");
  });

  it("keeps same-day continuity inclusive and preserves exact plant linkage in every Site surface", async () => {
    const fs = await import("node:fs/promises");
    const [guided, detailed, edit] = await Promise.all([
      fs.readFile("client/src/pages/GuidedDpr.tsx", "utf8"),
      fs.readFile("client/src/pages/SiteEntry.tsx", "utf8"),
      fs.readFile("client/src/pages/SiteEdit.tsx", "utf8"),
    ]);

    for (const source of [guided, detailed, edit]) {
      expect(source).toContain("fetchLatestPriorClosing(");
      expect(source).toContain("{ inclusive: true }");
    }
    expect(guided).toContain("plantUsageId === u.id");
    expect(detailed).toContain("linkedElsewhere");
    expect(edit).toContain("row.plantUsageId != null");
    expect(edit).toContain("plantUsageId: e.plantUsageId ?? null");
  });
});