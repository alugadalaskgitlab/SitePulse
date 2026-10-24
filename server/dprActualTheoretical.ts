import { addDays, daysBetween, monthIndexToDateCal, toYmd } from "../shared/calendarAxis";

function ymdKey(value: { y: number; m: number; d: number }): string {
  return `${String(value.y).padStart(4, "0")}-${String(value.m).padStart(2, "0")}-${String(value.d).padStart(2, "0")}`;
}

/**
 * The planning engine returns hours in 1-based programme-month buckets.
 * Allocate a selected date range within each bucket by the same fractional
 * calendar-month axis; never manufacture a daily schedule outside that model.
 */
export function plannedHoursInDateRange(
  monthlyHours: Record<number, number>,
  from: string,
  to: string,
  projectStartDate: string | null | undefined,
): number | null {
  if (!projectStartDate || !from || !to || from > to) return null;
  const rangeStart = toYmd(from);
  const rangeEndExclusive = addDays(toYmd(to), 1);
  if (
    !Number.isFinite(rangeStart.y) || !Number.isFinite(rangeStart.m) ||
    !Number.isFinite(rangeEndExclusive.y) || !Number.isFinite(rangeEndExclusive.m)
  ) return null;

  let total = 0;
  for (const [rawMonth, rawHours] of Object.entries(monthlyHours ?? {})) {
    const month = Number(rawMonth);
    const hours = Number(rawHours);
    if (!Number.isFinite(month) || !Number.isFinite(hours)) continue;
    const segmentStart = toYmd(monthIndexToDateCal(month, projectStartDate));
    const segmentEnd = toYmd(monthIndexToDateCal(month + 1, projectStartDate));
    const segmentStartKey = ymdKey(segmentStart);
    const segmentEndKey = ymdKey(segmentEnd);
    const rangeStartKey = ymdKey(rangeStart);
    const rangeEndKey = ymdKey(rangeEndExclusive);
    const overlapStart = rangeStartKey > segmentStartKey ? rangeStart : segmentStart;
    const overlapEnd = rangeEndKey < segmentEndKey ? rangeEndExclusive : segmentEnd;
    const segmentDays = daysBetween(segmentStart, segmentEnd);
    const overlapDays = Math.max(0, daysBetween(overlapStart, overlapEnd));
    if (segmentDays > 0) total += hours * (overlapDays / segmentDays);
  }
  return total;
}

/** Strict display-name normalization only; it does not infer machine aliases. */
export function normalizedEquipmentTypeName(value: unknown): string {
  return String(value ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}
