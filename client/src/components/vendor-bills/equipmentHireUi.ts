/** Mirrors the authoritative period payload constructed by vendor-bill
 * storage from the Equipment Performance fleet row. */
export function authoritativeDieselPeriodFromFleet(fleet: any[] | undefined, equipmentId: number) {
  const performance = fleet?.find(row => Number(row.equipmentId) === Number(equipmentId));
  return performance ? {
    actualDiesel: performance.dieselConsumed,
    expectedDiesel: performance.expectedDiesel,
    difference: performance.difference,
    reliable: !performance.consumptionIncomplete && performance.dieselConsumed != null &&
      performance.expectedDiesel != null && performance.difference != null,
    dailyRows: performance.dailyRows || [],
  } : { actualDiesel: null, expectedDiesel: null, difference: null, reliable: false, dailyRows: [] };
}

/** Historic paid vendor bills predate amountPaid. Editing payment metadata
 * must retain their final bill amount instead of submitting an erroneous 0. */
export function initialVendorBillPaidAmount(bill: any): string {
  if (bill.amountPaid != null) return String(bill.amountPaid);
  if (bill.status === "paid" && bill.netPayableAmount == null) return String(bill.totalAmount ?? 0);
  return "";
}

/** A successful report with no fleet row is valid no-activity evidence. Its
 * unavailable authoritative period permits manual handling; only loading or
 * failed report data blocks a hire submission. */
export function isPerformanceReadyForHireSubmission(query: {
  isSuccess?: boolean;
  isFetching?: boolean;
  isError?: boolean;
}): boolean {
  return query.isSuccess === true && query.isFetching !== true && query.isError !== true;
}

/** Same predicate used by hire reconciliation for delivery/operational trip
 * counterpart review. Excluded or non-trip operational records are not a
 * counterpart and must not demand a separate-trip declaration. */
export function hasIncludedOperationalTripOnSameDay(
  activities: readonly any[],
  tripDecisions: readonly any[],
  delivery: any,
): boolean {
  return activities.some(activity => {
    if ((activity.source !== "dpr_log" && activity.source !== "plant_usage") ||
        activity.equipmentId !== delivery.equipmentId ||
        activity.businessDate !== delivery.businessDate ||
        activity.entryType !== "trip_based") return false;
    const decision = tripDecisions.find(item => item.source === activity.source && item.sourceId === activity.sourceId);
    return decision?.selected !== false;
  });
}