// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DprEquipmentCompact } from "../client/src/components/DprEquipmentCompact";
import { EquipmentTankBalanceInputs } from "../client/src/components/EquipmentTankBalanceInputs";
import { CutFillOutcomeControls } from "../client/src/components/CutFillOutcomeControls";
import { DprSectionGeometryGrid } from "../client/src/components/DprSectionGeometryGrid";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("DPR16 B1 rendered section-only presentation", () => {
  it("places eight geometry controls in one desktop grid; UOM remains separately editable", () => {
    const fields = ["side", "from", "to", "length", "width", "thickness", "layer-no", "qty"];
    const { container } = render(<div>
      <DprSectionGeometryGrid condensed index={3}>
        {fields.map(name => <div key={name}><input data-testid={`input-progress-${name}-3`} aria-label={name} /></div>)}
      </DprSectionGeometryGrid>
      <select data-testid="select-progress-uom-3" aria-label="UOM"><option>CUM</option><option>SQM</option></select>
    </div>);
    const row = screen.getByTestId("section-geometry-3");
    expect(row.className).toContain("xl:grid-cols-8");
    expect(row.children).toHaveLength(8);
    expect([...row.children].map(child => child.querySelector("input")?.getAttribute("aria-label"))).toEqual(fields);
    expect(container.querySelector('[data-testid="select-progress-uom-3"]')?.parentElement).toBe(row.parentElement);
    fireEvent.change(screen.getByTestId("select-progress-uom-3"), { target: { value: "SQM" } });
    expect((screen.getByTestId("select-progress-uom-3") as HTMLSelectElement).value).toBe("SQM");
  });
  it("renders one stat grid, retains existing meter and tank handlers, without changing default mode", () => {
    const row = { machine: "Excavator", equipmentId: null, openingReading: 100, closingReading: 106,
      startTime: "08:00", endTime: "16:00", dieselSource: "plant_stock", diesel: 20,
      openingDiesel: 30, dieselBalanceInTank: 25, dieselBalanceConfirmed: false };
    function Harness() {
      const [value, setValue] = useState(row);
      const patch = (update: any) => setValue(old => ({ ...old, ...update }));
      return <>
        <DprEquipmentCompact row={value} equipment={{ meterType: "hour_meter" }} sectionPresentation showTankBalance={false} onChange={patch} />
        <EquipmentTankBalanceInputs index={0} sectionPresentation openingDiesel={value.openingDiesel} dieselBalanceInTank={value.dieselBalanceInTank}
          dieselBalanceConfirmed={value.dieselBalanceConfirmed} dieselIssued={value.diesel}
          expectedDiesel={10} runtime={6} onChange={patch} />
      </>;
    }
    render(<Harness />);
    const grid = screen.getByTestId("section-equipment-summary-0");
    expect(grid.children).toHaveLength(4);
    expect(grid.textContent).toContain("6.000 h");
    expect(grid.textContent).toContain("8 h");
    expect(grid.textContent).toContain("20.00 L");
    expect(screen.getAllByText("Clock duration")).toHaveLength(1);
    expect(screen.queryByTestId("equipment-compact-working-hours-0")).toBeNull();
    expect(screen.queryByTestId("equipment-compact-opening-tank-0")).toBeNull();
    const tank = screen.getByTestId("input-diesel-balance-0");
    expect(tank).toBeTruthy();
    expect(screen.getByTestId("panel-consumption-incomplete-0").textContent).toContain("Incomplete — tank balance not confirmed");
    expect(screen.queryByTestId("panel-actual-consumption-0")).toBeNull();
    expect(screen.queryByTestId("text-actual-l-per-hr-0")).toBeNull();
    fireEvent.click(screen.getByTestId("checkbox-diesel-balance-confirmed-0"));
    expect(grid.textContent).toContain("Confirmed");
    expect(screen.queryByTestId("panel-consumption-incomplete-0")).toBeNull();
    expect(screen.getByTestId("text-actual-consumption-0").textContent).toBe("25.000");
    expect(screen.getByTestId("text-actual-l-per-hr-0").textContent).toBe("4.167");
    fireEvent.click(screen.getByTestId("checkbox-diesel-balance-confirmed-0"));
    expect(screen.getByTestId("panel-consumption-incomplete-0").textContent).toContain("tank balance not confirmed");
    expect(screen.queryByTestId("panel-actual-consumption-0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Excavator" }));
    expect(screen.getAllByText("Clock duration")).toHaveLength(1);
    expect(screen.getByTestId("equipment-compact-closing-meter-0")).toBeTruthy();
    fireEvent.change(screen.getByTestId("equipment-compact-closing-meter-0"), { target: { value: "107" } });
    expect(grid.textContent).toContain("7.000 h");
    cleanup();
    render(<DprEquipmentCompact row={row} equipment={{ meterType: "hour_meter" }} onChange={vi.fn()} />);
    expect(screen.queryByTestId("section-equipment-summary-0")).toBeNull();
    expect(screen.getByTestId("equipment-compact-working-hours-0")).toBeTruthy();
  });

  it("leaves default tank controls' unconfirmed consumption display unchanged", () => {
    render(<EquipmentTankBalanceInputs index={2} openingDiesel={30} dieselIssued={20}
      dieselBalanceInTank={25} dieselBalanceConfirmed={false} runtime={6} onChange={vi.fn()} />);
    expect(screen.getByTestId("text-actual-consumption-2").textContent).toBe("25.000");
    expect(screen.getByTestId("text-actual-l-per-hr-2").textContent).toBe("4.167");
    expect(screen.queryByTestId("panel-consumption-incomplete-2")).toBeNull();
  });

  it("calls the existing receipt source view only, never claims editable source selection", async () => {
    const onViewSource = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => new Response(JSON.stringify(
      String(input).includes("earthwork-arrangements/11")
        ? { id: 11, arrangementType: "reused_excavated", sourceExcavationBoqItemId: 7, sourceExcavationBoqItemLabel: "ROADWAY EXCAVATION" }
        : String(input).includes("cut-fill-sources") ? { sources: [] } : { openingBalances: [] },
    ), { headers: { "Content-Type": "application/json" } })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>
      <CutFillOutcomeControls fillMode condensedFill onViewSource={onViewSource} arrangementId={11} projectId={1}
        boqItemDescription="EMBANKMENT FILL" quantity={12} outcome={null} reusableQty={null}
        onOutcomeChange={vi.fn()} />
    </QueryClientProvider>);
    await waitFor(() => expect(screen.getByText("ROADWAY EXCAVATION")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View source" }));
    expect(onViewSource).toHaveBeenCalledTimes(1);
  });
});