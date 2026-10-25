// @vitest-environment jsdom
import React from "react";
import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SavedHireActivityTable } from "@/components/vendor-bills/SavedHireActivityTable";
import type { BillingDailyRow } from "@/components/vendor-bills/EquipmentHireBillOutput";

const row = (values: Partial<BillingDailyRow> & { date: string }) => ({
  status: "Worked",
  remarks: "",
  downtimeHours: null,
  ...values,
}) as BillingDailyRow;

const performance = (values: Record<string, unknown>) => ({
  key: "daily",
  date: "2025-05-01",
  projectSite: "Site A",
  openingMeter: 100,
  closingMeter: 102,
  workingHours: 2,
  workingHoursIncomplete: false,
  clockDuration: 2,
  clockDurationIncomplete: false,
  dieselIssued: 7,
  openingTank: 100,
  closingTank: 80,
  dieselConsumed: 27,
  expectedDiesel: 10,
  difference: 17,
  consumptionRate: 13.5,
  consumptionRateUnit: "L/hr",
  consumptionIncomplete: false,
  startTime: "08:00",
  endTime: "10:00",
  multipleTimeSegments: false,
  events: [],
  ...values,
}) as unknown as NonNullable<BillingDailyRow["performance"]>;

it("shows tank-based rates, N/A dips, h:mm durations, and a weighted period average", () => {
  render(<SavedHireActivityTable rows={[
    row({ date: "2025-05-01", performance: performance({ openingTank: 100, closingTank: 80, workingHours: 2, dieselIssued: 7 }) }),
    row({ date: "2025-05-02", performance: performance({ openingTank: 80, closingTank: 75, workingHours: 1, dieselIssued: 3 }) }),
    row({ date: "2025-05-03", performance: performance({ openingTank: null, closingTank: null, workingHours: 2, dieselIssued: null, consumptionIncomplete: true }) }),
  ]} isTripBased={false} />);

  expect(screen.getByRole("columnheader", { name: "Working hrs (h:min)" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Tank open" })).toBeTruthy();
  expect(screen.queryByRole("columnheader", { name: "Trips" })).toBeNull();
  expect(screen.getByText("10 L/hr")).toBeTruthy();
  expect(screen.getByText("5 L/hr")).toBeTruthy();
  expect(screen.getByText("8.33 L/hr")).toBeTruthy();
  expect(screen.getAllByText("N/A")).toHaveLength(2);
  expect(screen.getByText("5:00")).toBeTruthy();
  expect(screen.getByText("10 L")).toBeTruthy();
});

it("shows trips only when a trip-basis activity has a recorded trip count", () => {
  render(<SavedHireActivityTable
    rows={[row({ date: "2025-05-01", trips: 4, performance: performance({}) })]}
    isTripBased
  />);
  expect(screen.getByRole("columnheader", { name: "Trips" })).toBeTruthy();
  expect(screen.getAllByText("4").length).toBeGreaterThan(0);
});
