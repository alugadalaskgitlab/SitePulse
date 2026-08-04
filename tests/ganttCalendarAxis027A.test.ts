// Instruction 027A — true calendar axis tests.
// Convention: stored endMonth index = EXCLUSIVE boundary; displayed finish =
// boundary − 1 day; calendar duration = days(start → boundary), min 1.
import { describe, it, expect } from "vitest";
import {
  monthIndexToDateCal,
  dateToMonthIndexCal,
  monthIndexToAxisX,
  dateToAxisX,
  axisMonthCount,
  calendarDaysFromIdx,
  displayFinishDateCal,
  finishDateInputToIdx,
  daysInMonth,
} from "../shared/calendarAxis";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const JUNE1 = "2026-06-01";
const COLW = 110;

describe("027A dateToMonthIndexCal — exact start alignment (June-1 project)", () => {
  it("02/07/2026 lands 1/31 into month 2", () => {
    expect(dateToMonthIndexCal("2026-07-02", JUNE1)).toBeCloseTo(2 + 1 / 31, 3);
  });
  it("31/07/2026 lands 30/31 into month 2", () => {
    expect(dateToMonthIndexCal("2026-07-31", JUNE1)).toBeCloseTo(2 + 30 / 31, 3);
  });
  it("01/08/2026 is exactly month index 3", () => {
    expect(dateToMonthIndexCal("2026-08-01", JUNE1)).toBeCloseTo(3, 6);
  });
  it("project start itself is index 1", () => {
    expect(dateToMonthIndexCal(JUNE1, JUNE1)).toBe(1);
  });
});

describe("027A round-trips", () => {
  const dates = ["2026-06-01", "2026-07-02", "2026-07-31", "2026-09-14", "2027-02-28", "2028-02-29"];
  for (const d of dates) {
    it(`round-trips ${d} (June-1 start)`, () => {
      expect(iso(monthIndexToDateCal(dateToMonthIndexCal(d, JUNE1), JUNE1))).toBe(d);
    });
  }
  it("round-trips across a mid-month project start", () => {
    const start = "2026-06-15";
    for (const d of ["2026-06-15", "2026-06-20", "2026-07-20", "2026-12-14"]) {
      expect(iso(monthIndexToDateCal(dateToMonthIndexCal(d, start), start))).toBe(d);
    }
  });
});

describe("027A mid-month project start (2026-06-15, like Takkadpally–Sirur)", () => {
  const START = "2026-06-15";
  it("M1 is exactly the project start date", () => {
    expect(iso(monthIndexToDateCal(1, START))).toBe("2026-06-15");
  });
  it("segment 1 spans Jun 15 → Jul 15 (30 days): 20/06 = 1 + 5/30", () => {
    expect(dateToMonthIndexCal("2026-06-20", START)).toBeCloseTo(1 + 5 / 30, 3);
  });
  it("segment 2 spans Jul 15 → Aug 15 (31 days): 20/07 = 2 + 5/31", () => {
    expect(dateToMonthIndexCal("2026-07-20", START)).toBeCloseTo(2 + 5 / 31, 3);
  });
  it("axis needs one extra calendar-month column", () => {
    expect(axisMonthCount(START, 6)).toBe(7);
    expect(axisMonthCount(JUNE1, 6)).toBe(6);
    expect(axisMonthCount(null, 6)).toBe(6);
  });
});

describe("027A inclusive calendar durations", () => {
  it("1-day bar: start 02/07, boundary 03/07 → 1 day; finish shows 02/07", () => {
    const s = dateToMonthIndexCal("2026-07-02", JUNE1);
    const e = dateToMonthIndexCal("2026-07-03", JUNE1);
    expect(calendarDaysFromIdx(s, e, JUNE1)).toBe(1);
    expect(iso(displayFinishDateCal(e, JUNE1))).toBe("2026-07-02");
  });
  it("7-day bar: 02/07 → finish 08/07 (boundary 09/07)", () => {
    const s = dateToMonthIndexCal("2026-07-02", JUNE1);
    const e = finishDateInputToIdx("2026-07-08", JUNE1);
    expect(calendarDaysFromIdx(s, e, JUNE1)).toBe(7);
    expect(iso(displayFinishDateCal(e, JUNE1))).toBe("2026-07-08");
  });
  it("cross-month: 25/07 → 10/08 inclusive = 17 days", () => {
    const s = dateToMonthIndexCal("2026-07-25", JUNE1);
    const e = finishDateInputToIdx("2026-08-10", JUNE1);
    expect(calendarDaysFromIdx(s, e, JUNE1)).toBe(17);
  });
  it("full February: normal year 28d, leap year 29d", () => {
    const start = "2026-01-01";
    expect(
      calendarDaysFromIdx(dateToMonthIndexCal("2027-02-01", start), dateToMonthIndexCal("2027-03-01", start), start),
    ).toBe(28);
    expect(
      calendarDaysFromIdx(dateToMonthIndexCal("2028-02-01", start), dateToMonthIndexCal("2028-03-01", start), start),
    ).toBe(29);
  });
  it("full 30- vs 31-day months differ", () => {
    const s1 = dateToMonthIndexCal("2026-09-01", JUNE1);
    const e1 = dateToMonthIndexCal("2026-10-01", JUNE1);
    const s2 = dateToMonthIndexCal("2026-07-01", JUNE1);
    const e2 = dateToMonthIndexCal("2026-08-01", JUNE1);
    expect(calendarDaysFromIdx(s1, e1, JUNE1)).toBe(30);
    expect(calendarDaysFromIdx(s2, e2, JUNE1)).toBe(31);
  });
});

