import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { selectTripEquipment } from "../client/src/components/trip-master-selection";

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const page = read("client/src/pages/SiteMaterialTrips.tsx");
const reviewTools = read("client/src/pages/SiteMaterialTripReviewTools.tsx");
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
    expect(reviewTools).toContain('"/api/site-material-trips/material-source/bulk"');
    for (const field of [
      "dateFrom: filters.dateFrom || undefined",
      "dateTo: filters.dateTo || undefined",
      "site: filters.site",
      "material: filters.material || undefined",
      "vehicleNumber: filters.vehicleNumber || undefined",
      "supplier: filters.supplier || undefined",
      "onlyUnassigned: filters.onlyUnassigned",
      "materialSourceSupplier: source.trim()",
    ]) {
      expect(reviewTools).toContain(field);
    }
    expect(reviewTools).toContain("The existing transporter names and vehicle identities will remain untouched.");
  });

  it("does not report a successful bulk assignment for zero or invalid update counts", () => {
    expect(reviewTools).toContain("Number.isSafeInteger(updatedCount)");
    expect(reviewTools).toContain('title: message.startsWith("No trips updated") ? "No trips updated"');
    expect(reviewTools).toContain("No trips updated. Check the filters and edit permission, then reload.");
    expect(reviewTools).toContain("The server returned an invalid updated-trip count. Refresh the preview before retrying.");
  });

  it("gates bulk edits with site-material edit permission", () => {
    expect(reviewTools).toContain('sectionCan("site_materials", "edit")');
    expect(reviewTools).toContain("Edit permission required");
    expect(page).toContain('href={`/site/material-trips/review/material-source?${buildReviewQuery()}`');
  });
  it("blocks bulk assignment while a client-only role subset is selected, including in the mutation", () => {
    expect(reviewTools).toContain('if (filters.roleFilter !== "all") throw new Error("Set the role filter to All before using material-source backfill.");');
    expect(reviewTools).toContain('disabled={preview.isPending || !filters.site || filters.roleFilter !== "all"');
  });

  it("opens a separate preview-and-confirm material-source backfill tool from review", () => {
    expect(page).toContain('href={`/site/material-trips/review/material-source?${buildReviewQuery()}`');
    expect(reviewTools).toContain("export function MaterialSourceBackfillPage()");
    expect(reviewTools).toContain("Preview matching trips");
    expect(reviewTools).toContain("Assign source to {previewRows.length} matching trip");
    expect(reviewTools).toContain("Assign ${previewRows?.length ?? 0} trips");
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
