/** Historical daily-trip snapshots remain readable, never silently repriced
 * using the restored DPR-only daily evidence contract. */
export function hasFrozenTripDailyHire(bill: { hireStatements?: any[] }): boolean {
  return (bill.hireStatements || []).some(statement => {
    const snapshot = statement.calculationSnapshot || {};
    return (statement.billingBasis || snapshot.terms?.billingBasis) === "daily" &&
      (snapshot.sourceEvidence?.activities || []).some((row: any) =>
        row.source === "site_material_trip" && row.confirmedForDailyHire === true);
  });
}

export const FROZEN_TRIP_DAILY_MESSAGE =
  "This saved bill contains historical material-trip daily hire. Its amounts and evidence are preserved for viewing, payment and export; recalculation is unavailable in the restored DPR-based workflow.";
