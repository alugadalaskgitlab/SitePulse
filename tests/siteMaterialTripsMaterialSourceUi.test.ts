import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const page = read("client/src/pages/SiteMaterialTrips.tsx");
const editPage = read("client/src/pages/SiteMaterialsReceived.tsx");
const historyDialog = read("client/src/components/HistoryDialog.tsx");
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

  it("does not report a successful bulk assignment for zero or invalid update counts", () => {
    expect(page).toContain("Number.isSafeInteger(updatedCount)");
    expect(page).toContain('title: "No trips updated"');
    expect(page).toContain("Check the filters and edit permission, then reload");
    expect(page).toContain("The server returned an invalid updated-trip count");
  });

  it("gates bulk edits with site-material edit permission", () => {
    expect(page).toContain('sectionCan("site_materials", "edit")');
    expect(page).toContain("{canEdit && (");
    expect(page).toContain('data-testid="bulk-material-source-panel"');
  });

  it("supports an optional independent material source in the existing single-trip edit flow", () => {
    expect(editPage).toContain("materialSourceSupplier: trip.materialSourceSupplier ||");
    expect(editPage).toContain('data-testid="input-edit-material-source-supplier"');
    expect(editPage).toContain("suggestions={materialSourceSupplierSuggestions}");
    expect(editPage).toContain("materialSourceSupplier: editForm.materialSourceSupplier.trim() || null");
    expect(editPage).toContain("independent from the transporter and vehicle");
    expect(editPage).not.toContain("materialSourceSupplier: association.supplier");
  });

  it("shows a friendly old/new material source label in per-trip history", () => {
    expect(historyDialog).toContain('valueFromAudit(entry.oldValues, "materialSourceSupplier")');
    expect(historyDialog).toContain('valueFromAudit(entry.newValues, "materialSourceSupplier")');
    expect(historyDialog).toContain("Material Source / Supplier");
    expect(historyDialog).toContain("Old:");
    expect(historyDialog).toContain("New:");
  });
});
