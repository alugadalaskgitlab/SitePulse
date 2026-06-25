// Free conversion between CFT / CUM / MT for bulk solids (aggregates, GSB, WMM …).
// Mass<->volume conversions need the material's bulkDensity (MT per m³).
export const CFT_PER_CUM = 35.3147;

export type UomKind = "CFT" | "CUM" | "MT" | "LITERS" | "NOS" | "OTHER";

export function normalizeUom(uom?: string | null): UomKind {
  if (!uom) return "OTHER";
  const u = uom.trim().toUpperCase();
  if (["CFT", "CU FT", "CUFT", "CU.FT"].includes(u)) return "CFT";
  if (["CUM", "CU.M", "CU M", "M3", "M³", "CBM", "CUM."].includes(u)) return "CUM";
  if (["MT", "TON", "TONNE", "TONNES", "T", "MTON"].includes(u)) return "MT";
  if (["LITERS", "LITRES", "LITER", "LITRE", "LTR", "LT", "L", "LIT"].includes(u)) return "LITERS";
  if (["NOS", "NO", "NOS.", "NO.", "EACH", "EA"].includes(u)) return "NOS";
  return "OTHER";
}

/**
 * Convert `qty` between CFT / CUM / MT for a solid with `bulkDensity` (MT per m³).
 * Returns null when conversion is impossible:
 *   - either unit is not a recognised solid unit (CFT/CUM/MT), or
 *   - a mass<->volume conversion is requested but bulkDensity is missing/<=0.
 */
export function convertSolidQty(
  qty: number,
  fromUom: string | null | undefined,
  toUom: string | null | undefined,
  bulkDensity?: number | null,
): number | null {
  const f = normalizeUom(fromUom);
  const t = normalizeUom(toUom);
  if (f === t) return qty;

  const SOLID: UomKind[] = ["CFT", "CUM", "MT"];
  if (!SOLID.includes(f) || !SOLID.includes(t)) return null;

  const d = bulkDensity && bulkDensity > 0 ? bulkDensity : null;

  // Step 1: source -> CUM (volume canonical)
  let cum: number | null;
  if (f === "CUM") cum = qty;
  else if (f === "CFT") cum = qty / CFT_PER_CUM;
  else cum = d != null ? qty / d : null; // MT -> CUM needs density
  if (cum == null) return null;

  // Step 2: CUM -> target
  if (t === "CUM") return cum;
  if (t === "CFT") return cum * CFT_PER_CUM;
  return d != null ? cum * d : null; // CUM -> MT needs density
}

/** Convenience: convert into MT (base unit for solids). null if not possible. */
export function toMT(qty: number, fromUom: string | null | undefined, bulkDensity?: number | null): number | null {
  return convertSolidQty(qty, fromUom, "MT", bulkDensity);
}
