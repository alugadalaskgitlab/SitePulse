// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  LabourWorkerNames, LabourWorkerNamesReadOnly, cleanLabourWorkerNames,
  prepareLabourWorkerRow, readLabourWorkerNames, adoptLabourRowIds,
} from "../client/src/components/LabourWorkerNames";
import { extractYesterdayStructure } from "../client/src/lib/sameAsYesterday";

describe("LABOUR-01 optional worker names", () => {
  it("preserves omission only for an identified historical row", () => {
    expect(readLabourWorkerNames({})).toBeUndefined();
    expect(prepareLabourWorkerRow({ persistedId: 40, count: 1 })).toEqual({ persistedId: 40, count: 1 });
    expect(prepareLabourWorkerRow({ count: 1 })).toEqual({ count: 1, workerNames: [] });
    render(<LabourWorkerNames names={undefined} count={1} rowIndex={0} onChange={vi.fn()} />);
    expect(screen.queryByTestId("labour-workers-editor-0")).toBeNull();
    expect(screen.getByText("+ Add worker names")).toBeTruthy();
  });

  it("deleting a named row and adding an untouched new row sends explicit [] without inventing old identity", () => {
    const rows = [
      { persistedId: 41, category: "Skilled", workerNames: ["Sita"] },
      { persistedId: 42, category: "Unskilled" },
    ];
    const afterDeleteAndAdd = [...rows.filter(row => row.persistedId !== 41), { category: "Skilled" }];
    const payload = afterDeleteAndAdd.map(prepareLabourWorkerRow);
    expect(payload).toEqual([
      { persistedId: 42, category: "Unskilled" },
      { category: "Skilled", workerNames: [] },
    ]);
    expect(payload.some(row => "persistedId" in row && row.persistedId === 41)).toBe(false);
  });

  it("adopts rotating parent IDs across consecutive saves, without overwriting edits or resurrecting deleted rows", () => {
    const sent = [
      { persistedId: 41, workerNames: ["Sita"] },
      { editCreationKey: "new-local", workerNames: [] },
    ];
    // A typed change to the named row and deletion of the new row happen while PATCH is in flight.
    const duringFlight = [{ persistedId: 41, workerNames: ["Sita", "Raju"] }, { editCreationKey: "added-later", workerNames: [] }];
    const afterFirst = adoptLabourRowIds(duringFlight, sent, [{ id: 91 }, { id: 92 }]);
    expect(afterFirst).toEqual([{ persistedId: 91, workerNames: ["Sita", "Raju"] }, { editCreationKey: "added-later", workerNames: [] }]);
    const secondPayload = afterFirst.map(prepareLabourWorkerRow);
    expect(secondPayload).toEqual([{ persistedId: 91, workerNames: ["Sita", "Raju"] }, { workerNames: [] }]);
    expect(adoptLabourRowIds(afterFirst, afterFirst, [{ id: 101 }, { id: 102 }])).toEqual([
      { persistedId: 101, workerNames: ["Sita", "Raju"] },
      { persistedId: 102, editCreationKey: "added-later", workerNames: [] },
    ]);
    expect(() => adoptLabourRowIds(afterFirst, sent, [{ id: 90 }])).toThrow("identities");
  });

  it("supports add, edit and removal without requiring count to match", () => {
    const onChange = vi.fn();
    const { rerender } = render(<LabourWorkerNames names={[]} count={1} rowIndex={0} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("button-labour-workers-0"));
    expect(onChange).toHaveBeenLastCalledWith([""]);
    rerender(<LabourWorkerNames names={[""]} count={1} rowIndex={0} onChange={onChange} />);
    expect(document.activeElement).toBe(screen.getByTestId("input-labour-worker-0-0"));
    fireEvent.change(screen.getByTestId("input-labour-worker-0-0"), { target: { value: "  Raju " } });
    expect(onChange).toHaveBeenLastCalledWith(["  Raju "]);
    rerender(<LabourWorkerNames names={["Raju", "Sita"]} count={1} rowIndex={0} onChange={onChange} />);
    expect(screen.getByRole("status").textContent).toContain("headcount is 1");
    fireEvent.click(screen.getByTestId("button-remove-labour-worker-0-0"));
    expect(onChange).toHaveBeenLastCalledWith(["Sita"]);
    expect(prepareLabourWorkerRow({ workerNames: ["  Raju ", " "] })).toEqual({ workerNames: ["Raju"] });
    expect(prepareLabourWorkerRow({ workerNames: [] })).toEqual({ workerNames: [] });
  });

  it("reads historical and current row shapes; compact view only shows nonempty names", () => {
    expect(readLabourWorkerNames({ workers: [{ name: "Raju" }] })).toEqual(["Raju"]);
    expect(cleanLabourWorkerNames(["  Raju  ", "", " Sita "])).toEqual(["Raju", "Sita"]);
    const { rerender } = render(<LabourWorkerNamesReadOnly row={{}} />);
    expect(screen.queryByTestId("labour-worker-names")).toBeNull();
    rerender(<LabourWorkerNamesReadOnly row={{ workerNames: [" Raju ", "Sita"] }} />);
    expect(screen.getByTestId("labour-worker-names").textContent).toContain("Workers: Raju, Sita");
  });

  it("retains names in yesterday's crew copy without copying a persisted parent ID", () => {
    expect(extractYesterdayStructure({
      labour: [{ id: 31, category: "Skilled", count: 2, contractor: "Gang", task: "Work", workerNames: ["Raju"] }],
    }).labour).toEqual([{ category: "Skilled", count: 2, contractor: "Gang", task: "Work", workerNames: ["Raju"] }]);
  });
});