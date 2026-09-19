import { resolveDprUnitConversion } from "@shared/dprGeometry";

/** Validate persisted item conversion metadata without requiring a DPR row. */
export function boqConversionConfigError(
  existing: Record<string, any>,
  update: Record<string, any>,
): string | null {
  const merged: any = { ...existing, ...update };
  if (merged.dprConversionFactor != null) {
    const factor = Number(merged.dprConversionFactor);
    if (!Number.isFinite(factor) || factor <= 0) {
      return "DPR conversion factor must be a finite number greater than zero.";
    }
    merged.dprConversionFactor = factor;
  }
  const resolution = resolveDprUnitConversion(null, merged);
  if (resolution.mode === "custom" && resolution.factor != null && Math.abs(resolution.factor - 1) <= 1e-12) {
    return `A custom ${resolution.sourceUom}→${resolution.targetUom} conversion requires an explicit non-identity factor.`;
  }
  return !resolution.valid || resolution.factor == null || resolution.warnings.length > 0
    ? resolution.warnings[0] ?? "The DPR conversion factor is incompatible with the physical and contractual UOMs."
    : null;
}