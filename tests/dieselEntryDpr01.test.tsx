// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import fs from "node:fs";
import { EquipmentTankBalanceInputs } from "../client/src/components/EquipmentTankBalanceInputs";
import { DprEquipmentCompact } from "../client/src/components/DprEquipmentCompact";
import { transitionDieselSource, validateDieselTankBalance } from "../shared/dieselEntryValidation";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DIESEL-01 tank validation", () => {
  it("requires both plant-stock readings but accepts explicit zero", () => {
    expect(validateDieselTankBalance({ diesel: 10, dieselSource: "plant_stock" }, "ROLLER")).toContain("ROLLER");
    expect(validateDieselTankBalance({
      diesel: 10,
      dieselSource: "plant_stock",
      openingDiesel: 0,
      dieselBalanceInTank: 0,
    }, "ROLLER")).toBeNull();
    expect(validateDieselTankBalance({
      diesel: 10,
      dieselSource: "plant_stock",
      openingDiesel: -1,
      dieselBalanceInTank: 4,
    }, "ROLLER")).toContain("non-negative");
  });

  it("does not force tanks for zero, direct-purchase, or contractor rows", () => {
    expect(validateDieselTankBalance({ diesel: 0, dieselSource: "plant_stock" }, "ROLLER")).toBeNull();
    expect(validateDieselTankBalance({ diesel: 10, dieselSource: "direct_purchase" }, "ROLLER")).toBeNull();
    expect(validateDieselTankBalance({ diesel: 10, dieselSource: "contractor" }, "ROLLER")).toBeNull();
  });

  it("clears newly entered tank fields when the source is explicitly switched away", () => {
    const plantRow = {
      dieselSource: "plant_stock",
      openingDiesel: 12,
      dieselBalanceInTank: 9,
      dieselBalanceConfirmed: true,
    };
    expect(transitionDieselSource(plantRow, "direct_purchase")).toMatchObject({
      dieselSource: "direct_purchase",
      openingDiesel: null,
      dieselBalanceInTank: null,
      dieselBalanceConfirmed: false,
    });
    // Hydrating an already-direct historical row is not a source change and
    // therefore remains non-destructive.
    expect(transitionDieselSource({
      dieselSource: "direct_purchase",
      openingDiesel: 30,
      dieselBalanceInTank: 25,
      dieselBalanceConfirmed: true,
    }, "direct_purchase")).toMatchObject({
      openingDiesel: 30,
      dieselBalanceInTank: 25,
      dieselBalanceConfirmed: true,
    });
  });
});

describe("DIESEL-01 tank controls", () => {
  it("records zero readings and confirmation without truthiness loss", () => {
    const onChange = vi.fn();
    render(
      <EquipmentTankBalanceInputs
        index={0}
        openingDiesel={null}
        dieselBalanceInTank={null}
        dieselBalanceConfirmed={false}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("input-opening-diesel-0"), { target: { value: "0" } });
    fireEvent.change(screen.getByTestId("input-diesel-balance-0"), { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("checkbox-diesel-balance-confirmed-0"));

    expect(onChange).toHaveBeenNthCalledWith(1, { openingDiesel: 0 });
    expect(onChange).toHaveBeenNthCalledWith(2, { dieselBalanceInTank: 0 });
    expect(onChange).toHaveBeenNthCalledWith(3, { dieselBalanceConfirmed: true });
  });

  it("clears the mounted panel state on a real plant-stock to direct-purchase switch", () => {
    function SourcePanel() {
      const [row, setRow] = useState({
        dieselSource: "plant_stock",
        openingDiesel: 12 as number | null,
        dieselBalanceInTank: 9 as number | null,
        dieselBalanceConfirmed: true,
      });
      return (
        <div>
          <select
            data-testid="source-switch"
            value={row.dieselSource}
            onChange={(event) => setRow((current) => transitionDieselSource(current, event.target.value))}
          >
            <option value="plant_stock">Plant Stock</option>
            <option value="direct_purchase">Direct Site Purchase</option>
            <option value="contractor">Contractor</option>
          </select>
          {row.dieselSource === "plant_stock" && (
            <EquipmentTankBalanceInputs
              index={0}
              openingDiesel={row.openingDiesel}
              dieselBalanceInTank={row.dieselBalanceInTank}
              dieselBalanceConfirmed={row.dieselBalanceConfirmed}
              onChange={(patch) => setRow((current) => ({ ...current, ...patch }))}
            />
          )}
          <output data-testid="source-switch-state">
            {`${row.openingDiesel}|${row.dieselBalanceInTank}|${row.dieselBalanceConfirmed}`}
          </output>
        </div>
      );
    }

    render(<SourcePanel />);
    expect(screen.getByTestId("equipment-tank-balance-0")).toBeTruthy();
    fireEvent.change(screen.getByTestId("source-switch"), { target: { value: "direct_purchase" } });
    expect(screen.queryByTestId("equipment-tank-balance-0")).toBeNull();
    expect(screen.getByTestId("source-switch-state").textContent).toBe("null|null|false");
    fireEvent.change(screen.getByTestId("source-switch"), { target: { value: "plant_stock" } });
    expect(screen.getByTestId("equipment-tank-balance-0")).toBeTruthy();
    expect((screen.getByTestId("input-opening-diesel-0") as HTMLInputElement).value).toBe("");
  });

  it("gates tank continuity when a row switches away from plant stock", async () => {
    const onChange = vi.fn();
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ dieselBalanceInTank: 12 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const row = {
      machine: "ROLLER",
      equipmentId: 7,
      dieselSource: "contractor",
      openingReading: 1,
      closingReading: 2,
      openingDiesel: null,
      dieselBalanceInTank: null,
      diesel: 4,
      startTime: "08:00",
      endTime: "10:00",
    };
    const view = render(
      <DprEquipmentCompact
        row={row}
        equipment={{ meterType: "hour_meter", consumptionNorm: 2 }}
        beforeDate="2026-03-01"
        site="SITE A"
        showTankBalance={false}
        enableTankContinuity={false}
        onChange={onChange}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchSpy).not.toHaveBeenCalled();

    view.rerender(
      <DprEquipmentCompact
        row={{ ...row, dieselSource: "plant_stock" }}
        equipment={{ meterType: "hour_meter", consumptionNorm: 2 }}
        beforeDate="2026-03-01"
        site="SITE A"
        showTankBalance={false}
        enableTankContinuity
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({ openingDiesel: 12 });
  });
});

describe("DIESEL-01 DPR wiring", () => {
  it("keeps source-specific controls and validation on every DPR save path", () => {
    const entry = fs.readFileSync("client/src/pages/SiteEntry.tsx", "utf8");
    const edit = fs.readFileSync("client/src/pages/SiteEdit.tsx", "utf8");

    expect(entry).toContain('entry.dieselSource === "plant_stock"');
    expect(entry).toContain("contractorDieselTankFieldsCleared");
    expect(entry).toContain("validateDieselBeforeSave");
    expect(entry).toContain("enableTankContinuity={entry.dieselSource === \"plant_stock\"}");
    expect(edit).toContain('entry.dieselSource === "plant_stock"');
    expect(edit).toContain("contractorDieselTankFieldsCleared");
    expect(edit).toContain("validateDieselBeforeSave");
    expect(edit).toContain("enableTankContinuity={entry.dieselSource === \"plant_stock\"}");
  });
});