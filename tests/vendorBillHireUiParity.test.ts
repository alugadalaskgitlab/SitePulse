import { describe, expect, it } from "vitest";
import { authoritativeDieselPeriodFromFleet, hasIncludedOperationalTripOnSameDay, initialVendorBillPaidAmount, isPerformanceReadyForHireSubmission } from "../client/src/components/vendor-bills/equipmentHireUi";

describe("Vendor Bill Equipment Hire UI parity", () => {
  it("constructs the same authoritative diesel period payload as storage from the performance fleet row", () => {
    const dailyRows = [{ date: "2026-04-01", dieselConsumed: 12 }];
    expect(authoritativeDieselPeriodFromFleet([{
      equipmentId: 17, dieselConsumed: 120, expectedDiesel: 100, difference: 20,
      consumptionIncomplete: false, dailyRows,
    }], 17)).toEqual({
      actualDiesel: 120, expectedDiesel: 100, difference: 20, reliable: true, dailyRows,
    });
    expect(authoritativeDieselPeriodFromFleet([{
      equipmentId: 17, dieselConsumed: 120, expectedDiesel: 100, difference: 20,
      consumptionIncomplete: true, dailyRows,
    }], 17)).toMatchObject({ reliable: false });
    expect(authoritativeDieselPeriodFromFleet([], 17)).toMatchObject({
      actualDiesel: null, expectedDiesel: null, difference: null, reliable: false, dailyRows: [],
    });
  });

  it("preserves the full paid amount when editing a legacy paid bill with no amountPaid", () => {
    expect(initialVendorBillPaidAmount({ status: "paid", totalAmount: 7850, netPayableAmount: null, amountPaid: null })).toBe("7850");
    expect(initialVendorBillPaidAmount({ status: "paid", totalAmount: 7850, netPayableAmount: 7000, amountPaid: 0 })).toBe("0");
    expect(initialVendorBillPaidAmount({ status: "approved", totalAmount: 7850, amountPaid: null })).toBe("");
  });

  it("allows a successful no-activity performance report while blocking loading or failed reports", () => {
    // An empty fleet is authoritative no-activity evidence. It must lead to
    // manual HSD handling, not prevent a legitimate monthly hire bill.
    expect(isPerformanceReadyForHireSubmission({ isSuccess: true, isFetching: false, isError: false })).toBe(true);
    expect(isPerformanceReadyForHireSubmission({ isSuccess: false, isFetching: true, isError: false })).toBe(false);
    expect(isPerformanceReadyForHireSubmission({ isSuccess: false, isFetching: false, isError: true })).toBe(false);
  });

  it("only requires separate-trip confirmation for an included same-equipment, same-day operational trip", () => {
    const delivery = { source: "site_material_trip", sourceId: 30, equipmentId: 9, businessDate: "2026-05-06", entryType: "trip_based" };
    const operational = { source: "dpr_log", sourceId: 31, equipmentId: 9, businessDate: "2026-05-06", entryType: "trip_based" };
    expect(hasIncludedOperationalTripOnSameDay([delivery, operational], [], delivery)).toBe(true);
    expect(hasIncludedOperationalTripOnSameDay([delivery, operational], [{ source: "dpr_log", sourceId: 31, selected: false }], delivery)).toBe(false);
    expect(hasIncludedOperationalTripOnSameDay([delivery, { ...operational, entryType: "hour_based" }], [], delivery)).toBe(false);
    expect(hasIncludedOperationalTripOnSameDay([delivery, { ...operational, equipmentId: 10 }], [], delivery)).toBe(false);
  });
});