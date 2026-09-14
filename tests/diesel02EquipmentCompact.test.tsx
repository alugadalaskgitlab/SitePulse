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
  it("keeps one editable diesel input for non-plant daily-hire rows and mounts no meter or tank controls", () => {
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
    expect(screen.queryByTestId("equipment-compact-opening-meter-0")).toBeNull();
    expect(screen.queryByTestId("equipment-compact-closing-meter-0")).toBeNull();
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
      expect(screen.getByText("Actual Consumption Rate").parentElement?.textContent).toContain("—");
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