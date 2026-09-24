import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { activityKind, proposeVendorMatch, publicVendor, registerVendorMasterRoutes, sameReviewIds, vendorMasterFields } from "../server/vendor-master";

const fixture = {
  id: 1, name: "SYNTHETIC Vendor", businessName: "SYNTHETIC Trading",
  gstNumber: "SYNTHETIC-GST", panNumber: "SYNTHETIC-PAN", address: "SYNTHETIC Address",
  bankAccountName: "SYNTHETIC Holder", bankAccountNumber: "SYNTHETIC-ACCOUNT",
  bankIfsc: "SYNTHETIC-IFSC", bankName: "SYNTHETIC Bank", contactPersonName: "SYNTHETIC Contact",
  contactPhone: "0000000000", contactEmail: "synthetic@example.invalid", isActive: true,
  createdAt: new Date(), updatedAt: new Date(),
};

describe("Vendor Master Part A — synthetic fixtures, no business records written", () => {
  it("A1 validates all structured vendor details and strips bank details from non-admin responses", () => {
    const { id, createdAt, updatedAt, ...input } = fixture;
    expect(vendorMasterFields.parse(input)).toMatchObject({ name: fixture.name, bankIfsc: fixture.bankIfsc, gstNumber: fixture.gstNumber });
    expect(publicVendor(fixture, false)).not.toHaveProperty("bankAccountNumber");
    expect(publicVendor(fixture, true)).toHaveProperty("bankAccountNumber", fixture.bankAccountNumber);
  });
  it("A3 rejects stale or duplicated review confirmation snapshots", () => {
    expect(sameReviewIds([3, 1, 2], [1, 2, 3])).toBe(true);
    expect(sameReviewIds([1, 2, 3], [1, 2])).toBe(false);
    expect(sameReviewIds([1, 2], [1, 1, 2])).toBe(false);
    expect(sameReviewIds([1, 2], [2, 3])).toBe(false);
  });
  it("A2 suggests existing master using alias hints and A4 leaves novel names for inline creation", () => {
    const master = [{ id: 8, name: "SYNTHETIC Vendor" }];
    const aliases = [{ alias: "SYNTHETIC Vendor Ltd", canonicalName: "SYNTHETIC Vendor" }];
    expect(proposeVendorMatch("SYNTHETIC Vendor Ltd", master, aliases))
      .toEqual({ hint: "SYNTHETIC Vendor", suggestionId: 8 });
    expect(proposeVendorMatch("SYNTHETIC New Supplier", master, aliases))
      .toEqual({ hint: null, suggestionId: null });
    expect(proposeVendorMatch("SYNTHETIC Vendor Ltd", [
      { id: 8, name: "SYNTHETIC Vendor" }, { id: 9, name: "synthetic vendor " },
    ], [{ alias: "SYNTHETIC Vendor Ltd", canonicalName: "SYNTHETIC Vendor" }]))
      .toEqual({ hint: "SYNTHETIC Vendor", suggestionId: null });
    expect(proposeVendorMatch("SYNTHETIC Vendor", [
      { id: 8, name: "SYNTHETIC Vendor" }, { id: 9, name: "synthetic vendor " },
    ], [])).toEqual({ hint: null, suggestionId: null });
  });
  it("A5 classifies site activity without name-based linking", () => {
    expect(activityKind("Equipment Hire", "manual")).toBe("equipment");
    expect(activityKind("Material", "material")).toBe("material");
    expect(activityKind("Tipper Trip", "transport")).toBe("transport");
    expect(activityKind("Labour", "labour")).toBe("labour");
  });
  it("API refuses unauthorized master views and review confirmations before database access", async () => {
    const app = express();
    app.use(express.json());
    registerVendorMasterRoutes(app, async () => []);
    expect((await request(app).get("/api/vendor-master")).status).toBe(401);
    expect((await request(app).get("/api/vendor-master/review")).status).toBe(401);
    expect((await request(app).post("/api/vendor-master/review/confirm").send({})).status).toBe(401);
    const scoped = express();
    scoped.use(express.json());
    scoped.use((req, _res, next) => {
      (req as any).authUser = { id: 4, isAdmin: false, isOwner: false };
      (req as any).authPermissions = { master_parties: { view: true } };
      next();
    });
    registerVendorMasterRoutes(scoped, async () => []);
    expect((await request(scoped).get("/api/vendor-master/review")).status).toBe(403);
    expect((await request(scoped).post("/api/vendor-master/review/confirm").send({})).status).toBe(403);
    expect((await request(scoped).post("/api/vendor-master").send(fixture)).status).toBe(403);
  });
});