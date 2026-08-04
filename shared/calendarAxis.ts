/**
 * Instruction 027A — True calendar axis for the Work Programme Gantt.
 *
 * The scheduling engine stores bar positions as 1-based fractional month
 * indices (M1 = project start date exactly). Historically these were converted
 * to/from dates with an average month length (365.25/12 days), while the Gantt
 * header showed real calendar months — so bars drifted from the header.
 *
 * This module is the SINGLE authoritative converter used by the Gantt UI:
 *   - month index ↔ real calendar date  (segment k = actual days between
 *     projectStart+k months and projectStart+k+1 months, so leap years and
 *     28/30/31-day months are exact);
 *   - date → horizontal axis position   (columns are FULL calendar months
 *     anchored at the 1st of the project-start month; a mid-month project
 *     start simply begins partway into column 1);
 *   - calendar-duration arithmetic.
 *
 * Date convention (documented per 027A §6):
 *   - start date is inclusive;
 *   - the STORED endMonth index marks the exclusive visual boundary
 *     (start of the day after the finish date);
 *   - the DISPLAYED finish date is therefore boundary − 1 day (inclusive);
 *   - calendar duration = days(start → boundary), minimum 1 day.
 *
 * All arithmetic is date-only (year/month/day integers via Date.UTC), so it is
 * immune to timezone/DST shifts. Returned Date objects are constructed from
 * local Y/M/D components for compatibility with formatDateForInput().
 */

export interface Ymd { y: number; m: number; d: number } // m = 1..12

const MS_DAY = 86_400_000;

/** Parse "YYYY-MM-DD" (or a Date's local components) as a date-only value. */
export function toYmd(input: string | Date): Ymd {
  if (input instanceof Date) {
    return { y: input.getFullYear(), m: input.getMonth() + 1, d: input.getDate() };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(input));
  if (!m) {
    const dt = new Date(String(input) + "T00:00:00");
    if (isNaN(dt.getTime())) return { y: NaN, m: NaN, d: NaN };
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  }
  return { y: +m[1], m: +m[2], d: +m[3] };
}

export function ymdIsValid(x: Ymd): boolean {
  return Number.isFinite(x.y) && Number.isFinite(x.m) && Number.isFinite(x.d);
}

/** Local-midnight Date from Ymd (safe for formatDateForInput / date inputs). */
export function ymdToDate(x: Ymd): Date {
  return new Date(x.y, x.m - 1, x.d);
}

const utcOf = (x: Ymd) => Date.UTC(x.y, x.m - 1, x.d);

/** Actual number of days in a calendar month (leap-year aware). */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Whole days from a to b (b − a); negative when b precedes a. */
export function daysBetween(a: Ymd, b: Ymd): number {
  return Math.round((utcOf(b) - utcOf(a)) / MS_DAY);
}

