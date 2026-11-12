export const COUNTED_DPR_STATUS = "submitted" as const;
export const COUNTED_DPR_FLAG = false as const;

export interface DprEligibilityState {
  dprStatus?: string | null;
  isDeleted?: boolean | null;
  isCancelled?: boolean | null;
  isSuperseded?: boolean | null;
}

export function isEligibleSubmittedDpr(dpr: DprEligibilityState): boolean {
  const flagIsFalseOrMissing = (value: boolean | null | undefined) => value == null || value === COUNTED_DPR_FLAG;
  return dpr.dprStatus === COUNTED_DPR_STATUS &&
    flagIsFalseOrMissing(dpr.isDeleted) &&
    flagIsFalseOrMissing(dpr.isCancelled) &&
    flagIsFalseOrMissing(dpr.isSuperseded);
}

export interface DprMaterialUseRow extends DprEligibilityState {
  boqItemId: number | null;
  quantity: number | null;
  isIncidental?: boolean | null;
  reworkNoNewMaterial?: boolean | null;
}

export interface DprMaterialUseTotal {
  quantity: number;
  incidentalQuantity: number;
}

export function aggregateSubmittedDprMaterialUse(
  rows: readonly DprMaterialUseRow[],
): Map<number, DprMaterialUseTotal> {
  const totals = new Map<number, DprMaterialUseTotal>();
  for (const row of rows) {
    if (!isEligibleSubmittedDpr(row) || row.reworkNoNewMaterial === true || row.boqItemId == null || row.quantity == null) continue;
    const itemId = Number(row.boqItemId);
    const quantity = Number(row.quantity);
    if (!Number.isSafeInteger(itemId) || itemId <= 0 || !Number.isFinite(quantity) || quantity < 0) continue;
    const total = totals.get(itemId) ?? { quantity: 0, incidentalQuantity: 0 };
    total.quantity += quantity;
    if (row.isIncidental === true) total.incidentalQuantity += quantity;
    totals.set(itemId, total);
  }
  return totals;
}
