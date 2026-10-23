import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { selectTripEquipment } from "../client/src/components/trip-master-selection";

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const page = read("client/src/pages/SiteMaterialTrips.tsx");
const roleFields = read("client/src/components/TripTransportRoleFields.tsx");
const editPage = read("client/src/pages/SiteMaterialsReceived.tsx");
const historyDialog = read("client/src/components/HistoryDialog.tsx");
const suggestions = read("client/src/hooks/use-site-material-suggestions.ts");
const receivedEditor = read("client/src/components/ReceivedTripEditor.tsx");
const editDialog = read("client/src/components/TripRoleEditDialog.tsx");

describe("VB-22 site material trip source supplier UI", () => {
  it("keeps the source supplier independent from vehicle/transporter autofill", () => {
    expect(roleFields).toContain('testId={`input-${testIdPrefix}-material-source-supplier`}');
    expect(roleFields).toContain("materialSourceSupplier: name,");
    expect(page).toContain("<TripTransportRoleFields");
    expect(roleFields).toContain("<TripMasterVehicleField");
    expect(page).toContain("trip.materialSourceSupplier?.trim() || '-'");
    expect(suggestions).toContain("materialSourceSuppliers: string[]");
    expect(suggestions).toContain("body.materialSourceSuppliers");
  });

  it("autofills a reviewed transporter without overwriting or mutating the material source", () => {
    const draft = {
      materialSourceSupplier: "QUARRY", materialSourceVendorId: 10,
      supplier: "", supplierVendorId: null, vehicleNumber: "", internalEquipmentId: null,
    };
    const selected = selectTripEquipment(draft,
      { id: 47, ownership: "hired", registrationNumber: "TEST-47", name: "TIPPER" } as any,
      { vendorId: 20, linkedVendorName: "HAULAGE" } as any,
      [{ id: 20, name: "HAULAGE", isActive: true }] as any);
    expect(selected).toMatchObject({
      materialSourceSupplier: "QUARRY", materialSourceVendorId: 10,
      supplier: "HAULAGE", supplierVendorId: 20, equipmentId: 47,
    });
    expect(draft.supplier).toBe("");
    expect(draft.materialSourceSupplier).toBe("QUARRY");
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
    expect(page).toContain("Assign material source to {bulkEligibleCount}");
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
    expect(page).toContain("{canEdit && hasUnassignedFilteredTrips && (");
    expect(page).toContain('data-testid="bulk-material-source-panel"');
  });
  it("blocks bulk assignment while a client-only role subset is selected, including in the mutation", () => {
    expect(page).toContain('if (roleFilter !== "all") {');
    expect(page).toContain('disabled={roleFilter !== "all" || !bulkMaterialSourceSupplier.trim()');
    expect(page).toContain('disabled={bulkAssignMutation.isPending || roleFilter !== "all"}');
    expect(page).toContain("Role-filtered subsets cannot be bulk assigned.");
  });

  it("hides a cleared backlog, treats whitespace as blank, and collapses a real backlog by default", () => {
    expect(page).toContain("const hasUnassignedFilteredTrips = filteredTrips.some(");
    expect(page).toContain("!trip.materialSourceSupplier?.trim()");
    expect(page).toContain("<details");
    expect(page).toContain("Show material-source backfill tool");
    expect(page).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
  });

  it("loads the full saved trip and keeps its independent source in the shared single-trip editor", () => {
    expect(editPage).toContain("<ReceivedTripEditor");
    expect(receivedEditor).toContain("const trip = trips.data?.find(item => item.id === receipt.id)");
    expect(receivedEditor).toContain("<TripRoleEditDialog");
    expect(editDialog).toContain("materialSourceSupplier: trip.materialSourceSupplier ||");
    expect(editDialog).toContain("party(draft.materialSourceSupplier, draft.materialSourceVendorId");
    expect(editDialog).toContain("<TripTransportRoleFields");
    expect(editDialog).not.toContain("materialSourceSupplier: association.supplier");
  });

  it("exits edit mode only after a successful received-trip update", () => {
    const successStart = editDialog.indexOf("onSuccess:");
    const errorStart = editDialog.indexOf("onError:", successStart);
    expect(successStart).toBeGreaterThan(-1);
    expect(errorStart).toBeGreaterThan(successStart);
    const successHandler = editDialog.slice(successStart, errorStart);
    const errorHandler = editDialog.slice(errorStart, editDialog.indexOf("return <Dialog", errorStart));
    expect(successHandler).toContain("onSaved?.(updated)");
    expect(successHandler).toContain("onClose()");
    expect(successHandler).toContain("queryClient.invalidateQueries");
    expect(errorHandler).toContain("setError(");
    expect(errorHandler).not.toContain("onClose()");
    expect(editDialog).toContain("onClick={onClose}");
  });

  it("shows a friendly old/new material source label in per-trip history", () => {
    expect(historyDialog).toContain('valueFromAudit(entry.oldValues, "materialSourceSupplier")');
    expect(historyDialog).toContain('valueFromAudit(entry.newValues, "materialSourceSupplier")');
    expect(historyDialog).toContain("Material Source / Supplier");
    expect(historyDialog).toContain("Old:");
    expect(historyDialog).toContain("New:");
  });
});
