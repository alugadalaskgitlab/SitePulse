/** Read-only DPR presentation. Runtime and fuel facts are supplied by existing
 * builders; this helper never derives or changes operational quantities. */
export const CONSUMPTION_FLAG_PCT = 10;

export type DprRowConsumptionInput = {
  runtime: number | null;
  efficiencyUnit: "L/hr" | "L/km" | null;
  dieselIssued: number | null;
  actualConsumed: number | null;
  dieselBalanceConfirmed: boolean | null;
  norm: number | null;
  savedNorm: number | null;
  canonical?: { state: string; rate?: number; unit?: "L/hr" | "L/km" };
  openingReading?: number | null;
  closingReading?: number | null;
  dieselSource?: string | null;
};

export type DprRowConsumption = {
  basis: "measured" | "issued" | "incomplete";
  value: number | null;
  displayUnit: "L/hr" | "km/L" | null;
  norm: number | null;
  deviationPct: number | null;
  flag: "ok" | "worse" | "better_check" | null;
  reason: string | null;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;

export function resolveDprRowConsumption(input: DprRowConsumptionInput): DprRowConsumption {
  const canonical = input.canonical;
  const useCanonical = canonical?.state === "available" && nonnegative(canonical.rate)
    && (canonical.unit === "L/hr" || canonical.unit === "L/km");
  const unit = useCanonical ? canonical.unit! : input.efficiencyUnit;
  const displayUnit = unit === "L/km" ? "km/L" : unit === "L/hr" ? "L/hr" : null;
  const rawNorm = positive(input.norm) ? input.norm : positive(input.savedNorm) ? input.savedNorm : null;
  const convertedNorm = rawNorm == null || displayUnit == null ? null : unit === "L/km" ? 1 / rawNorm : rawNorm;
  const norm = positive(convertedNorm) ? convertedNorm : null;
  const incomplete = (reason: string): DprRowConsumption => ({
    basis: "incomplete", value: null, displayUnit, norm, deviationPct: null, flag: null, reason,
  });

  let rate: number;
  let basis: "measured" | "issued";
  if (useCanonical) {
    rate = canonical.rate!;
    basis = "measured";
  } else {
    if (!positive(input.runtime)) {
      return incomplete(nonnegative(input.openingReading) && input.closingReading == null
        ? "closing reading missing" : "hours/km not available");
    }
    if (input.dieselBalanceConfirmed === true && nonnegative(input.actualConsumed)) {
      rate = input.actualConsumed / input.runtime;
      basis = "measured";
    } else if (positive(input.dieselIssued)) {
      rate = input.dieselIssued / input.runtime;
      basis = "issued";
    } else {
      return incomplete(input.dieselSource === "contractor" ? "diesel by vendor" : "no diesel recorded");
    }
  }
  if (displayUnit == null) return incomplete("usage unit not available");
  if (!nonnegative(rate)) return incomplete("consumption not available");
  if (unit === "L/km" && rate === 0) return incomplete("no diesel consumed");
  const value = unit === "L/km" ? 1 / rate : rate;
  if (!nonnegative(value)) return incomplete("consumption not available");
  const deviation = norm == null ? null : (unit === "L/km" ? norm - value : value - norm) / norm * 100;
  const deviationPct = finite(deviation) ? deviation : null;
  // Numerical tolerance keeps exact ±10% boundaries inclusive after reciprocal conversion.
  const flag = deviationPct == null ? null
    : Math.abs(deviationPct) <= CONSUMPTION_FLAG_PCT + 1e-9 ? "ok"
      : deviationPct > CONSUMPTION_FLAG_PCT ? "worse" : "better_check";
  return { basis, value, displayUnit, norm, deviationPct, flag, reason: null };
}