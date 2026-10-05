// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import type { HireActivityDay } from "@shared/hireBilling";
import DraftEquipmentHireCalendar from "./DraftEquipmentHireCalendar";
import HireActivityBreakdownCalendar, { hireActivityBreakdownSheetRows } from "./HireActivityBreakdownCalendar";
import { useWholeBillCalendarSnapshots } from "./useWholeBillCalendarSnapshots";

const query = vi.hoisted(() => ({
  isSuccess: true, isPending: false, isFetching: false, isError: false, error: null,
  data: { fleet: [{ equipmentId: 17, dailyRows: [
    { date: "2026-10-04", projectSite: "Kondapur", openingMeter: 1241.3, closingMeter: 1248.7, workingHours: 7.4, events: [] },
  ] }], filterOptions: { equipment: [{ id: 17, meterType: "hour_meter" }] } },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn(() => query) }));
afterEach(cleanup);

describe("existing calendar evidence seams", () => {
  it("observes already displayed live rows and decisions without calling queryFn or fetch", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const observe = vi.fn();
    render(<DraftEquipmentHireCalendar equipmentId={17} equipmentName="JCB-SITE"
      periodFrom="2026-10-04" periodTo="2026-10-04" canExport={false}
      exceptionDecisions={[{ date: "2026-10-04", decision: "half_day" }]}
      onExportSnapshot={observe} />);
    expect(observe).toHaveBeenCalled();
    const snapshot = observe.mock.calls.at(-1)![0];
    expect(snapshot.rows[0].performance).toBe(query.data.fleet[0].dailyRows[0]);
    expect(snapshot.rows[0].remarks).toContain("Decision: half day");
    expect(snapshot.meterType).toBe("hour_meter");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("reads only included calendar keys without state updates or stale removed groups", () => {
    const { result } = renderHook(() => useWholeBillCalendarSnapshots());
    const calendar = { equipmentName: "JCB-SITE", periodFrom: "2026-10-04", periodTo: "2026-10-04", rows: [] };
    result.current.rememberCalendar("included", calendar);
    result.current.rememberCalendar("removed", { ...calendar, equipmentName: "Excluded Roller" });
    expect(result.current.readCalendars(["included"])).toEqual([calendar]);
    expect(result.current.readCalendars(["unknown"])).toEqual([]);
  });
  it("exports the exact same activity/breakdown display strings with no new calculation", () => {
    const day: HireActivityDay = {
      date: "2026-10-04", activity: "breakdown", hours: 7.4, trips: 0,
      actualDiesel: 12.3, expectedDiesel: 11.7, expectedDieselAvailable: true, dieselVariance: 0.6,
      downtimeHours: 1.3, activityCount: 1, billableActivityCount: 1, openActivityCount: 0,
      equipmentNames: ["JCB-SITE"], siteLocations: ["Kondapur"], activityDescriptions: ["Hydraulic seal"],
      openingReadings: [1241.3], closingReadings: [1248.7], maintenanceDescriptions: ["Hydraulic seal"],
      movementReferences: [],
    };
    const props = { days: [day], consumptionNorm: 1.6, normBasis: "L/hr", meterType: "hour_meter",
      tripApplicable: false, showFuel: true, formatDate: (value: string) => value };
    const projected = hireActivityBreakdownSheetRows(props);
    render(<HireActivityBreakdownCalendar {...props} />);
    const text = screen.getByTestId("hire-activity-day-2026-10-04").textContent!;
    for (const cell of projected.rows[0]) expect(text).toContain(cell);
    expect(projected.headers).toContain("Consumption Rate");
    expect(projected.rows[0]).toContain("Breakdown");
    expect(projected.rows[0]).toContain("1.3".padEnd(4, "0") + " h");
  });
});