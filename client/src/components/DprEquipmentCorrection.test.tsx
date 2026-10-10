// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DprEquipmentCompact } from "./DprEquipmentCompact";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const row = {
  persistedId: 741, plantUsageId: 188, equipmentId: 7, machine: "Tandem Roller", vehicleNo: "TS-09-EL-4267",
  entryType: "time_meter", usageStatus: "working" as const, openingReading: 18147.8, closingReading: 18154.3,
  startTime: "", endTime: "", dieselSource: "plant_stock", diesel: 12, openingDiesel: null, dieselBalanceInTank: null,
  resourceScope: "general" as const,
};

describe("submitted DPR historical equipment observations", () => {
  it("keeps both historical tank inputs blank and sends genuine zero separately from null", () => {
    const onChange = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { rerender } = render(<DprEquipmentCompact row={row} historicalCorrection beforeDate="2026-08-29" site="TAKKADPALLY-SIRUR" onChange={onChange} />);
    const opening = screen.getByTestId("equipment-compact-opening-tank-0") as HTMLInputElement;
    const closing = screen.getByTestId("equipment-compact-closing-tank-0") as HTMLInputElement;
    expect(opening.value).toBe("");
    expect(closing.value).toBe("");
    expect(fetch).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(opening, { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith({ openingDiesel: 0 });
    fireEvent.change(closing, { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith({ dieselBalanceInTank: 0 });
    fireEvent.change(opening, { target: { value: "12" } });
    rerender(<DprEquipmentCompact row={{ ...row, openingDiesel: 12 }} historicalCorrection beforeDate="2026-08-29" site="TAKKADPALLY-SIRUR" onChange={onChange} />);
    fireEvent.change(opening, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ openingDiesel: null });
    expect(screen.getByText(/Historical readings may be left blank/)).toBeTruthy();
  });
  it("does not look up or infer missing meter readings when editing submitted facts", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const onChange = vi.fn();
    render(<DprEquipmentCompact row={{ ...row, plantUsageId: null, openingReading: null }} historicalCorrection onChange={onChange} beforeDate="2026-08-29" site="TAKKADPALLY-SIRUR" />);
    expect(fetch).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByTestId("equipment-compact-opening-meter-0") as HTMLInputElement).value).toBe("");
  });
  it("shows actual consumption as unavailable if either tank observation is absent", () => {
    render(<DprEquipmentCompact row={{ ...row, dieselBalanceInTank: 0 }} editable={false} />);
    expect(screen.getByText("Awaiting tank dip")).toBeTruthy();
    expect(screen.getByText(/actual unavailable/)).toBeTruthy();
  });
});
