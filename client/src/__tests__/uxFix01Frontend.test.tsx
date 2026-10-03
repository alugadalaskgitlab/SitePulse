// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { isFilledLabourRow } from "@shared/labourEntry";
import { DprEquipmentCompact, type DprEquipmentFields } from "@/components/DprEquipmentCompact";
import { BreakdownStoppageEditor, newStagedBreakdown, type StagedBreakdown } from "@/components/BreakdownStoppageEditor";
import { LabourWorkerNames, prepareLabourWorkerRow } from "@/components/LabourWorkerNames";
import { LabourContractorInput, LabourHoursInput } from "@/components/LabourEntryFields";
import { mapDprToFormState } from "@/pages/SiteEdit";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
const base: DprEquipmentFields = {
  machine: "Tandem roller", entryType: "daily", dieselSource: "contractor",
  openingReading: 1011, closingReading: 1017, startTime: "10:30", endTime: "16:30",
  usageStatus: "working", task: "Subgrade cutting Ch 2+100 to 2+300", breakdowns: [],
};

describe("UX-FIX-01 equipment and labour entry", () => {
  it("places Task beside Status, meter and clock values in readings, General after work allocation, with no expanded summary", () => {
    render(<DprEquipmentCompact row={base} sectionPresentation onChange={vi.fn()}
      equipmentPickerSlot={<span>Equipment picker</span>} ownerTypeSlot={<span>Operator / entry type</span>}
      stoppageSlot={<BreakdownStoppageEditor value={[]} onChange={vi.fn()} />} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Tandem roller" }));
    expect(screen.queryByTestId("section-equipment-summary-0")).toBeNull();
    const task = screen.getByLabelText("Task / work done") as HTMLInputElement;
    expect(task.tagName).toBe("INPUT");
    expect(task.value).toBe(base.task);
    expect(task.closest("section")).toBe(screen.getByTestId("equipment-compact-usage-status-0").closest("section"));
    const readings = screen.getByTestId("equipment-compact-group-readings-0");
    expect(within(readings).getAllByText("6.0 h")).toHaveLength(2);
    expect(within(readings).getByText("Meter hours")).toBeTruthy();
    expect(within(readings).getByText("Clock time")).toBeTruthy();
    expect(screen.getByTestId("equipment-general-0").closest("section")).toBe(screen.getByTestId("equipment-compact-group-work-0"));
    expect(screen.queryByText(/Master default hire type|Effective hire|Physical work segments/)).toBeNull();
    expect(screen.queryByText("Non-BOQ / Incidental Work (optional)")).toBeNull();
    expect(screen.queryByText("01 / Equipment picker")).toBeNull();
  });

  it("shows legacy null as Not recorded without changing saved values", () => {
    const change = vi.fn();
    render(<DprEquipmentCompact row={{ ...base, persistedId: 47, usageStatus: null }} sectionPresentation onChange={change} />);
    expect(screen.getByTestId("equipment-compact-status-chip-0").textContent).toContain("Not recorded");
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Expand Tandem roller" }));
    expect(screen.getByTestId("equipment-compact-usage-status-0").textContent).toContain("Not recorded");
    expect(change).not.toHaveBeenCalled();
  });

  it("preserves the incidental task column and General confirmation contract", () => {
    const change = vi.fn();
    const assignment = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DprEquipmentCompact row={{ ...base, activitySegments: [{ startTime: "10:30", endTime: "16:30", boqItems: [{ boqItemId: 9 }] }] }}
      boqItems={[{ id: 9, displayName: "Subgrade" }]} onChange={change} onWorkAssignmentChange={assignment} />);
    fireEvent.change(screen.getByLabelText("Task / work done"), { target: { value: "Existing incidental text edited" } });
    expect(change).toHaveBeenCalledWith({ task: "Existing incidental text edited" });
    change.mockClear();
    fireEvent.click(screen.getByTestId("equipment-general-0"));
    expect(confirm).toHaveBeenCalledWith("Mark General / not item-specific? This removes this machine's work assignments. Its hours and readings will not change.");
    expect(change).not.toHaveBeenCalled();
    expect(assignment).not.toHaveBeenCalled();
  });

  it("breakdown status expands details without creating a stoppage until the engineer taps Add", () => {
    const change = vi.fn();
    render(<DprEquipmentCompact row={{ ...base, usageStatus: "breakdown" }} sectionPresentation onChange={change}
      stoppageSlot={<BreakdownStoppageEditor value={[]} usageStatus="breakdown" onChange={change} />} />);
    expect(screen.getByRole("button", { name: "Add breakdown details (time, whose cost, photo)" })).toBeTruthy();
    expect(screen.queryByTestId("breakdown-from-0")).toBeNull();
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("breakdown-add"));
    expect(change.mock.calls[0][0]).toHaveLength(1);
    expect(change.mock.calls[0][0][0].fromTime).toBe("");
    expect(change.mock.calls[0][0][0].toTime).toBe("");
  });

  it("choosing Breakdown sets only existing status/default fields and creates no breakdown row", () => {
    const change = vi.fn();
    render(<DprEquipmentCompact row={{ ...base, closingReading: null, diesel: null }} onChange={change} />);
    fireEvent.keyDown(screen.getByTestId("equipment-compact-usage-status-0"), { key: "ArrowDown" });
    expect(screen.queryByRole("option", { name: /Not specified|Not recorded/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Breakdown" }));
    expect(change).toHaveBeenCalledWith({ usageStatus: "breakdown", closingReading: 1011, diesel: 0 });
    expect(change.mock.calls.some(([patch]) => "breakdowns" in patch)).toBe(false);
  });

  it("keeps all breakdown storage fields, presents one decimal, and tucks remarks under More", () => {
    const row: StagedBreakdown = { ...newStagedBreakdown(), fromTime: "13:00", toTime: "14:30", description: "Hydraulic hose burst",
      responsibility: "vendor", repairScope: "hlc", debitableToVendor: true, remarks: "Stored remarks",
      attachment: { fileName: "hose.jpg", objectPath: "/objects/hose.jpg" } };
    const change = vi.fn();
    render(<BreakdownStoppageEditor value={[row]} onChange={change} />);
    expect(screen.getByText("1.5 h")).toBeTruthy();
    expect(screen.getByText("Repair cost by")).toBeTruthy();
    expect(screen.getByText("Deduct from hire bill?")).toBeTruthy();
    expect((screen.getByTestId("breakdown-debitable-0") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("breakdown-remarks-0") as HTMLTextAreaElement).value).toBe("Stored remarks");
    expect(screen.getByTestId("breakdown-remarks-0").closest("details")?.open).toBe(false);
    fireEvent.change(screen.getByTestId("breakdown-reason-0"), { target: { value: "Reason edited" } });
    expect(change).toHaveBeenCalledWith([{ ...row, description: "Reason edited" }]);
  });

  it("one tap creates and focuses the first worker name; heading replaces the opening toggle", () => {
    function Names() {
      const [names, setNames] = useState<string[]>([]);
      return <LabourWorkerNames names={names} count={2} rowIndex={0} onChange={setNames} />;
    }
    render(<Names />);
    fireEvent.click(screen.getByTestId("button-labour-workers-0"));
    expect(document.activeElement).toBe(screen.getByTestId("input-labour-worker-0-0"));
    expect(screen.getByText("Worker names (0)")).toBeTruthy();
    expect(screen.queryByTestId("button-labour-workers-0")).toBeNull();
    fireEvent.change(screen.getByTestId("input-labour-worker-0-0"), { target: { value: " Ramesh " } });
    fireEvent.click(screen.getByTestId("button-add-labour-worker-0"));
    expect(screen.getByTestId("input-labour-worker-0-1")).toBeTruthy();
    expect(prepareLabourWorkerRow({ count: 2, hours: 4, workerNames: [" Ramesh ", ""] })).toEqual({ count: 2, hours: 4, workerNames: ["Ramesh"] });
  });

  it("hours remains optional, passes through fractional values and blank without normalizing", () => {
    const change = vi.fn();
    const view = render(<LabourHoursInput value={null} contractor="Raju gang" rowIndex={0} onChange={change} />);
    const input = screen.getByLabelText("Hours") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.required).toBe(false);
    expect(input.min).toBe("0.5");
    expect(input.max).toBe("24");
    fireEvent.change(input, { target: { value: "4.25" } });
    expect(change).toHaveBeenLastCalledWith(4.25);
    view.rerender(<LabourHoursInput value={4.25} contractor="Direct / local hire" rowIndex={0} onChange={change} />);
    expect(screen.getByText("Hours blank = full day")).toBeTruthy();
    fireEvent.change(input, { target: { value: "" } });
    expect(change).toHaveBeenLastCalledWith(null);
    view.rerender(<LabourHoursInput value={24.5} contractor="Raju gang" rowIndex={0} onChange={change} />);
    expect(screen.queryByText("Hours blank = full day")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("between 0.5 and 24");
  });

  it("contractor remains select-or-type plain text, without uppercase normalization", () => {
    const change = vi.fn();
    render(<LabourContractorInput value="Direct / local hire" rowIndex={0} suggestions={["Raju gang"]} onChange={change} />);
    expect(screen.getByTestId("select-labour-contractor-0").textContent).toBe("Direct / local hire");
    fireEvent.keyDown(screen.getByTestId("select-labour-contractor-0"), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Other — type a name" }));
    fireEvent.change(screen.getByTestId("input-labour-contractor-0"), { target: { value: "Sri Lakshmi gang" } });
    expect(change).toHaveBeenCalledWith("Sri Lakshmi gang");
  });

  it("drops untouched new labour rows while preserving identified saved rows and counting hours as filled evidence", () => {
    const blank = { category: "Skilled", gender: "Male", count: null, boqItemId: 9, workerNames: [" "] };
    expect(isFilledLabourRow(blank)).toBe(false);
    const rows = [blank, { ...blank, hours: 4 }, { ...blank, persistedId: 47 }];
    const sent = rows.filter(row => "persistedId" in row && row.persistedId != null || isFilledLabourRow(row));
    expect(sent).toEqual([rows[1], rows[2]]);
  });

  it("hydrates optional labour hours unchanged, including legacy null and non-rounded fractions", () => {
    const state = mapDprToFormState({ site: "HLC road", date: "2026-08-12", engineer: "Engineer",
      labour: [{ id: 47, count: 2, hours: 4.25 }, { id: 48, count: 3, hours: null }, { id: 49, count: 4 }] });
    expect(state.labour.map(row => row.hours)).toEqual([4.25, null, null]);
    expect(state.labour.map(row => row.count)).toEqual([2, 3, 4]);
  });

  it("all three save paths use the shared filled helper, carry hours, and never fill creation clock times", () => {
    for (const page of ["SiteEntry", "SiteEdit", "GuidedDpr"]) {
      const source = readFileSync(`client/src/pages/${page}.tsx`, "utf8");
      expect(source).toContain('import { isFilledLabourRow } from "@shared/labourEntry"');
      expect(source).toContain("row.persistedId != null || isFilledLabourRow(row)");
      expect(source).toContain("<LabourHoursInput");
      expect(source).toContain("<LabourContractorInput");
      expect(source).not.toContain("withEquipmentCreationStartTime");
      expect(source).not.toContain("currentLocalEquipmentTime");
    }
    const source = readFileSync("client/src/pages/SiteEntry.tsx", "utf8");
    expect(source).not.toContain("Save Section");
    expect(source).toContain('window.confirm("Discard changes?")');
    const report = readFileSync("client/src/pages/SiteReport.tsx", "utf8");
    expect(report).toContain('item.hours == null ? "" : `${item.hours} h`');
  });
});