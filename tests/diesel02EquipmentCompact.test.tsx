// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";
import { DprEquipmentCompact } from "../client/src/components/DprEquipmentCompact";
import { evaluateDprSubmitReadiness } from "../shared/dprSubmitReadiness";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const contractorDailyRow = {
  machine: "DAILY HIRE ROLLER",
  vehicleNo: "UP-01-AB-1234",
  operator: "IMRAN",
  equipmentId: 7,
  entryType: "daily",
  dieselSource: "contractor",
  diesel: 0,
  startTime: "08:00",
  endTime: "17:00",
  openingReading: null,
  closingReading: null,
  openingDiesel: null,
  dieselBalanceInTank: null,
  dieselBalanceConfirmed: false,
};

describe("DIESEL-02 compact DPR equipment capture", () => {
  it("shows meter inputs for a non-plant daily-hire row while keeping tank controls source-gated", () => {
    const onChange = vi.fn();
    const view = render(
      <DprEquipmentCompact
        row={contractorDailyRow}
        equipment={{ ownership: "hired", vendorName: "Fasi Uddin", meterType: "hour_meter" }}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId("equipment-owner-0").textContent).toContain("Hired: Fasi Uddin");
    expect(screen.getAllByTestId("equipment-compact-start-0")).toHaveLength(1);
    expect(screen.getAllByTestId("equipment-compact-end-0")).toHaveLength(1);
    expect(screen.getAllByTestId("equipment-compact-diesel-0")).toHaveLength(1);
    expect(screen.getByTestId("equipment-compact-working-hours-0").textContent).toContain("9.000 h");
    expect(screen.getByTestId("equipment-compact-opening-meter-0")).toBeTruthy();
    expect(screen.getByTestId("equipment-compact-closing-meter-0")).toBeTruthy();
    expect(screen.queryByTestId("equipment-compact-opening-tank-0")).toBeNull();
    expect(screen.queryByTestId("equipment-compact-closing-tank-0")).toBeNull();
    expect(screen.queryByTestId("equipment-compact-tank-confirmed-0")).toBeNull();

    fireEvent.change(screen.getByTestId("equipment-compact-diesel-0"), { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith({ diesel: 12 });

    view.rerender(
      <DprEquipmentCompact
        row={{ ...contractorDailyRow, dieselSource: "direct_purchase" }}
        equipment={{ ownership: "hired", vendorName: "Fasi Uddin", meterType: "hour_meter" }}
        onChange={onChange}
      />,
    );
    expect(screen.queryByTestId("equipment-compact-opening-tank-0")).toBeNull();
    expect(screen.queryByTestId("equipment-compact-closing-tank-0")).toBeNull();
    expect(screen.queryByTestId("equipment-compact-tank-confirmed-0")).toBeNull();
  });

  it.each(["time_meter", "hourly", "daily", "monthly", "trip_based"])(
    "renders opening and closing readings for %s without changing the shared row order",
    entryType => {
      render(
        <DprEquipmentCompact
          row={{ ...contractorDailyRow, entryType }}
          equipment={{ meterType: "hour_meter" }}
          onChange={vi.fn()}
        />,
      );

      const opening = screen.getByTestId("equipment-compact-opening-meter-0");
      const closing = screen.getByTestId("equipment-compact-closing-meter-0");
      const start = screen.getByTestId("equipment-compact-start-0");
      const end = screen.getByTestId("equipment-compact-end-0");
      expect(opening.compareDocumentPosition(closing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(closing.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    },
  );

  it("labels both readings as odometers and keeps distance separate from clock time", () => {
    render(
      <DprEquipmentCompact
        row={{ ...contractorDailyRow, entryType: "monthly", openingReading: 1200, closingReading: 1250 }}
        equipment={{ meterType: "odometer" }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Opening Odometer")).toBeTruthy();
    expect(screen.getByText("Closing Odometer")).toBeTruthy();
    expect(screen.getByTestId("equipment-compact-working-hours-0").textContent).toContain("50.00 km");
    expect(screen.getByText("Clock Duration").parentElement?.textContent).toContain("9 h");
  });

  it("keeps identity visible by default and can suppress only the duplicate identity block", () => {
    const view = render(
      <DprEquipmentCompact
        row={contractorDailyRow}
        equipment={{ ownership: "hired", vendorName: "Fasi Uddin" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("DAILY HIRE ROLLER")).toBeTruthy();
    expect(screen.getByTestId("equipment-owner-0")).toBeTruthy();

    view.rerender(
      <DprEquipmentCompact
        row={contractorDailyRow}
        equipment={{ ownership: "hired", vendorName: "Fasi Uddin" }}
        hideIdentity
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("DAILY HIRE ROLLER")).toBeNull();
    expect(screen.queryByTestId("equipment-owner-0")).toBeNull();
    expect(screen.getByText("Operating")).toBeTruthy();
  });

  it("shows tank observations and confirmation only for editable plant-stock fuel", () => {
    render(
      <DprEquipmentCompact
        row={{ ...contractorDailyRow, entryType: "time_meter", dieselSource: "plant_stock", diesel: 12 }}
        equipment={{ ownership: "hired", vendorName: "Fasi Uddin", meterType: "hour_meter" }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("equipment-compact-diesel-0")).toBeTruthy();
    expect(screen.getByTestId("equipment-compact-opening-tank-0")).toBeTruthy();
    expect(screen.getByTestId("equipment-compact-closing-tank-0")).toBeTruthy();
    expect(screen.getByTestId("equipment-compact-tank-confirmed-0")).toBeTruthy();
  });

  it("keeps the hired vendor and source-gated fuel detail in the read-only model", () => {
    render(
      <DprEquipmentCompact
        row={{ ...contractorDailyRow, diesel: 12 }}
        equipment={{ ownership: "hired", vendorName: "Fasi Uddin", meterType: "hour_meter" }}
        editable={false}
      />,
    );

    expect(screen.getByTestId("equipment-owner-0").textContent).toContain("Hired: Fasi Uddin");
    expect(screen.getByText("Owner / vendor")).toBeTruthy();
    expect(screen.getByText("Diesel Issued / Added")).toBeTruthy();
    expect(screen.queryByText("Opening Tank (L)")).toBeNull();
    expect(screen.queryByText("Closing Tank / Physical Dip (L)")).toBeNull();
    expect(screen.queryByText("Physical Tank Balance")).toBeNull();
  });

  it.each(["contractor", "direct_purchase"] as const)(
    "does not derive %s consumption from stale legacy tank readings",
    (dieselSource) => {
      render(
        <DprEquipmentCompact
          row={{
            ...contractorDailyRow,
            dieselSource,
            diesel: 12,
            openingDiesel: 100,
            dieselBalanceInTank: 85,
            dieselBalanceConfirmed: true,
          }}
          equipment={{ meterType: "hour_meter", consumptionNorm: 1 }}
          editable={false}
        />,
      );

      expect(screen.getByText("Actual Consumed").parentElement?.textContent).toContain("Awaiting tank dip");
      expect(screen.getByText("Variance").parentElement?.textContent).toContain("—");
       expect(screen.getByText("Expected Consumption Rate · from norm, actual unavailable").parentElement?.textContent).toContain("1.00 L/hr");
      expect(screen.queryByText("Physical Tank Balance")).toBeNull();
    },
  );

  it("does not make a contractor Daily Hire row with no meter or tank a submit-readiness blocker at zero or positive diesel", () => {
    for (const diesel of [0, 12]) {
      const readiness = evaluateDprSubmitReadiness({
        equipment: [{ ...contractorDailyRow, diesel, startTime: "", endTime: "" }],
      });
      expect(readiness.mandatory).toEqual([]);
    }
  });

  it("uses the expected norm label when tank readings exist but physical confirmation is absent", () => {
    render(
      <DprEquipmentCompact
        row={{
          ...contractorDailyRow,
          dieselSource: "plant_stock",
          diesel: 12,
          openingDiesel: 100,
          dieselBalanceInTank: 85,
          dieselBalanceConfirmed: false,
          openingReading: 10,
          closingReading: 12,
        }}
        equipment={{ meterType: "hour_meter", consumptionNorm: 4 }}
        editable={false}
      />,
    );

    expect(screen.getByText("Expected Consumption Rate · from norm, actual unavailable")).toBeTruthy();
    expect(screen.getByText("Expected Consumption Rate · from norm, actual unavailable").parentElement?.textContent).toContain("4.00 L/hr");
    expect(screen.getByText("Actual Consumed").parentElement?.textContent).toContain("27.00 L");
    expect(screen.queryByText("Actual Consumption Rate · from confirmed tank dip")).toBeNull();
  });

  it("uses the confirmed tank-dip label for an actual rate", () => {
    render(
      <DprEquipmentCompact
        row={{
          ...contractorDailyRow,
          dieselSource: "plant_stock",
          diesel: 12,
          openingDiesel: 100,
          dieselBalanceInTank: 85,
          dieselBalanceConfirmed: true,
          openingReading: 10,
          closingReading: 12,
        }}
        equipment={{ meterType: "hour_meter", consumptionNorm: 4 }}
        editable={false}
      />,
    );

    expect(screen.getByText("Actual Consumption Rate · from confirmed tank dip")).toBeTruthy();
    expect(screen.getByText("Actual Consumption Rate · from confirmed tank dip").parentElement?.textContent).toContain("13.50 L/hr");
  });

  it("uses the trip efficiency unit when falling back to an hour-meter norm", () => {
    render(
      <DprEquipmentCompact
        row={{ ...contractorDailyRow, entryType: "trip_based", numberOfTrips: 2, tripDistance: 10 }}
        equipment={{ meterType: "hour_meter", consumptionNorm: 5 }}
        editable={false}
      />,
    );

    expect(screen.getByText("Expected Consumption Rate · from norm, actual unavailable").parentElement?.textContent).toContain("0.20 L/km");
  });

  it("renders a pre-existing daily row's stored meter readings and norm without backfill", () => {
    render(
      <DprEquipmentCompact
        row={{
          ...contractorDailyRow,
          entryType: "daily",
          openingReading: 412,
          closingReading: 419,
          startTime: "",
          endTime: "",
          dieselSource: "contractor",
        }}
        equipment={{ meterType: "hour_meter", consumptionNorm: 3.5 }}
        editable={false}
      />,
    );

    expect(screen.getByText("Opening Meter").parentElement?.textContent).toContain("412");
    expect(screen.getByText("Closing Meter").parentElement?.textContent).toContain("419");
    expect(screen.getByText("Expected Consumption Rate · from norm, actual unavailable").parentElement?.textContent).toContain("3.50 L/hr");
  });

  it("uses a historical trip snapshot's stored distance for a confirmed rate", () => {
    render(
      <DprEquipmentCompact
        row={{
          ...contractorDailyRow,
          entryType: "trip_based",
          dieselSource: "plant_stock",
          openingReading: 100,
          closingReading: 106,
          totalKm: 40,
          diesel: 20,
          openingDiesel: 100,
          dieselBalanceInTank: 100,
          dieselBalanceConfirmed: true,
        }}
        equipment={{ meterType: "hour_meter", consumptionNorm: 5 }}
        editable={false}
      />,
    );

    expect(screen.getByText("Actual Consumption Rate · from confirmed tank dip").parentElement?.textContent).toContain("0.50 L/km");
    expect(screen.getByText("Actual Consumption Rate · from confirmed tank dip").parentElement?.textContent).not.toContain("3.33 L/km");
  });

  it("uses the master norm in the stored distance unit when a historical trip dip is unconfirmed", () => {
    render(
      <DprEquipmentCompact
        row={{
          ...contractorDailyRow,
          entryType: "trip_based",
          dieselSource: "plant_stock",
          openingReading: 100,
          closingReading: 106,
          totalKm: 40,
          diesel: 20,
          openingDiesel: 100,
          dieselBalanceInTank: 100,
          dieselBalanceConfirmed: false,
        }}
        equipment={{ meterType: "hour_meter", consumptionNorm: 5 }}
        editable={false}
      />,
    );

    expect(screen.getByText("Expected Consumption Rate · from norm, actual unavailable").parentElement?.textContent).toContain("0.20 L/km");
  });

  it("never requests a tank continuity opening for a contractor row", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <DprEquipmentCompact
        row={contractorDailyRow}
        equipment={{ ownership: "hired", vendorName: "Fasi Uddin" }}
        beforeDate="2026-09-01"
        site="SITE A"
        onChange={vi.fn()}
      />,
    );

    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps diesel immutable for an equipment row linked to a plant dispatch", () => {
    render(
      <DprEquipmentCompact
        row={{ ...contractorDailyRow, plantUsageId: 42, diesel: 12 }}
        equipment={{ ownership: "hired", vendorName: "Fasi Uddin" }}
        onChange={vi.fn()}
      />,
    );

    const dieselInput = screen.getByTestId("equipment-compact-diesel-0") as HTMLInputElement;
    expect(dieselInput.disabled).toBe(true);
  });

  it("allows an authenticated admin correction of linked meter, time, and diesel facts", () => {
    render(
      <DprEquipmentCompact
        row={{ ...contractorDailyRow, plantUsageId: 42, diesel: 12 }}
        equipment={{ ownership: "hired", vendorName: "Fasi Uddin" }}
        allowLinkedSourceEdit
        onChange={vi.fn()}
      />,
    );

    expect((screen.getByTestId("equipment-compact-opening-meter-0") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByTestId("equipment-compact-start-0") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByTestId("equipment-compact-diesel-0") as HTMLInputElement).disabled).toBe(false);
  });

  it("removes the old detailed and guided duplicate input nodes rather than merely collapsing them", () => {
    const detailed = fs.readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
    const guided = fs.readFileSync("client/src/pages/GuidedDpr.tsx", "utf8");

    for (const source of [detailed, guided]) {
      expect(source).not.toContain("input-equipment-start-${idx}");
      expect(source).not.toContain("input-equipment-end-${idx}");
      expect(source).not.toContain("input-equipment-opening-${idx}");
      expect(source).not.toContain("input-equipment-closing-${idx}");
      expect(source).not.toContain("input-equipment-diesel-${idx}");
      expect(source).not.toContain("input-eq-opening-${i}");
      expect(source).not.toContain("input-eq-closing-${i}");
      expect(source).not.toContain("input-eq-start-${i}");
      expect(source).not.toContain("input-eq-end-${i}");
      expect(source).not.toContain("input-eq-diesel-${i}");
    }
    expect(detailed).not.toContain("EquipmentTankBalanceInputs");
    expect(detailed).not.toContain("showTankBalance={false}");
  });
});