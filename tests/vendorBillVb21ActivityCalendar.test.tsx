// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import HireActivityBreakdownCalendar, {
  formatConsumptionRate,
  resolveConsumptionUnit,
} from "@/components/vendor-bills/HireActivityBreakdownCalendar";
import { calculateEquipmentHireFinancials, type HireActivityDay } from "@shared/hireBilling";

const baseDay: HireActivityDay = {
  date: "2026-09-15",
  activity: "worked",
  hours: 8,
  trips: 0,
  actualDiesel: 12,
  expectedDiesel: 10,
  expectedDieselAvailable: true,
  dieselVariance: 2,
  downtimeHours: 0,
  activityCount: 1,
  billableActivityCount: 1,
  openActivityCount: 0,
  equipmentNames: ["ROLLER"],
  siteLocations: ["ALLADURG PWD ROAD"],
  activityDescriptions: ["Embankment"],
  openingReadings: [120],
  closingReadings: [128],
  maintenanceDescriptions: [],
  movementReferences: [],
};

function renderCalendar(
  days: readonly HireActivityDay[],
  props: Partial<React.ComponentProps<typeof HireActivityBreakdownCalendar>> = {},
) {
  return render(
    <HireActivityBreakdownCalendar
      days={days}
      consumptionNorm={1.25}
      normBasis="L/hr"
      meterType="hour_meter"
      tripApplicable={false}
      showFuel
      formatDate={date => date}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("VB-21 activity / breakdown calendar", () => {
  it("A — displays the authoritative daily readings, run, diesel, variance, status and site/work fields", () => {
    renderCalendar([baseDay]);
    const row = screen.getByTestId("hire-activity-day-2026-09-15");
    expect(row.textContent).toContain("120 → 128");
    expect(row.textContent).toContain("8.00");
    expect(row.textContent).toContain("12.00 L");
    expect(row.textContent).toContain("1.50 L/Hr (Norm: 1.25)");
    expect(row.textContent).toContain("+2.00 L");
    expect(row.textContent).toContain("Worked");
    expect(row.textContent).toContain("ALLADURG PWD ROAD — Embankment");
    expect(within(row).getByText("—")).toBeTruthy();
    expect(screen.queryByText(/Expected Diesel/)).toBeNull();
  });

  it("B — explains that a no-activity monthly day remains billable", () => {
    renderCalendar([{
      ...baseDay,
      date: "2026-09-16",
      activity: "no_activity",
      hours: 0,
      actualDiesel: 0,
      expectedDiesel: 0,
      dieselVariance: 0,
      activityCount: 0,
      billableActivityCount: 0,
      openingReadings: [],
      closingReadings: [],
      siteLocations: [],
      activityDescriptions: [],
    }]);
    expect(screen.getByTestId("hire-activity-day-2026-09-16").textContent).toContain("No Activity — Still Billable");
  });

  it("C — marks trips N/A for runtime equipment and shows transport trip counts", () => {
    const { rerender } = renderCalendar([baseDay]);
    expect(screen.getByTitle("Not applicable to this equipment").textContent).toBe("N/A");
    rerender(
      <HireActivityBreakdownCalendar
        days={[{ ...baseDay, trips: 3 }]}
        consumptionNorm={0.3}
        normBasis="L/km"
        meterType="odometer"
        tripApplicable
        showFuel
        formatDate={date => date}
      />,
    );
    const row = screen.getByTestId("hire-activity-day-2026-09-15");
    expect(within(row).queryByText("N/A")).toBeNull();
    expect(row.textContent).toContain("3.00");
  });

  it("D — formats direct and inverse norm units and uses dashes for zero run or missing diesel", () => {
    expect(formatConsumptionRate(12, 8, 1.25, "L/hr")).toBe("1.50 L/Hr (Norm: 1.25)");
    expect(formatConsumptionRate(10, 50, 0.2, "L/km")).toBe("0.20 L/Km (Norm: 0.20)");
    expect(formatConsumptionRate(10, 50, 5, "Km/L")).toBe("5.00 Km/L (Norm: 5.00)");
    expect(formatConsumptionRate(10, 50, 0.2, undefined, "odometer")).toBe("0.20 L/Km (Norm: 0.20)");
    expect(formatConsumptionRate(12, 8, 1.25, undefined, "hour_meter")).toBe("1.50 L/Hr (Norm: 1.25)");
    expect(formatConsumptionRate(12, 8, 1.25, "unknown", "unknown")).toBe("—");
    expect(resolveConsumptionUnit("litres_per_hour")).toBe("L/Hr");
    expect(resolveConsumptionUnit("liters-per-kilometer")).toBe("L/Km");
    expect(resolveConsumptionUnit("kilometres_per_litre")).toBe("Km/L");
    expect(formatConsumptionRate(0, 8, 1.25, "L/hr")).toBe("—");
    expect(formatConsumptionRate(12, 0, 1.25, "L/hr")).toBe("—");

    renderCalendar([{ ...baseDay, expectedDieselAvailable: false }]);
    expect(screen.getByText("Tank Readings N/A")).toBeTruthy();
  });

  it("E — exposes merged record counts, open counts, and every conflicting reading", () => {
    renderCalendar([{
      ...baseDay,
      openingReadings: [120, 124],
      closingReadings: [123, 128],
      activityCount: 2,
      billableActivityCount: 1,
      openActivityCount: 1,
    }]);
    const row = screen.getByTestId("hire-activity-day-2026-09-15");
    expect(row.textContent).toContain("Open: 120, 124 → Close: 123, 128");
    expect(screen.getByRole("alert").textContent).toContain("Multiple conflicting readings");
    expect(row.textContent).toContain("2 records (1 billable, 1 open)");
  });

  it("F — remains display-only: input evidence and recovery financial values are unchanged", () => {
    const evidence = [baseDay];
    const before = JSON.stringify(evidence);
    const financialInput = {
      grossHire: 90_000,
      breakdownDeduction: 3_000,
      hsdRecovery: 200,
      otherDebit: 0,
      advanceAdjustment: 0,
      otherCredit: 0,
      gstRate: 18,
      tdsRate: 2,
      paid: 0,
    };
    const beforeFinancials = calculateEquipmentHireFinancials(financialInput);
    renderCalendar(evidence);
    expect(JSON.stringify(evidence)).toBe(before);
    expect(calculateEquipmentHireFinancials(financialInput)).toEqual(beforeFinancials);
    expect(beforeFinancials.hsdRecovery).toBe(200);
  });

  it("G — preserves contractor fuel hiding and the saved report's Expected Diesel output", () => {
    renderCalendar([baseDay], { showFuel: false });
    expect(screen.queryByText("Diesel Issued (Actual)")).toBeNull();
    expect(screen.queryByText("Consumption Rate")).toBeNull();
    expect(screen.queryByText("Excess / Under")).toBeNull();

    const reportSource = readFileSync("client/src/components/vendor-bills/EquipmentHireBillOutput.tsx", "utf8");
    expect(reportSource).toContain("Expected Diesel");
    const vendorBillsSource = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    expect(vendorBillsSource).toContain("hireGroups: includedHireCalculated.map");
  });
});