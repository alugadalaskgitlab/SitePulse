/**
 * Validation shared by the site DPR and plant equipment entry forms.
 *
 * A tank reading is an observation, not a derived value.  In particular,
 * zero is a valid observation (an empty tank), while an empty string, null,
 * NaN, Infinity, and negative values are not readings.
 */
export interface DieselTankBalanceValidationInput {
  diesel?: unknown;
  dieselSource?: unknown;
  openingDiesel?: unknown;
  dieselBalanceInTank?: unknown;
}

export interface DieselSourceTransitionRow {
  dieselSource?: string | null;
  openingDiesel?: number | null;
  dieselBalanceInTank?: number | null;
  dieselBalanceConfirmed?: boolean | null;
}

const finiteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const validTankReading = (value: unknown): boolean => {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0;
};

/**
 * HLC/plant-stock fuel must have both physical tank observations when a
 * positive quantity is recorded.  Other source types are deliberately not
 * validated here: direct-purchase and contractor rows have different
 * evidence rules, and a zero/blank diesel default must not force tank fields.
 */
export function validateDieselTankBalance(
  input: DieselTankBalanceValidationInput,
  equipmentLabel = "Equipment",
): string | null {
  const diesel = finiteNumber(input.diesel);
  if (input.dieselSource !== "plant_stock" || diesel === null || diesel <= 0) {
    return null;
  }

  const label = equipmentLabel.trim() || "Equipment";
  if (!validTankReading(input.openingDiesel)) {
    return `${label}: Opening Diesel Tank (L) is required and must be a non-negative finite number.`;
  }
  if (!validTankReading(input.dieselBalanceInTank)) {
    return `${label}: Diesel Balance in Tank (L) is required and must be a non-negative finite number.`;
  }
  return null;
}

/**
 * Apply an explicit source-selection change without disturbing historical
 * values when a row is merely hydrated with an existing source. A newly
 * selected non-plant source cannot retain plant-stock observations: otherwise
 * a hidden tank balance could later be mistaken for continuity data.
 */
export function transitionDieselSource<T extends DieselSourceTransitionRow>(
  row: T,
  nextSource: string,
): T {
  if (row.dieselSource === nextSource || nextSource === "plant_stock") {
    return { ...row, dieselSource: nextSource };
  }
  return {
    ...row,
    dieselSource: nextSource,
    openingDiesel: null,
    dieselBalanceInTank: null,
    dieselBalanceConfirmed: false,
  };
}