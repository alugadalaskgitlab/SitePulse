// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HireBillTermsEditor } from "./HireBillTermsEditor";
import { HireBillActivityReview } from "./HireBillActivityReview";
import { TripDailyHireReview } from "@/components/TripDailyHireReview";
import { defaultBillHireTerms } from "./hireBillTerms";

afterEach(cleanup);
const group = {
  id: "charge-23", equipmentId: 23,
  ...defaultBillHireTerms({ hireBillingBasis: "daily", hireRate: 5000 }, "2026-06-02", "2026-06-12"),
  dailyDecisions: [], tripDecisions: [], exceptionDecisions: [],
};

describe("equipment hire terms editor", () => {
  it("shows agreed terms, rate unit, quantity, unit and gross calculation", () => {
    render(<HireBillTermsEditor group={group} equipmentName="TN 47 BG 2641" result={{ quantity: 8.5, grossAmount: 42500 }} onChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByLabelText("Hire Rate (₹/Day)")).toBeTruthy();
    expect(screen.getByText("8.5")).toBeTruthy();
    expect(screen.getByText("Days")).toBeTruthy();
    expect(screen.getByText("₹42,500.00")).toBeTruthy();
  });
  it("coerces edited rate to a number and wires individual periods and removal", () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();
    render(<HireBillTermsEditor group={group} equipmentName="TN 47 BG 2641" result={null} onChange={onChange} onRemove={onRemove} />);
    fireEvent.change(screen.getByLabelText("Hire Rate (₹/Day)"), { target: { value: "4750" } });
    expect(onChange).toHaveBeenCalledWith({ rate: 4750 });
    fireEvent.change(screen.getByLabelText("Billing Period From"), { target: { value: "2026-06-04" } });
    expect(onChange).toHaveBeenCalledWith({ periodFrom: "2026-06-04" });
    fireEvent.click(screen.getByRole("button", { name: "Remove equipment charge" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
  it("shows a positive-rate error and requires fresh activity review after commercial edits", () => {
    const onChange = vi.fn();
    render(<HireBillTermsEditor group={{ ...group, rate: 0, activityReviewRequired: true }} equipmentName="TN 47 BG 2641" result={null} onChange={onChange} onRemove={vi.fn()} />);
    expect(screen.getByText("Enter a positive rate for this bill.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm activity review" }));
    expect(onChange).toHaveBeenCalledWith({ activityReviewRequired: false });
  });
});

describe("basis-specific operational evidence", () => {
  const activities = [
    { source: "site_material_trip", sourceId: 71, equipmentId: 23, businessDate: "2026-06-02", entryType: "trip_based",
      numberOfTrips: 3, requiresTripReview: true, confirmedForDailyHire: true },
    { source: "site_material_trip", sourceId: 72, equipmentId: 23, businessDate: "2026-06-02", entryType: "trip_based",
      numberOfTrips: 2, requiresTripReview: true, confirmedForDailyHire: true },
  ];
  it("daily review reads confirmed trip_based evidence, combines same-date trips and requests a reason", () => {
    const onChange = vi.fn();
    render(<TripDailyHireReview group={group} equipment={{ name: "Tipper", registrationNumber: "TN 47 BG 2641" }}
      result={{ payableDays: [{ date: "2026-06-02", fraction: 1 }], quantity: 1, grossAmount: 5000 }}
      activities={activities} onChange={onChange} onRemove={vi.fn()} />);
    expect(screen.getAllByLabelText("Hire decision 2026-06-02")).toHaveLength(1);
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("1 day needs review", { exact: false })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Hire decision 2026-06-02"), { target: { value: "half_day" } });
    expect(onChange).toHaveBeenCalledWith({ dailyDecisions: [{ date: "2026-06-02", decision: "half_day", reason: "" }] });
  });
  it("blocks a previously billed date until an explicit excluded decision and reason", () => {
    render(<TripDailyHireReview group={group} equipment={{ name: "Tipper" }} activities={activities}
      result={{ payableDays: [{ date: "2026-06-02", fraction: 1 }] }}
      billedDays={[{ date: "2026-06-02", billNo: "VB-2026-041" }]} onChange={vi.fn()} onRemove={vi.fn()} />);
    expect((screen.getByRole("option", { name: "Full day (1)" }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.getByText("VB-2026-041")).toBeTruthy();
    expect(screen.getByText("Select Excluded and enter a reason.")).toBeTruthy();
  });
  it("trip decisions preserve source-qualified identities and demand counterpart reconciliation", () => {
    const onChange = vi.fn();
    render(<HireBillActivityReview group={{ ...group, basis: "trip" }} activities={[
      activities[0],
      { source: "plant_usage", sourceId: 81, equipmentId: 23, businessDate: "2026-06-02", entryType: "trip_based", numberOfTrips: 3 },
    ]} result={{ exceptions: [] }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Trip decision site_material_trip 71"), { target: { value: "accept" } });
    expect(onChange).toHaveBeenCalledWith({ tripDecisions: [{ source: "site_material_trip", sourceId: 71, selected: true }] });
    expect(screen.getByText("Separate from same-day operational trip")).toBeTruthy();
  });
  it("hourly evidence never substitutes trip counts for missing actual hours", () => {
    render(<HireBillActivityReview group={{ ...group, basis: "hourly" }} activities={activities} result={{ exceptions: [] }} onChange={vi.fn()} />);
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText("Only actual recorded working hours are used.", { exact: false })).toBeTruthy();
  });
});
