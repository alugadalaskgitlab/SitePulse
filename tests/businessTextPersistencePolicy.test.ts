import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("business-text persistence policy", () => {
  const source = fs.readFileSync("server/storage.ts", "utf8");

  it("normalizes BOQ project create, update, and duplicate paths", () => {
    expect(source).toMatch(/createBoqProject[\s\S]*?values\(normalizeBoqProjectBusinessText\(data\)\)/);
    expect(source).toMatch(/updateBoqProject[\s\S]*?set\(normalizeBoqProjectBusinessText\(data\)\)/);
    expect(source).toContain('name: uppercaseBusinessText(`Copy of ${src.name}`)');
  });

  it("uses the shared policy at representative master and transaction boundaries", () => {
    for (const method of [
      "createSite",
      "createParty",
      "createPlantMaterial",
      "createMixType",
      "createEquipment",
      "createPersonnel",
      "createStoreItem",
      "createPlantReport",
      "createPurchaseIndent",
      "createVendorBill",
    ]) {
      const start = source.indexOf(`async ${method}(`);
      expect(start, `${method} should exist`).toBeGreaterThanOrEqual(0);
      const body = source.slice(start, start + 5000);
      expect(body, `${method} should use the shared uppercase policy`).toContain("uppercaseBusinessText");
    }
  });

  it("normalizes alternate plant-clone and GRN store-item writers", () => {
    const cloneStart = source.indexOf("async clonePlantReport(");
    const cloneBody = source.slice(cloneStart, cloneStart + 2500);
    expect(cloneBody).toMatch(/siteName:\s*uppercaseBusinessText\(/);

    const grnStart = source.indexOf("async createDraftGrnFromPi(");
    const grnBody = source.slice(grnStart, grnStart + 5000);
    expect(grnBody).toContain("name: uppercaseBusinessText(item.description)");
    expect(grnBody).toContain("uom: item.uom");
  });
});