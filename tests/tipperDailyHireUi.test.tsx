// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TripDailyHireReview } from "../client/src/components/TripDailyHireReview";
import { calculateHireGroup } from "../shared/hireBilling";
afterEach(cleanup);
it("shows vehicle/date trip evidence and updates half-day pricing without multiplying by trips", () => {
  function Harness() {
    const [group, setGroup] = useState<any>({ equipmentId: 1, rate: 2000, dailyDecisions: [] });
    const activities = [1, 2, 3].map(sourceId => ({ source: "site_material_trip" as const, sourceId,
      equipmentId: 1, businessDate: "2026-10-01", entryType: "daily_hire", confirmedForDailyHire: true, numberOfTrips: 1, status: "closed" }));
    const result = calculateHireGroup({ terms: { billingBasis: "daily", rate: 2000 }, periodFrom: "2026-10-01",
      periodTo: "2026-10-01", activities, maintenance: [], dailyDecisions: group.dailyDecisions });
    return <TripDailyHireReview group={group} equipment={{ registrationNumber: "TS01AB1234", vendorName: "Agency" }}
      result={result} activities={activities} onChange={patch => setGroup({ ...group, ...patch })} onRemove={() => {}} />;
  }
  render(<Harness />);
  expect(screen.getByText("Needs review")).toBeTruthy();
  expect(screen.getByText(/0 hire days/).textContent).toContain("1 day needs review");
  expect(screen.getAllByRole("link")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "Trip #1" }).getAttribute("href")).toContain("hireDate=2026-10-01");
  fireEvent.change(screen.getByLabelText("Hire reason 2026-10-01"), { target: { value: "Attendance verified" } });
  expect((screen.getByLabelText("Hire decision 2026-10-01") as HTMLSelectElement).value).toBe("");
  expect(screen.getByText("Needs review")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Hire decision 2026-10-01"), { target: { value: "half_day" } });
  fireEvent.change(screen.getByLabelText("Hire reason 2026-10-01"), { target: { value: "Half day verified" } });
  expect(screen.getByText(/0.5 hire days/).textContent).toContain("1,000");
  fireEvent.change(screen.getByLabelText("Hire decision 2026-10-01"), { target: { value: "exclude" } });
  expect(screen.getByText(/0 hire days/)).toBeTruthy();
});

const date = "2026-10-02";
const equipment = { registrationNumber: "TS09CD4821", vendorName: "Ravi Earthworks" };
const trip = { source: "site_material_trip", sourceId: 81, equipmentId: 1, businessDate: date,
  confirmedForDailyHire: true, numberOfTrips: 4 };
const result = { payableDays: [{ date, fraction: 1 }], quantity: 1, grossAmount: 2400 };

it("shows all same-vehicle evidence alongside recorded trips without counting another vehicle", () => {
  render(<TripDailyHireReview group={{ equipmentId: 1, rate: 2400, dailyDecisions: [] }}
    equipment={equipment} result={result} activities={[trip,
      { source: "dpr_log", sourceId: 91, dprId: 35, equipmentId: 1, businessDate: date, task: "Soil haul" },
      { source: "plant_usage", sourceId: 72, equipmentId: 1, businessDate: date },
      { ...trip, sourceId: 82, equipmentId: 2 }]}
    onChange={() => {}} onRemove={() => {}} />);
  const row = screen.getByText(date).closest("tr")!;
  expect(within(row).getByText("TS09CD4821")).toBeTruthy();
  expect(within(row).getByText("4")).toBeTruthy();
  expect(within(row).getByText("DPR: 1")).toBeTruthy();
  expect(within(row).getByText("DPR #35 · Log #91 · Soil haul")).toBeTruthy();
  expect(within(row).getByText("Standalone equipment: 1")).toBeTruthy();
  expect(within(row).getByText("Usage #72")).toBeTruthy();
  expect(screen.queryByText("Trip #82")).toBeNull();
  expect(screen.getAllByRole("columnheader").map(th => th.textContent)).toEqual([
    "Date", "Vehicle", "Trips", "DPR activity", "Full/Half/Excluded", "Reason", "Rate", "Amount",
  ]);
});

