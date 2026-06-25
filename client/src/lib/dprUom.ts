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
