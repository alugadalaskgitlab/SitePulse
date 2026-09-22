import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  associationView,
  normalizeVehicleSupplierKey,
} from "../shared/vehicleSupplierAssociation";

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");

describe("vehicle supplier association contract", () => {
  it("uses one normalized identity for spacing and hyphen variants", () => {
    expect(normalizeVehicleSupplierKey(" ka 01-ab - 1234 ")).toBe("KA01AB1234");
  });

  it("does not expose conflicting historical supplier names", () => {
    expect(associationView(undefined, ["ACME HAULAGE", "OTHER HAULAGE"])).toEqual({
      status: "conflict",
      supplier: null,
      version: null,
    });
  });

  it("lets an explicit mapping resolve future autofill despite conflicting old facts", () => {
    expect(associationView(
      { supplier: "ACME HAULAGE", version: "v1" },
      ["OLD HAULAGE", "OTHER HAULAGE"],
    )).toEqual({
      status: "linked",
      supplier: "ACME HAULAGE",
      version: "v1",
    });
  });
});

describe("vehicle supplier association persistence safeguards", () => {
  const storage = read("server/storage.ts");
  const routes = read("server/routes.ts");

  it("locks the normalized key before reading full active history and writing a trip", () => {
    const lock = storage.slice(
      storage.indexOf("private async lockVehicleSupplierAssociationKey"),
      storage.indexOf("private async readVehicleSupplierAssociationsTx"),
    );
    const create = storage.slice(
      storage.indexOf("async createSiteMaterialTrip"),
      storage.indexOf("private async checkSiteDeliveryCompletion"),
    );
    expect(lock).toContain("pg_advisory_xact_lock");
    const transactionAt = create.indexOf("db.transaction(async (tx)");
    const lockAt = create.indexOf("await this.lockVehicleSupplierAssociationKey");
    const historyAt = create.indexOf("getActiveVehicleSupplierHistoryTx");
    const insertAt = create.search(/\btx\.insert\(siteMaterialTrips\)\.values\(/);
    // The insert may be returned by a transactional reconciliation callback,
    // rather than awaited inline. Require the same tx and actual ordering,
    // and guard against missing markers falsely satisfying index comparisons.
    for (const offset of [transactionAt, lockAt, historyAt, insertAt]) {
      expect(offset).toBeGreaterThanOrEqual(0);
    }
    expect(transactionAt).toBeLessThan(lockAt);
    expect(lockAt).toBeLessThan(historyAt);
    expect(historyAt).toBeLessThan(insertAt);
    expect(create).toContain("historySupplierSet(history)");
  });

  it("aggregates complete active history without the recent suggestion limit", () => {
    const history = storage.slice(
      storage.indexOf("private async getActiveVehicleSupplierHistoryTx"),
      storage.indexOf("private async getActiveVehicleSupplierHistory("),
    );
    expect(history).toContain("eq(siteMaterialTrips.isCancelled, false)");
    expect(history).toContain("eq(siteMaterialTrips.isDeleted, false)");
    expect(history).not.toContain(".limit(");
  });

  it("uses a separate authenticated correction action with optimistic versioning", () => {
    const correction = routes.slice(
      routes.indexOf('app.patch("/api/site-material-trips/vehicle-supplier"'),
      routes.indexOf("// Get all site material trips", routes.indexOf('app.patch("/api/site-material-trips/vehicle-supplier"')),
    );
    const correctionStorage = storage.slice(
      storage.indexOf("async correctVehicleSupplierAssociation"),
      storage.indexOf("async createSiteMaterialTrip"),
    );
    expect(correction).toContain('assertEdit(req, res, "site_materials")');
    expect(correction).toContain("hasActiveSiteMaterialTripVehicle");
    expect(correction).toContain("expectedVersion");
    expect(correction).toContain("expectedSupplier");
    expect(correction).toContain("actor");
    expect(correctionStorage).toContain("oldValues");
    expect(correctionStorage).toContain("newValues");
    expect(correctionStorage).toContain("tx.insert(auditLogs)");
    expect(correction).toContain("status(409)");
  });
});