it("blocks payable choices for billed dates and requires an explicit exclusion with reason", () => {
  function Harness() {
    const [group, setGroup] = useState<any>({ equipmentId: 1, rate: 2400,
      dailyDecisions: [{ date, decision: "full_day", reason: "Previously reviewed" }] });
    return <TripDailyHireReview group={group} equipment={equipment} result={result} activities={[trip]}
      billedDays={[{ date, billNo: "VB-26-0148", billId: 148 }, { date, billNo: "Legacy-027" }]}
      onChange={patch => setGroup({ ...group, ...patch })} onRemove={() => {}} />;
  }
  render(<Harness />);
  expect(screen.getByRole("link", { name: "VB-26-0148" }).getAttribute("href")).toBe("/plant/vendor-bills?billId=148");
  expect(screen.getByText("Legacy-027").tagName).toBe("SPAN");
  expect((screen.getByRole("option", { name: "Full day (1)" }) as HTMLOptionElement).disabled).toBe(true);
  expect((screen.getByRole("option", { name: "Half day (0.5)" }) as HTMLOptionElement).disabled).toBe(true);
  expect((screen.getByLabelText(`Hire decision ${date}`) as HTMLSelectElement).value).toBe("");
  expect(screen.getByText(/0 hire days/).textContent).toContain("1 day needs review");
  fireEvent.change(screen.getByLabelText(`Hire reason ${date}`), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText(`Hire decision ${date}`), { target: { value: "exclude" } });
  expect(screen.getByText("Reason required.")).toBeTruthy();
  expect(screen.getByText(/0 hire days/).textContent).toContain("1 day needs review");
  fireEvent.change(screen.getByLabelText(`Hire reason ${date}`), { target: { value: "Already in VB-26-0148" } });
  expect(screen.getByText(/0 hire days/).textContent).not.toContain("needs review");
});

it("preserves nontrip daily pricing and the remove action", () => {
  const onChange = vi.fn();
  const onRemove = vi.fn();
  render(<TripDailyHireReview group={{ equipmentId: 1, rate: 2400 }} equipment={equipment}
    result={result} activities={[{ source: "plant_usage", sourceId: 72, equipmentId: 1, businessDate: date }]}
    onChange={onChange} onRemove={onRemove} />);
  expect(screen.queryByText("Needs review")).toBeNull();
  expect(screen.getByText(/1 hire days/).textContent).toContain("2,400");
  fireEvent.change(screen.getByLabelText(`Hire reason ${date}`), { target: { value: "Usage verified" } });
  expect(onChange).toHaveBeenCalledWith({ dailyDecisions: [{ date, decision: "full_day", reason: "Usage verified" }] });
  fireEvent.click(screen.getByRole("button", { name: "Remove hire group" }));
  expect(onRemove).toHaveBeenCalledOnce();
});

it("does not imply full-day pricing when a trip reason is entered before the decision", () => {
  const onChange = vi.fn();
  render(<TripDailyHireReview group={{ equipmentId: 1, rate: 2400 }} equipment={equipment}
    result={result} activities={[trip]} onChange={onChange} onRemove={() => {}} />);
  fireEvent.change(screen.getByLabelText(`Hire reason ${date}`), { target: { value: "Early departure" } });
  expect(onChange).toHaveBeenCalledWith({ dailyDecisions: [{ date, decision: "", reason: "Early departure" }] });
  expect(screen.getByText("Needs review")).toBeTruthy();
});

it("requires a reason for an explicit full day and keeps other dates pending", () => {
  const nextDate = "2026-10-03";
  function Harness() {
    const [group, setGroup] = useState<any>({ equipmentId: 1, rate: 2400, dailyDecisions: [] });
    return <TripDailyHireReview group={group} equipment={equipment}
      result={{ payableDays: [{ date, fraction: 1 }, { date: nextDate, fraction: 1 }], quantity: 2, grossAmount: 4800 }}
      activities={[trip, { ...trip, sourceId: 82, businessDate: nextDate }]}
      onChange={patch => setGroup({ ...group, ...patch })} onRemove={() => {}} />;
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText(`Hire decision ${date}`), { target: { value: "full_day" } });
  expect(screen.getAllByText("Needs review")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText(`Hire reason ${date}`), { target: { value: "Full shift verified" } });
  expect(screen.getAllByText("Needs review")).toHaveLength(1);
  expect(screen.getByText(/1 hire days/).textContent).toContain("₹2,400 · 1 day needs review");
  expect((screen.getByLabelText(`Hire decision ${nextDate}`) as HTMLSelectElement).value).toBe("");
});
