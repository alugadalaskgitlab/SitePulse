import { describe, expect, it } from "vitest";
import {
  matchUniqueHiredEquipment,
  siteMaterialTripSourceTransportFingerprint,
  sourceTransportBillDecision,
  sourceTransportRoleChanged,
} from "../shared/siteMaterialTripSourceTransport";

const trip = {
  id: 42,
  date: "2026-08-30",
  site: "TAKKADPALLY-SIRUR",
  material: "Soil",
  supplier: "NARSIMHULU",
  supplierVendorId: 7,
  materialSourceSupplier: null,
  materialSourceType: null,
  materialSourceLabel: null,
  materialSourceVendorId: null,
  vehicleNumber: "4470",
  transportType: null,
  internalEquipmentId: null,
  quantity: 600,
  uom: "CFT",
  receiptNumber: "15",
  isCancelled: false,
  isDeleted: false,
} as const;

describe("source/transport bulk preview helpers", () => {
  it("proposes only a unique hired vehicle belonging to the trip transporter", () => {
    const candidates = [
      { id: 1, registrationNumber: "TS15UF4470", vendorId: 7, ownership: "hired", isActive: true },
      { id: 2, registrationNumber: "TS15UA4470", vendorId: 8, ownership: "hired", isActive: true },
      { id: 3, registrationNumber: "TS15UF9999", vendorId: 7, ownership: "owned", isActive: true },
    ];
    expect(matchUniqueHiredEquipment("4470", 7, candidates)).toEqual({
      match: candidates[0],
      reason: "last_four",
    });
    expect(matchUniqueHiredEquipment("TS15UF4470", 7, candidates)).toEqual({
      match: candidates[0],
      reason: "exact",
    });
  });

  it("treats a numeric last-four suffix with trailing text as the same short vehicle number", () => {
    const candidates = [
      { id: 11, registrationNumber: "TS15UF4983", vendorId: 7, ownership: "hired", isActive: true },
    ];
    expect(matchUniqueHiredEquipment("4983) L", 7, candidates)).toEqual({
      match: candidates[0],
      reason: "last_four",
    });
  });

  it("does not propose ambiguous suffixes, inactive vehicles, or another transporter’s vehicle", () => {
    const candidates = [
      { id: 1, registrationNumber: "TS15UF4470", vendorId: 7, ownership: "hired", isActive: true },
      { id: 2, registrationNumber: "TS15UA4470", vendorId: 7, ownership: "hired", isActive: true },
      { id: 3, registrationNumber: "TS15UF4470", vendorId: 9, ownership: "hired", isActive: true },
      { id: 4, registrationNumber: "TS15UF4470", vendorId: 7, ownership: "hired", isActive: false },
    ];
    expect(matchUniqueHiredEquipment("4470", 7, candidates)).toEqual({
      match: null,
      reason: "ambiguous",
    });
    expect(matchUniqueHiredEquipment("4471", 7, candidates)).toEqual({
      match: null,
      reason: "no_match",
    });
    expect(matchUniqueHiredEquipment("4470", null, candidates)).toEqual({
      match: null,
      reason: "missing",
    });
  });

  it("fingerprints material and trip facts as well as role fields for stale-preview checks", () => {
    const original = siteMaterialTripSourceTransportFingerprint(trip);
    expect(siteMaterialTripSourceTransportFingerprint({ ...trip })).toBe(original);
    expect(siteMaterialTripSourceTransportFingerprint({ ...trip, quantity: 601 })).not.toBe(original);
    expect(siteMaterialTripSourceTransportFingerprint({ ...trip, materialSourceLabel: "Pit A" })).not.toBe(original);
    expect(sourceTransportRoleChanged(trip, { ...trip, transportType: "agency_vendor" })).toBe(true);
    expect(sourceTransportRoleChanged(trip, { ...trip })).toBe(false);
  });

  it("excludes approved and paid bills but retains draft/verified rows as warnings", () => {
    const bills = [
      { billNo: "DRAFT-1", status: "draft" },
      { billNo: "VERIFIED-2", status: "verified" },
      { billNo: "PAID-3", status: "paid" },
      { billNo: "VOID-4", status: "cancelled" },
    ];
    expect(sourceTransportBillDecision(bills)).toEqual({
      lockedBill: { billNo: "PAID-3", status: "paid" },
      warningBills: [
        { billNo: "VERIFIED-2", status: "verified" },
        { billNo: "DRAFT-1", status: "draft" },
      ],
    });
  });
});
