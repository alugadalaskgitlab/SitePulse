import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { insertSiteMaterialTripSchema } from "../shared/schema";

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const schemaSrc = read("shared/schema.ts");
const storageSrc = read("server/storage.ts");
const routeSrc = read("server/routes.ts");
const formSrc = read("client/src/pages/SiteMaterialTrips.tsx");
const panelSrc = read("client/src/components/DprDayTripsPanel.tsx");
const migrationSrc = read("migrations/0019_site_material_trips_transport_type.sql");

describe("DPR-01 Parts 8/9 site material transport", () => {
  it("keeps pre-transport trip payloads valid and accepts nullable new fields", () => {
    const legacy = insertSiteMaterialTripSchema.parse({
      date: "2026-08-17", site: "NH-44", material: "GSB", quantity: 30, uom: "MT",
    });
    expect(legacy.transportType ?? null).toBeNull();
    expect(legacy.internalEquipmentId ?? null).toBeNull();

    const inHouse = insertSiteMaterialTripSchema.parse({
      date: "2026-08-17", site: "NH-44", material: "GSB", quantity: 30, uom: "MT",
      transportType: "in_house", internalEquipmentId: 42,
    });
    expect(inHouse.transportType).toBe("in_house");
    expect(inHouse.internalEquipmentId).toBe(42);
  });

  it("adds nullable transport columns through both migration and runtime guard", () => {
    expect(schemaSrc).toContain(`transportType: text("transport_type")`);
    expect(schemaSrc).toContain(`internalEquipmentId: integer("internal_equipment_id")`);
    expect(migrationSrc).toContain("ADD COLUMN IF NOT EXISTS transport_type text");
    expect(migrationSrc).toContain("ADD COLUMN IF NOT EXISTS internal_equipment_id integer");
    expect(storageSrc).toContain("ADD COLUMN IF NOT EXISTS transport_type text");
    expect(storageSrc).toContain("ADD COLUMN IF NOT EXISTS internal_equipment_id integer");
  });

  it("uses the existing equipment endpoint with picker and free-text fallback", () => {
    expect(formSrc).toContain('queryKey: ["/api/plant-module/equipment"]');
    expect(formSrc).toContain("select-trip-transport-type");
    expect(formSrc).toContain("select-trip-internal-equipment");
    expect(formSrc).toContain("No master record — use vehicle number");
    expect(formSrc).toContain("free text fallback");
    expect(formSrc).toContain("Vendor required");
    expect(routeSrc).toContain("transportType must be in_house or agency_vendor");
  });

  it("renders every already-fetched active trip without another endpoint", () => {
    expect(panelSrc).toContain("active.map((trip)");
    expect(panelSrc).toContain("Transport: {transportLabel}");
    expect(panelSrc).toContain("Supplier: {trip.supplier");
    expect(panelSrc).toContain("Receipt: {trip.receiptNumber");
    expect(panelSrc).toContain('fetch(`/api/site-material-trips?site=');
    expect(panelSrc).not.toContain('fetch("/api/');
  });
});