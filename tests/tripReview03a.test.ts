import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { normalizeVehicleSupplierName, normalizeVehicleSupplierVehicle } from "@shared/vehicleSupplierAssociation";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("TRIAL-03A refresh and trip review behavior", () => {
  it("registers updates without the browser HTTP cache and fetches fresh navigation HTML", () => {
    const main = read("client/src/main.tsx");
    const worker = read("client/public/service-worker.js");
    const routes = read("server/routes.ts");
    const recovery = read("client/src/components/AppRecovery.tsx");
    expect(main).toContain('updateViaCache: "none"');
    expect(worker).toContain("fetch(new Request(request, { cache: 'no-store' }))");
    expect(worker).toContain("caches.keys()");
    expect(routes.indexOf('app.get("/api/version"')).toBeLessThan(routes.indexOf('app.use("/api",'));
    expect(recovery).toContain('fetch("/api/version", { cache: "no-store", credentials: "include" })');
    expect(recovery).toContain('window.addEventListener("focus", onWindowFocus)');
    expect(recovery).toContain("10 * 60 * 1000");
    expect(recovery).toContain("sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY)");
  });

  it("normalizes spaces and case for tool filter suggestions", () => {
    expect(normalizeVehicleSupplierName("  soil   ")).toBe(normalizeVehicleSupplierName("SOIL"));
    expect(normalizeVehicleSupplierVehicle("TG 12 UH 4799")).toBe(normalizeVehicleSupplierVehicle("TG12UH4799"));
    const page = read("client/src/pages/SiteMaterialTripReviewTools.tsx");
    expect(page).toContain("SearchableFilter");
    expect(page).toContain('queryKey: ["/api/vendor-aliases"]');
    expect(page).toContain("new URLSearchParams(search)");
    expect(page).toContain("if (draft.roleFilter === \"all\") params.delete(\"role\")");
    expect(page).toContain('if (draft.roleFilter === "unresolved") params.set("hireRole", "unresolved")');
    const storage = read("server/storage.ts");
    expect(storage).toContain("REGEXP_REPLACE(TRIM(${siteMaterialTrips.material})");
    expect(storage).toContain("supplierMatch.variants.map(normalizeVehicleSupplierName)");
  });

  it("filters the trip vehicle list by the selected transporter's confirmed vehicles", () => {
    const component = read("client/src/components/TripMasterVehicleField.tsx");
    const fields = read("client/src/components/TripTransportRoleFields.tsx");
    expect(component).toContain("item.vendorId === transporterId");
    expect(fields).toContain("equipmentId: null, internalEquipmentId: null");
    expect(component).toContain("Other / not in master");
  });
});
