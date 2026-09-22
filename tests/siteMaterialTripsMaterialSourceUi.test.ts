import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const page = read("client/src/pages/SiteMaterialTrips.tsx");
const suggestions = read("client/src/hooks/use-site-material-suggestions.ts");

describe("VB-22 site material trip source supplier UI", () => {
  it("keeps the source supplier independent from vehicle/transporter autofill", () => {
    expect(page).toContain('data-testid="input-trip-material-source-supplier"');
    expect(page).toContain("materialSourceSupplier: value.toUpperCase()");
    expect(page).toContain("? { supplier: association.supplier }");
    expect(page).not.toContain("? { supplier: association.supplier, materialSourceSupplier:");
    expect(page).toContain("trip.materialSourceSupplier || '-'");
    expect(suggestions).toContain("materialSourceSuppliers: string[]");
    expect(suggestions).toContain("body.materialSourceSuppliers");
  });

  it("sends all visible filters and an explicit assignment in the bulk payload", () => {
    expect(page).toContain('"/api/site-material-trips/material-source/bulk"');
    for (const field of [
      "dateFrom: dateFromFilter",
      "dateTo: dateToFilter",
      "site: siteFilter",
      "material: materialFilter",
      "vehicleNumber: vehicleFilter",
      "supplier: supplierFilter",
      "onlyUnassigned",
      "materialSourceSupplier: bulkMaterialSourceSupplier.trim()",
    ]) {
      expect(page).toContain(field);
    }
    expect(page).toContain("Assign material source to {filteredTrips.length}");
    expect(page).toContain("The existing transporter values will remain untouched.");
  });

  it("gates bulk edits with site-material edit permission", () => {
    expect(page).toContain('sectionCan("site_materials", "edit")');
    expect(page).toContain("{canEdit && (");
    expect(page).toContain('data-testid="bulk-material-source-panel"');
  });
});