export function addDays(x: Ymd, n: number): Ymd {
  const dt = new Date(utcOf(x) + n * MS_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Add n calendar months, clamping the day (Jan 31 + 1mo → Feb 28/29). */
export function addMonthsClamped(x: Ymd, n: number): Ymd {
  const m0 = x.m - 1 + n;
  const y = x.y + Math.floor(m0 / 12);
  const m = ((m0 % 12) + 12) % 12 + 1;
  return { y, m, d: Math.min(x.d, daysInMonth(y, m)) };
}

// ─── Month index ↔ date (M1 = project start date exactly) ────────────────────

/**
 * Fractional month index → real calendar date.
 * whole months step by true calendar months from the project start;
 * the fractional part maps over the ACTUAL length of that month segment.
 */
export function monthIndexToDateCal(idx: number, projectStartDate: string | Date): Date {
  const start = toYmd(projectStartDate);
  const whole = Math.floor(idx - 1 + 1e-9);
  const frac = idx - 1 - whole;
  const a = addMonthsClamped(start, whole);
  const b = addMonthsClamped(start, whole + 1);
  const segDays = daysBetween(a, b);
  return ymdToDate(addDays(a, Math.round(frac * segDays)));
}

/** Real calendar date → fractional month index (inverse of monthIndexToDateCal). */
export function dateToMonthIndexCal(d: string | Date, projectStartDate: string | Date): number {
  const start = toYmd(projectStartDate);
  const target = toYmd(d);
  if (!ymdIsValid(start) || !ymdIsValid(target)) return NaN;
  let w = (target.y - start.y) * 12 + (target.m - start.m);
  while (utcOf(addMonthsClamped(start, w)) > utcOf(target)) w--;
  while (utcOf(addMonthsClamped(start, w + 1)) <= utcOf(target)) w++;
  const a = addMonthsClamped(start, w);
  const b = addMonthsClamped(start, w + 1);
  const frac = daysBetween(a, target) / daysBetween(a, b);
  return +(1 + w + frac).toFixed(4);
}

// ─── Calendar axis (full calendar-month columns) ─────────────────────────────

/** First day of the project-start month — the left edge (x = 0) of the axis. */
export function axisAnchor(projectStartDate: string | Date): Ymd {
  const s = toYmd(projectStartDate);
  return { y: s.y, m: s.m, d: 1 };
}

/**
 * Number of full calendar-month columns needed to cover `totalMonths`
 * programme months. A mid-month project start needs one extra column because
 * the programme window overhangs into one more calendar month.
 */
export function axisMonthCount(projectStartDate: string | Date | null | undefined, totalMonths: number): number {
  if (!projectStartDate) return totalMonths;
  const s = toYmd(projectStartDate);
  if (!ymdIsValid(s)) return totalMonths;
  return totalMonths + (s.d > 1 ? 1 : 0);
}

/**
 * Date → horizontal position in pixels. Column k (0-based from the anchor
 * month) spans [k·colW, (k+1)·colW); a date sits at (day−1)/daysInMonth of
 * the way through its own ACTUAL calendar month.
 */
export function dateToAxisX(d: string | Date, projectStartDate: string | Date, colW: number): number {
  const anchor = axisAnchor(projectStartDate);
  const t = toYmd(d);
  if (!ymdIsValid(t) || !ymdIsValid(anchor)) return NaN;
  const monthsDiff = (t.y - anchor.y) * 12 + (t.m - anchor.m);
  return (monthsDiff + (t.d - 1) / daysInMonth(t.y, t.m)) * colW;
}

/** Month index → axis x (via its true calendar date). */
export function monthIndexToAxisX(idx: number, projectStartDate: string | Date, colW: number): number {
  return dateToAxisX(monthIndexToDateCal(idx, projectStartDate), projectStartDate, colW);
}

// ─── Durations & display helpers ─────────────────────────────────────────────

/**
 * Inclusive calendar duration in days for a bar whose stored indices are
 * [startIdx, endIdxBoundary). One-day bar (boundary = start + 1 day) → 1.
 */
export function calendarDaysFromIdx(startIdx: number, endIdx: number, projectStartDate: string | Date): number {
  const a = toYmd(monthIndexToDateCal(startIdx, projectStartDate));
  const b = toYmd(monthIndexToDateCal(endIdx, projectStartDate));
  return Math.max(1, daysBetween(a, b));
}

/**
 * Displayed (inclusive) finish date = stored end boundary − 1 day, clamped to
 * never precede the start date (sub-day bars round both indices to the same
 * calendar day; minimum visual duration is 1 day).
 */
export function displayFinishDateCal(endIdx: number, projectStartDate: string | Date, startIdx?: number): Date {
  const boundary = toYmd(monthIndexToDateCal(endIdx, projectStartDate));
  let finish = addDays(boundary, -1);
  if (startIdx != null && !isNaN(startIdx)) {
    const start = toYmd(monthIndexToDateCal(startIdx, projectStartDate));
    if (daysBetween(start, finish) < 0) finish = start;
  }
  return ymdToDate(finish);
}

/** Inclusive finish date string ("YYYY-MM-DD") → stored exclusive boundary index. */
export function finishDateInputToIdx(dateStr: string, projectStartDate: string | Date): number {
  const boundary = addDays(toYmd(dateStr), 1);
  return dateToMonthIndexCal(ymdToDate(boundary), projectStartDate);
}
