// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DprEquipmentCompact, type DprEquipmentFields } from "../client/src/components/DprEquipmentCompact";

afterEach(() => {
  cleanup();
});

const baseRow: DprEquipmentFields = {
  machine: "JCB EXCAVATOR",
  vehicleNo: "UP-01-AB-1234",
  operator: "IMRAN",
  entryType: "time_meter",
  startTime: "08:00",
  endTime: "17:00",
  diesel: 0,
  activitySegments: [],
};

const boqItems = [{ id: 42, description: "Granular sub-base" }];

describe("DPR-03 equipment incidental work field", () => {
  it("renders the optional controlled field for a day with no BOQ assignment and does not add a BOQ validation warning", () => {
    const onChange = vi.fn();
    render(
      <DprEquipmentCompact
        row={baseRow}
        equipment={{ meterType: "hour_meter" }}
        boqItems={boqItems}
        onChange={onChange}
      />,
    );

    const task = screen.getByLabelText("Non-BOQ / Incidental Work (optional)") as HTMLTextAreaElement;
    expect(task.value).toBe("");
    expect(screen.getByText(/Use this only for work that has no BOQ item and is not payable progress/)).toBeTruthy();
    expect(screen.getByText("No BOQ item assigned to this machine day.")).toBeTruthy();
    expect(screen.queryByText(/select a BOQ Item/i)).toBeNull();

    fireEvent.change(task, { target: { value: "Cut trench/toe drain along site road" } });
    expect(onChange).toHaveBeenCalledWith({ task: "Cut trench/toe drain along site road" });
  });

  it("keeps the incidental work textarea controlled by the existing task value", () => {
    const onChange = vi.fn();
    const view = render(
      <DprEquipmentCompact row={baseRow} onChange={onChange} />,
    );
    const task = screen.getByTestId("equipment-compact-incidental-task-0") as HTMLTextAreaElement;

    fireEvent.change(task, { target: { value: "Temporary diversion repair" } });
    view.rerender(<DprEquipmentCompact row={{ ...baseRow, task: "Temporary diversion repair" }} onChange={onChange} />);

    expect((screen.getByTestId("equipment-compact-incidental-task-0") as HTMLTextAreaElement).value).toBe("Temporary diversion repair");
  });

  it("shows stored incidental work in read-only output with an explicit non-payable label", () => {
    render(
      <DprEquipmentCompact
        row={{ ...baseRow, task: "Cut trench/toe drain along site road" }}
        editable={false}
        boqItems={boqItems}
      />,
    );

    expect(screen.getByTestId("equipment-compact-incidental-task-value-0").textContent).toBe("Cut trench/toe drain along site road");
    expect(screen.getByText("Non-BOQ / Incidental Work")).toBeTruthy();
    expect(screen.getByText("Not a BOQ item — not payable progress.")).toBeTruthy();
    expect(screen.queryByLabelText("Non-BOQ / Incidental Work (optional)")).toBeNull();
  });

  it("omits the incidental work line when a read-only row has no task", () => {
    render(
      <DprEquipmentCompact
        row={{ ...baseRow, task: "" }}
        editable={false}
        boqItems={boqItems}
      />,
    );

    expect(screen.queryByTestId("equipment-compact-incidental-work-0")).toBeNull();
    expect(screen.queryByText("Non-BOQ / Incidental Work")).toBeNull();
    expect(screen.queryByText("Not a BOQ item — not payable progress.")).toBeNull();
  });

  it("renders incidental work independently alongside a BOQ work assignment", () => {
    render(
      <DprEquipmentCompact
        row={{
          ...baseRow,
          task: "Repair diversion beside the site road",
          activitySegments: [{
            startTime: "08:00",
            endTime: "12:00",
            boqItems: [{ boqItemId: 42 }],
          }],
        }}
        editable={false}
        boqItems={boqItems}
      />,
    );

    expect(screen.getByTestId("equipment-compact-incidental-task-value-0").textContent).toBe("Repair diversion beside the site road");
    expect(screen.getByText("Granular sub-base")).toBeTruthy();
    expect(screen.getByText("Not a BOQ item — not payable progress.")).toBeTruthy();
  });
});