describe("027A axis pixel positions (colW = 110)", () => {
  it("first day of each calendar month sits exactly on a column boundary", () => {
    expect(dateToAxisX("2026-06-01", JUNE1, COLW)).toBe(0);
    expect(dateToAxisX("2026-07-01", JUNE1, COLW)).toBe(COLW);
    expect(dateToAxisX("2026-08-01", JUNE1, COLW)).toBe(2 * COLW);
    expect(dateToAxisX("2027-02-01", JUNE1, COLW)).toBe(8 * COLW);
  });
  it("02/07 sits 1/31 into the July column — NOT at an avg-month drift position", () => {
    expect(dateToAxisX("2026-07-02", JUNE1, COLW)).toBeCloseTo(COLW + (1 / 31) * COLW, 6);
  });
  it("mid-month project start: M1 begins partway through its anchor column", () => {
    const START = "2026-06-15";
    expect(monthIndexToAxisX(1, START, COLW)).toBeCloseTo((14 / 30) * COLW, 6);
    // 01/07 still lands exactly on the Jun/Jul boundary
    expect(dateToAxisX("2026-07-01", START, COLW)).toBe(COLW);
  });
  it("index→pixel agrees with date→pixel", () => {
    const idx = dateToMonthIndexCal("2026-09-14", JUNE1);
    expect(monthIndexToAxisX(idx, JUNE1, COLW)).toBeCloseTo(dateToAxisX("2026-09-14", JUNE1, COLW), 1);
  });
});

describe("027A persisted endDate contract (inclusive finish, matches SiteEntry `date <= endDate`)", () => {
  // Derived bar.endDate must be the INCLUSIVE displayed finish, not the exclusive boundary,
  // so a bar is not considered "active" one extra day after its shown finish.
  it("7-day fixed bar: persisted finish = shown finish = 08/07, boundary 09/07 excluded", () => {
    const s = dateToMonthIndexCal("2026-07-02", JUNE1);
    const e = finishDateInputToIdx("2026-07-08", JUNE1);
    const persisted = iso(displayFinishDateCal(e, JUNE1, s));
    expect(persisted).toBe("2026-07-08");
    // SiteEntry-style inclusive comparison
    expect("2026-07-08" <= persisted).toBe(true);
    expect("2026-07-09" <= persisted).toBe(false);
  });
  it("1-day bar: persisted finish equals the start date", () => {
    const s = dateToMonthIndexCal("2026-07-02", JUNE1);
    const e = finishDateInputToIdx("2026-07-02", JUNE1);
    expect(iso(displayFinishDateCal(e, JUNE1, s))).toBe("2026-07-02");
  });
});

describe("027A timezone / DST safety and edge cases", () => {
  it("daysInMonth handles leap years", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
  it("day-clamped month stepping (start Jan 31 → Feb 28)", () => {
    const start = "2026-01-31";
    expect(iso(monthIndexToDateCal(2, start))).toBe("2026-02-28");
  });
  it("sub-day bar: displayed finish clamps to the start date (never before it)", () => {
    // M1.6 → M1.61 with a Jun-15 start rounds both ends to the same day
    expect(iso(displayFinishDateCal(1.61, "2026-06-15", 1.6))).toBe(iso(monthIndexToDateCal(1.6, "2026-06-15")));
  });
  it("invalid date input yields NaN index (drives UI warning)", () => {
    expect(dateToMonthIndexCal("not-a-date", JUNE1)).toBeNaN();
  });
  it("dates parse as date-only (no UTC/local shift)", () => {
    const d = monthIndexToDateCal(1, "2026-06-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(1);
  });
});
