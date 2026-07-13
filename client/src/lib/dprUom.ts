// Auto-derive DPR Unit-of-Measure + quantity purely from the dimensions entered.
//   L only            -> RMT  (running metre)        qty = L
//   L + W             -> SQM  (square metre)         qty = L × W
//   L + W + T         -> CUM  (cubic metre)          qty = L × W × T
//   none              -> null (keep manual: MT / NOS / lump-sum)
export function deriveDprUom(
  length?: number | null,
  width?: number | null,
  thickness?: number | null,
): string | null {
  const L = !!length && length > 0;
  const W = !!width && width > 0;
  const T = !!thickness && thickness > 0;
  if (L && W && T) return "CUM";
  if (L && W) return "SQM";
  if (L) return "RMT";
  return null;
}

// Quantity implied by the dimensions (UoM auto-derived). null when not derivable.
export function computeDprQty(
  length?: number | null,
  width?: number | null,
  thickness?: number | null,
): number | null {
  const uom = deriveDprUom(length, width, thickness);
  if (uom === "CUM") return (length as number) * (width as number) * (thickness as number);
  if (uom === "SQM") return (length as number) * (width as number);
  if (uom === "RMT") return length as number;
  return null;
}

// Map a BOQ item's unit string to the canonical DPR UOM + which dimensions it needs.
//   volume (CUM/m³)  -> L,W,T   area (SQM/Ha) -> L,W   length (RMT/m) -> L
//   count/weight/lumpsum (Nos/MT/kg/LS/%) -> [] (manual qty)
export type BoqUomProfile = { dimClass: "volume" | "area" | "length" | "count"; uom: string; dims: ("L" | "W" | "T")[] };
export function boqUomProfile(unit?: string | null): BoqUomProfile {
  const u = (unit || "").toLowerCase().replace(/[\s().]/g, "");
  if (/^(cum|cmt|m3|brass)$/.test(u) || /cubic|cum|m3|m³/.test(u)) return { dimClass: "volume", uom: "CUM", dims: ["L", "W", "T"] };
  if (/^(sqm|sm|m2|ha|hect|hectare|acre|are)$/.test(u) || /sqm|sq\.?m|squarem|m2|m²|hectare|^ha$/.test(u)) return { dimClass: "area", uom: "SQM", dims: ["L", "W"] };
  if (/^(rmt|rm|rmtr|m|mtr|meter|metre|km|lm)$/.test(u) || /^r\.?m\.?t?$|runningm|rmeter|rmetre|^lm$|^km$/.test(u)) return { dimClass: "length", uom: "RMT", dims: ["L"] };
  return { dimClass: "count", uom: (unit || "NOS").toUpperCase().replace(/\.$/, ""), dims: [] };
}

/**
 * Resolve the effective DPR UOM profile for a BOQ item, respecting the explicit
 * `dprMeasurementMethod` setting before falling back to the unit-derived profile.
 *
 * dprMeasurementMethod values:
 *   "CUM_LWT"   → volume  (L × W × T)
 *   "SQM_LW"    → area    (L × W)
 *   "RMT_L"     → length  (L only)
 *   "MT_manual" → count (manual MT)
 *   "NOS_manual"→ count (manual NOS)
 *   "LS_manual" → count (manual LS)
 *   null/undefined → derive from unit string
 */
export function resolveBoqUomProfile(
  item: { unit?: string | null; dprMeasurementMethod?: string | null } | null | undefined
): BoqUomProfile {
  if (!item) return { dimClass: "count", uom: "NOS", dims: [] };
  const m = item.dprMeasurementMethod;
  if (m === "CUM_LWT")   return { dimClass: "volume", uom: "CUM", dims: ["L", "W", "T"] };
  if (m === "SQM_LW")    return { dimClass: "area",   uom: "SQM", dims: ["L", "W"] };
  if (m === "RMT_L")     return { dimClass: "length",  uom: "RMT", dims: ["L"] };
  if (m === "MT_manual")  return { dimClass: "count",  uom: "MT",  dims: [] };
  if (m === "NOS_manual") return { dimClass: "count",  uom: "NOS", dims: [] };
  if (m === "LS_manual")  return { dimClass: "count",  uom: "LS",  dims: [] };
  return boqUomProfile(item.unit);
}
