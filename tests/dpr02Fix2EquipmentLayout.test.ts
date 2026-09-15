import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guided = readFileSync("client/src/pages/GuidedDpr.tsx", "utf8");
const siteEdit = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
const siteEntry = readFileSync("client/src/pages/SiteEntry.tsx", "utf8");

describe("DPR-02 Fix 2 equipment layout", () => {
  it("keeps equipment setup visible instead of behind the old auto-collapsing summary", () => {
    for (const source of [guided, siteEdit]) {
      expect(source).not.toContain("Equipment setup and additional usage details");
      expect(source).not.toContain("<summary");
    }
    expect((guided.match(/hideIdentity/g) ?? []).length).toBe(1);
    expect((siteEdit.match(/hideIdentity/g) ?? []).length).toBe(1);
  });

  it("uses the outer identity controls only in the two reorganized parents", () => {
    expect(guided).toContain("data-testid={`text-eq-reg-${i}`}");
    expect(guided).toContain("data-testid={`badge-eq-owner-${i}`}");
    expect(siteEdit).toContain("data-testid={`text-equipment-reg-${idx}`}");
    expect(siteEdit).toContain("data-testid={`text-equipment-owner-${idx}`}");
    expect(siteEntry).not.toContain("hideIdentity");
  });

  it("keeps deployment, operator, source, trip fields ahead of the compact editor", () => {
    const guidedStart = guided.indexOf("const master = activeEquipmentMaster.find");
    const siteEditStart = siteEdit.indexOf("const isTripBased = entry.entryType");
    const guidedCompact = guided.indexOf("<DprEquipmentCompact", guidedStart);
    const siteEditCompact = siteEdit.indexOf("<DprEquipmentCompact", siteEditStart);

    expect(guidedStart).toBeGreaterThan(-1);
    expect(siteEditStart).toBeGreaterThan(-1);
    expect(guided.indexOf("Deployment / Usage Type", guidedStart)).toBeLessThan(guidedCompact);
    expect(guided.indexOf("Operator", guidedStart)).toBeLessThan(guidedCompact);
    const guidedSource = guided.indexOf("Diesel Source", guidedStart);
    const guidedPurchase = guided.indexOf("section-eq-purchase-${i}", guidedStart);
    const guidedTrip = guided.indexOf("input-eq-trips", guidedStart);
    const guidedWater = guided.indexOf("section-eq-water-${i}", guidedStart);
    expect(guidedSource).toBeLessThan(guidedPurchase);
    expect(guidedPurchase).toBeLessThan(guidedTrip);
    expect(guidedSource).toBeLessThan(guidedWater);
    expect(guidedSource).toBeLessThan(guidedCompact);

    expect(siteEdit.indexOf("Entry Type", siteEditStart)).toBeLessThan(siteEditCompact);
    expect(siteEdit.indexOf("Operator", siteEditStart)).toBeLessThan(siteEditCompact);
    const siteEditSource = siteEdit.indexOf("Diesel Source", siteEditStart);
    const siteEditPurchase = siteEdit.indexOf("input-fuel-station-${idx}", siteEditStart);
    const siteEditTrip = siteEdit.indexOf("input-equipment-trips", siteEditStart);
    const siteEditWater = siteEdit.indexOf("input-equipment-water-qty-${idx}", siteEditStart);
    expect(siteEditSource).toBeLessThan(siteEditPurchase);
    expect(siteEditPurchase).toBeLessThan(siteEditTrip);
    expect(siteEditSource).toBeLessThan(siteEditWater);
    expect(siteEditSource).toBeLessThan(siteEditCompact);
  });
});