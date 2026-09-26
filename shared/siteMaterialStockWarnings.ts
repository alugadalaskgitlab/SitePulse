import { normalizeUom } from "./uomConvert";

export type DensitySkipSource = "ordered" | "delivered" | "consumed";
export type DensitySkips = Record<DensitySkipSource, { count: number; quantities: Record<string, number> }>;

export function emptyDensitySkips(): DensitySkips {
  return {
    ordered: { count: 0, quantities: {} },
    delivered: { count: 0, quantities: {} },
    consumed: { count: 0, quantities: {} },
  };
}

/** Only volume → MT failures are density failures; unsupported units are not. */
export function needsStockDensity(uom: string | null | undefined, density: number | null): boolean {
  const unit = normalizeUom(uom);
  return (unit === "CFT" || unit === "CUM") && !(density != null && density > 0);
}

export function recordDensitySkip(skips: DensitySkips, source: DensitySkipSource, qty: number, uom: string | null | undefined) {
  const unit = normalizeUom(uom);
  skips[source].count++;
  skips[source].quantities[unit] = (skips[source].quantities[unit] ?? 0) + qty;
}