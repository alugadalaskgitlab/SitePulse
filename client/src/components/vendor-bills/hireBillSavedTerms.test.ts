import { describe, expect, it } from "vitest";
import { buildSavedEquipmentHireBillOutput } from "./EquipmentHireBillOutput";

describe("saved hire terms in existing vendor-facing output (synthetic fixtures)", () => {
  const statement = {
    id: 74, equipmentId: 23, equipmentName: "TN 47 BG 2641",
    periodFrom: "2026-06-02", periodTo: "2026-06-12",
    billingBasis: "daily", rate: 5000, quantity: 8.5, grossAmount: 42500, netAmount: 42500,
    calculationSnapshot: {
      terms: { billingBasis: "daily", rate: 5000, hireStartDate: "2026-06-02", hireEndDate: "2026-06-12", dieselResponsibility: "vendor" },
      quantity: 8.5, grossAmount: 42500, netAmount: 42500, deductionAmount: 0,
      dailyDecisions: [{ date: "2026-06-04", decision: "half_day", reason: "Half-day assignment" }],
      sourceEvidence: { activities: [], maintenance: [] },
    },
  };
  it.each(["draft", "verified", "approved", "paid"])("retains original %s bill basis, rate, period and financials", status => {
    const bill = { billNo: "VB-2026-074", vendorName: "Kaveri Earthworks", status,
      periodFrom: "2026-06-01", periodTo: "2026-06-30", totalAmount: 42500, netPayableAmount: 42500,
      hireStatements: [statement],
      equipment: { hireBillingBasis: "trip", hireRate: 1140, hireStartDate: "2027-01-01" } };
    const before = JSON.stringify(bill);
    const output = buildSavedEquipmentHireBillOutput(bill);
    expect(output?.data).toMatchObject({ hireBasis: "DAILY", rate: 5000, grossHire: 42500,
      periodFrom: "2026-06-02", periodTo: "2026-06-12", netPayable: 42500 });
    expect(JSON.stringify(bill)).toBe(before);
  });
  it("falls back to frozen snapshot terms for legacy statement fields, never live defaults", () => {
    const bill = {
      billNo: "VB-2026-074", vendorName: "Kaveri Earthworks", status: "approved",
      hireStatements: [{ ...statement, billingBasis: null, rate: null }],
    };
    expect(buildSavedEquipmentHireBillOutput(bill)?.data).toMatchObject({ hireBasis: "DAILY", rate: 5000 });
  });
});
