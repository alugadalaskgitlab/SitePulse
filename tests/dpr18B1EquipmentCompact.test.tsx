// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DprEquipmentCompact, type DprEquipmentFields } from "../client/src/components/DprEquipmentCompact";

afterEach(cleanup);

const base: DprEquipmentFields = {
  equipmentId: 12, machine: "Compactor", vehicleNo: "MH-12", entryType: "daily",
  dieselSource: "contractor", openingReading: 10, closingReading: 11,
  startTime: "08:00", endTime: "16:00", breakdowns: [],
};

describe("DPR18 B1 grouped equipment card", () => {
  it("uses the real master hire basis and does not duplicate the editable override", () => {
    const { rerender } = render(<DprEquipmentCompact row={base} onChange={vi.fn()}
      equipment={{ ownership: "hired", hireBillingBasis: "monthly" }}
      ownerTypeSlot={<button>Existing hire override</button>} />);
    expect(screen.getByText("monthly")).toBeTruthy();
    expect(screen.queryByText("Effective hire / entry type")).toBeNull();
    rerender(<DprEquipmentCompact row={base} onChange={vi.fn()}
      equipment={{ ownership: "hired" }} ownerTypeSlot={<button>Existing hire override</button>} />);
    expect(screen.queryByText("Master default hire type")).toBeNull();
    expect(screen.queryByText("Effective hire / entry type")).toBeNull();
  });
  it.each([undefined, null, "working"] as const)("shows stored status %s without writing on mount", usageStatus => {
    const onChange = vi.fn();
    render(<DprEquipmentCompact row={{ ...base, usageStatus }} sectionPresentation onChange={onChange} />);
    const chip = screen.getByTestId("equipment-compact-status-chip-0");
    expect(chip.getAttribute("role")).toBe("combobox");
    expect(chip.getAttribute("aria-label")).toContain("Daily status");
    expect(chip.textContent).toContain(usageStatus === "working" ? "Working" : "Not recorded");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Expand Compactor" }));
    expect(screen.getByTestId("equipment-compact-usage-status-0").textContent).toContain(usageStatus === "working" ? "Working" : "Not recorded");
  });

  it.each([
    { status: "idle_no_work", required: true },
    { status: "idle_no_operator", required: false },
    { status: "breakdown", required: true },
    { status: "working", required: false },
  ] as const)("only requires reason for $status; historical notes remain displayed", ({ status, required }) => {
    render(<DprEquipmentCompact row={{ ...base, usageStatus: status, usageStatusReason: "Archived note" }} onChange={vi.fn()} />);
    const reason = screen.getByTestId("equipment-compact-usage-reason-0") as HTMLTextAreaElement;
    expect(reason.required).toBe(required);
    expect(reason.value).toBe("Archived note");
    expect(reason.getAttribute("aria-invalid")).toBe("false");
  });

  it("shows the canonical error only for idle no work with no reason", () => {
    render(<DprEquipmentCompact row={{ ...base, usageStatus: "idle_no_work" }} onChange={vi.fn()} />);
    expect((screen.getByTestId("equipment-compact-usage-reason-0") as HTMLTextAreaElement).required).toBe(true);
    expect(screen.getByText("A reason is required for Idle — No Work status")).toBeTruthy();
  });

  it("orders caller-owned picker, owner override, diesel extras and real stoppage trigger in six groups", () => {
    const onChange = vi.fn();
    render(<DprEquipmentCompact row={base} onChange={onChange}
      equipmentPickerSlot={<button type="button">Caller equipment picker</button>}
      ownerTypeSlot={<button type="button">Caller hire override</button>}
      dieselSourceSlot={<button type="button">Caller source extras</button>}
      stoppageSlot={<button type="button">Caller stoppage trigger</button>} />);
    const ids = ["picker", "owner", "readings", "diesel", "work", "stoppage"].map(name =>
      screen.getByTestId(`equipment-compact-group-${name}-0`));
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i - 1].compareDocumentPosition(ids[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(ids[0].textContent).toContain("Caller equipment picker");
    expect(ids[0].textContent).toContain("Caller hire override");
    expect(ids[3].textContent).toContain("Caller source extras");
    expect(ids[5].textContent).toContain("Caller stoppage trigger");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides the whole stoppage and work groups when the section summary is collapsed without unmounting their contents", () => {
    render(<DprEquipmentCompact row={base} sectionPresentation onChange={vi.fn()}
      stoppageSlot={<button type="button">Caller stoppage trigger</button>} />);
    const stoppage = screen.getByTestId("equipment-compact-group-stoppage-0");
    const work = screen.getByTestId("equipment-compact-group-work-0");
    expect(screen.queryByTestId("section-equipment-summary-0")).toBeNull();
    expect(stoppage.classList.contains("hidden")).toBe(true);
    expect(work.classList.contains("hidden")).toBe(true);
    expect(screen.getByText("Caller stoppage trigger")).toBeTruthy();
    expect(screen.queryByTestId("equipment-compact-incidental-task-0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Compactor" }));
    expect(screen.getByTestId("equipment-compact-incidental-task-0")).toBeTruthy();
    expect(stoppage.classList.contains("hidden")).toBe(false);
    expect(work.classList.contains("hidden")).toBe(false);
  });

  it("does not show empty optional groups for existing callers with no slots", () => {
    render(<DprEquipmentCompact row={base} onChange={vi.fn()} />);
    expect(screen.queryByTestId("equipment-compact-group-picker-0")).toBeNull();
    expect(screen.queryByTestId("equipment-compact-group-stoppage-0")).toBeNull();
    expect(screen.getByTestId("equipment-compact-group-owner-0").textContent).not.toContain("Effective hire / entry type");
    expect(screen.getByTestId("equipment-compact-group-diesel-0")).toBeTruthy();
  });

  it("respects the legacy fuel visibility flag without showing an empty diesel group", () => {
    const view = render(<DprEquipmentCompact row={base} onChange={vi.fn()} showTankBalance={false} />);
    expect(screen.queryByTestId("equipment-compact-group-diesel-0")).toBeNull();
    expect(screen.queryByTestId("equipment-compact-fuel-0")).toBeNull();
    view.rerender(<DprEquipmentCompact row={base} onChange={vi.fn()} showTankBalance={false}
      dieselSourceSlot={<span>Caller source</span>} />);
    expect(screen.getByTestId("equipment-compact-group-diesel-0").textContent).toContain("Caller source");
    expect(screen.queryByTestId("equipment-compact-fuel-0")).toBeNull();
  });

  it("omits hidden diesel and nonplant performance wrappers in read-only mode", () => {
    const view = render(<DprEquipmentCompact row={base} editable={false} showTankBalance={false} />);
    expect(screen.queryByTestId("equipment-compact-read-group-diesel-0")).toBeNull();
    expect(screen.queryByTestId("equipment-compact-read-group-performance-0")).toBeNull();
    view.rerender(<DprEquipmentCompact row={{ ...base, dieselSource: "plant_stock" }} editable={false} showTankBalance={false} />);
    expect(screen.queryByTestId("equipment-compact-read-group-diesel-0")).toBeNull();
    expect(screen.getByTestId("equipment-compact-read-group-performance-0")).toBeTruthy();
  });

  it("does not invent a breakdown section for empty staged and submitted rows", () => {
    const view = render(<DprEquipmentCompact row={base} editable={false} />);
    expect(screen.queryByTestId("equipment-compact-read-group-breakdowns-0")).toBeNull();
    view.rerender(<DprEquipmentCompact row={{ ...base, breakdowns: undefined }} editable={false} />);
    expect(screen.queryByTestId("equipment-compact-read-group-breakdowns-0")).toBeNull();
  });

  it.each(["staged", "submitted"] as const)("renders one $kind stoppage with its persisted details from the row", kind => {
    render(<DprEquipmentCompact row={{ ...base, breakdowns: [{
      ...(kind === "staged" ? { clientKey: "draft-1" } : { id: 42 }),
      fromTime: "10:00", toTime: "11:30", description: "Hydraulic hose",
      responsibility: "vendor", repairScope: "hlc", debitableToVendor: true,
      remarks: "Repaired at site", attachment: { fileName: "repair.pdf", objectPath: "/objects/repair" },
    }] }} editable={false} />);
    const section = screen.getByTestId("equipment-compact-read-group-breakdowns-0");
    expect(section.querySelectorAll('[data-testid^="equipment-compact-breakdown-"]')).toHaveLength(1);
    expect(section.textContent).toContain("Hydraulic hose");
    expect(section.textContent).toContain("10:00 AM–11:30 AM");
    expect(section.textContent).toContain("1 h 30 min");
    expect(section.textContent).toContain("Responsibility: vendor");
    expect(section.textContent).toContain("Repair/payment scope: hlc");
    expect(section.textContent).toContain("Debitable to vendor: Yes");
    expect(section.textContent).toContain("Repaired at site");
    expect(section.textContent).toContain("Saved attachment: repair.pdf");
    expect(screen.getByTestId("equipment-compact-status-chip-0").textContent).toContain("Not specified");
  });

  it.each([undefined, null, "legacy path", { id: 8, fileName: "unlinked.pdf", objectPath: "/objects/a" }])(
    "tolerates absent or malformed staged attachment %s without opening the viewer", attachment => {
      render(<DprEquipmentCompact row={{ ...base, breakdowns: [{
        clientKey: "staged", description: "Hose", attachment,
      }] as DprEquipmentFields["breakdowns"] }} editable={false} />);
      expect(screen.getByTestId("equipment-compact-breakdown-0-0").textContent).toContain("Hose");
      expect(screen.queryByRole("button", { name: /View attachment/ })).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
});