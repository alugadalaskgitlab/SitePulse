// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DprEquipmentCompact, type DprEquipmentFields } from "../client/src/components/DprEquipmentCompact";

afterEach(cleanup);

const plantRow: DprEquipmentFields = {
  machine: "EXCAVATOR", vehicleNo: "FIX-01", operator: "RAVI", entryType: "time_meter",
  openingReading: 100, closingReading: 106, startTime: "08:00", endTime: "16:00",
  dieselSource: "plant_stock", openingDiesel: 30, diesel: 20,
  dieselBalanceInTank: 25, dieselBalanceConfirmed: true,
  usageStatus: "idle_no_work", usageStatusReason: "Rain stopped work",
};

const valueFor = (label: string) => screen.getByText(label, { exact: true }).parentElement?.textContent;

describe("DPR16 B3 shared read-only equipment card", () => {
  it("shows each usage figure once, retaining distinct meter runtime, clock, tank and fuel calculations", () => {
    const onChange = vi.fn();
    const { container } = render(<DprEquipmentCompact row={plantRow} equipment={{ meterType: "hour_meter", consumptionNorm: 5 }} editable={false} onChange={onChange} />);
    expect(screen.queryByText("Usage Summary")).toBeNull();
    expect(screen.getAllByText("Meter Working Hours")).toHaveLength(1);
    expect(screen.getAllByText("Clock Duration")).toHaveLength(1);
    expect(screen.getByTestId("equipment-compact-readonly-0").querySelectorAll(".grid")).toHaveLength(4);
    expect(valueFor("Opening Meter")).toContain("100");
    expect(valueFor("Closing Meter")).toContain("106");
    expect(valueFor("Start Time")).toContain("8:00 AM");
    expect(valueFor("End Time")).toContain("4:00 PM");
    expect(valueFor("Meter Working Hours")).toContain("6.00 h");
    expect(valueFor("Clock Duration")).toContain("8 h");
    expect(valueFor("Diesel Issued / Added")).toContain("20.00 L");
    expect(valueFor("Diesel Source")).toContain("plant stock");
    expect(valueFor("Opening Tank (L)")).toContain("30.00 L");
    expect(valueFor("Closing Tank / Physical Dip (L)")).toContain("25.00 L");
    expect(valueFor("Physical Tank Balance")).toContain("Confirmed");
    expect(valueFor("Actual Consumed")).toContain("25.00 L");
    expect(valueFor("Expected")).toContain("30.00 L");
    expect(valueFor("Variance")).toContain("-5.00 L");
    expect(valueFor("Actual Consumption Rate · from confirmed tank dip")).toContain("4.17 L/hr");
    expect(screen.getAllByText("Idle · No Work Available")).toHaveLength(2);
    expect(valueFor("Status Reason")).toContain("Rain stopped work");
    expect(screen.getByText("EXCAVATOR")).toBeTruthy();
    expect(screen.getByText(/FIX-01 · RAVI/)).toBeTruthy();
    expect(container.querySelectorAll("input, select, textarea, button, [role=checkbox]")).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps unconfirmed status, norm fallback, absent readings and tank dip visible without edit controls", () => {
    const { container } = render(<DprEquipmentCompact row={{
      machine: "ROLLER", dieselSource: "plant_stock", openingDiesel: 12,
      dieselBalanceConfirmed: false,
    }} equipment={{ meterType: "hour_meter", consumptionNorm: 4 }} editable={false} />);
    expect(screen.getAllByText("Meter Working Hours")).toHaveLength(1);
    expect(screen.getAllByText("Clock Duration")).toHaveLength(1);
    expect(valueFor("Meter Working Hours")).toContain("—");
    expect(valueFor("Clock Duration")).toContain("—");
    expect(valueFor("Opening Meter")).toContain("—");
    expect(valueFor("Diesel Issued / Added")).toContain("— L");
    expect(valueFor("Closing Tank / Physical Dip (L)")).toContain("— L");
    expect(valueFor("Physical Tank Balance")).toContain("Pending confirmation");
    expect(valueFor("Actual Consumed")).toContain("Awaiting tank dip");
    expect(valueFor("Expected")).toContain("—");
    expect(valueFor("Expected Consumption Rate · from norm, actual unavailable")).toContain("4.00 L/hr");
    expect(valueFor("Daily Status")).toContain("Not specified");
    expect(screen.getByText("Physical tank balance has not been confirmed.")).toBeTruthy();
    expect(container.querySelectorAll("input, select, textarea, button, [role=checkbox]")).toHaveLength(0);
  });

  it("renders odometer distance once, with non-plant diesel and no invented tank or performance", () => {
    render(<DprEquipmentCompact row={{
      machine: "TRUCK", openingReading: 100, closingReading: 125,
      startTime: "09:00", endTime: "12:00", diesel: 7, dieselSource: "contractor",
      openingDiesel: 50, dieselBalanceInTank: 40,
    }} equipment={{ meterType: "odometer", consumptionNorm: 0.3 }} editable={false} />);
    expect(screen.getAllByText("Distance", { exact: true })).toHaveLength(1);
    expect(screen.getAllByText("Clock Duration")).toHaveLength(1);
    expect(valueFor("Distance")).toContain("25.00 km");
    expect(valueFor("Clock Duration")).toContain("3 h");
    expect(valueFor("Diesel Issued / Added")).toContain("7.00 L");
    expect(screen.queryByText("Opening Tank (L)")).toBeNull();
    expect(screen.queryByText("Fuel Performance")).toBeNull();
  });

  it("does not alter classic editable inputs or the existing tank confirmation handler", () => {
    const onChange = vi.fn();
    render(<DprEquipmentCompact row={plantRow} equipment={{ meterType: "hour_meter" }} onChange={onChange} />);
    expect(screen.queryByTestId("equipment-compact-readonly-0")).toBeNull();
    expect(screen.getByTestId("equipment-compact-working-hours-0")).toBeTruthy();
    expect(screen.getByTestId("equipment-compact-opening-meter-0")).toBeTruthy();
    expect(screen.getByTestId("equipment-compact-tank-confirmed-0")).toBeTruthy();
    fireEvent.click(screen.getByTestId("equipment-compact-tank-confirmed-0"));
    expect(onChange).toHaveBeenCalledWith({ dieselBalanceConfirmed: false });
  });
});