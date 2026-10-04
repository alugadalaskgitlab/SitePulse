// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DprEquipmentCompact, type DprEquipmentFields } from "../client/src/components/DprEquipmentCompact";
import {
  buildDprEquipmentTableDetails, DprEquipmentTableDetails, DprEquipmentTableBreakdowns,
} from "../client/src/components/DprEquipmentTableDetails";

vi.mock("../client/src/components/AttachmentViewer", () => ({
  AttachmentViewer: ({ attachment, onClose }: any) => attachment
    ? <div role="dialog">{attachment.fileName}<button onClick={onClose}>Close attachment</button></div> : null,
}));
afterEach(cleanup);

const master = { meterType: "hour_meter", ownership: "hired", vendorName: "Supplier A", consumptionNorm: 5 };
const base: DprEquipmentFields = {
  machine: "Roller", vehicleNo: "REG-1", operator: "Driver", entryType: "daily",
  startTime: "08:00", endTime: "16:00", openingReading: 100, closingReading: 102,
  hoursWorked: 2, diesel: 10, expectedDiesel: 10, dieselNorm: 5, dieselSource: "plant_stock",
  openingDiesel: 20, dieselBalanceInTank: 22, dieselBalanceConfirmed: true,
  usageStatus: "working", usageStatusReason: "Historical note", task: "Diversion",
  activitySegments: [{ startTime: "08:00", endTime: "10:00", boqItems: [{ boqItemId: 7 }] }],
  breakdowns: [],
};
const boqItems = [{ id: 7, itemCode: "B7", description: "Earthwork", unit: "cum" }];

function renderSections(row = base, equipment = master) {
  const details = buildDprEquipmentTableDetails(row, equipment);
  return render(<div>{(["identity", "readings", "quantity", "tank", "expected", "performance", "work"] as const).map(section =>
    <DprEquipmentTableDetails key={section} section={section} row={row} details={details} index={0} boqItems={boqItems} />)}</div>);
}

describe("DPR20 B1 equipment details in existing audit-table cells", () => {
  it("retains card-only identity, readings, quantities, fuel, assignment and reason facts", () => {
    renderSections();
    const identity = screen.getByTestId("equipment-table-identity-0").textContent!;
    expect(identity).toContain("Hired: Supplier A");
    expect(identity).toContain("Entry / Hire Type: daily");
    expect(identity).toContain("Daily Status: Working");
    expect(identity).toContain("Status Reason: Historical note");
    const readings = screen.getByTestId("equipment-table-readings-0").textContent!;
    expect(readings).toContain("Opening Meter: 100");
    expect(readings).toContain("Closing Meter: 102");
    expect(readings).toContain("Start Time: 8:00 AM");
    expect(readings).toContain("End Time: 4:00 PM");
    expect(readings).toContain("Clock Duration: 8");
    expect(readings).toContain("opening and closing meter difference");
    expect(screen.getByTestId("equipment-table-quantity-0").textContent).toContain("Meter Working Hours: 2.00 h");
    expect(screen.getByTestId("equipment-table-tank-0").textContent).toContain("Opening Tank (L): 20.00 L");
    expect(screen.getByTestId("equipment-table-tank-0").textContent).toContain("Closing Tank / Physical Dip (L): 22.00 L");
    const performance = screen.getByTestId("equipment-table-performance-0").textContent!;
    expect(performance).toContain("Actual Consumed: 8.00 L");
    expect(performance).toContain("Consumed − expected variance: -2.00 L");
    expect(performance).toContain("Actual Consumption Rate · from confirmed tank dip: 4.00 L/hr");
    expect(screen.getByTestId("equipment-table-work-0").textContent).toContain("not payable progress");
    expect(screen.getByTestId("equipment-table-work-0").textContent).toContain("Earthwork");
    expect(screen.getByTestId("equipment-table-work-0").textContent).toContain("8:00 AM → 10:00 AM");
    expect(screen.getByTestId("equipment-table-work-0").textContent).toContain("Assigned");
    expect(screen.queryByTestId("equipment-compact-0")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it.each([
    { ...base },
    { ...base, dieselBalanceConfirmed: false },
    { ...base, dieselSource: "direct_purchase" },
    { ...base, dieselSource: "contractor", diesel: 0, hoursWorked: 0 },
    { ...base, diesel: 0, openingDiesel: 20, dieselBalanceInTank: 20 },
    { ...base, openingDiesel: null, dieselBalanceInTank: null, dieselBalanceConfirmed: false },
    { ...base, openingReading: null, closingReading: null },
    { ...base, hoursWorked: 2, totalKm: 10 },
  ])("preserves the exact compact fuel values and historical quantity precedence %#", row => {
    const compact = render(<DprEquipmentCompact row={row} equipment={master} editable={false} />);
    const oldPerformance = compact.queryByTestId("equipment-compact-read-group-performance-0")?.textContent ?? "";
    const oldExpected = /Expected([^V]*)Variance/.exec(oldPerformance)?.[1];
    compact.unmount();
    renderSections(row);
    const details = buildDprEquipmentTableDetails(row, master);
    if (row.dieselSource !== "plant_stock") {
      expect(screen.queryByTestId("equipment-table-performance-0")).toBeNull();
      expect(screen.queryByText(/Opening Tank/)).toBeNull();
      expect(details.fuel.actualConsumed).toBeNull();
    } else {
      const actual = screen.getByTestId("equipment-table-performance-0").textContent!;
      const fuelValue = details.fuel.actualConsumed == null ? "Awaiting tank dip" : `${details.fuel.actualConsumed.toFixed(2)} L`;
      expect(oldPerformance).toContain(fuelValue);
      expect(actual).toContain(fuelValue);
      expect(screen.getByTestId("equipment-table-expected-0").textContent).toContain(oldExpected?.trim());
      expect(oldPerformance).toContain(details.confirmedRate
        ? `${details.fuel.actualRate!.toFixed(2)} ${details.fuel.actualRateUnit}`
        : "Expected Consumption Rate · from norm, actual unavailable");
      expect(actual).toContain(details.confirmedRate
        ? `${details.fuel.actualRate!.toFixed(2)} ${details.fuel.actualRateUnit}`
        : "Expected Consumption Rate · from norm, actual unavailable");
    }
  });

  it("preserves missing vendor fallback, unspecified status and pending dip warning", () => {
    renderSections({ ...base, usageStatus: null, dieselBalanceConfirmed: false }, { ...master, vendorName: "" });
    expect(screen.getByText(/Vendor not recorded/)).toBeTruthy();
    expect(screen.getByText(/Not specified/)).toBeTruthy();
    expect(screen.getByText("Physical tank balance has not been confirmed.")).toBeTruthy();
    expect(screen.getByTestId("equipment-table-performance-0").textContent).toContain("actual unavailable");
  });

  it("keeps clock duration separate when no hour-meter difference exists", () => {
    renderSections({ ...base, openingReading: null, closingReading: null });
    expect(screen.getByTestId("equipment-table-quantity-0").textContent).toBe("Meter Working Hours: —");
    expect(screen.getByTestId("equipment-table-readings-0").textContent).toContain("not labelled as meter working time");
  });

  it("preserves odometer units and the existing unavailable overnight-clock result", () => {
    renderSections({ ...base, startTime: "22:00", endTime: "02:00", openingReading: 100, closingReading: 120, hoursWorked: null, totalKm: 20 },
      { ...master, meterType: "odometer" });
    expect(screen.getByTestId("equipment-table-readings-0").textContent).toContain("Opening Odometer: 100");
    expect(screen.getByTestId("equipment-table-readings-0").textContent).toContain("Clock Duration: —");
    expect(screen.getByTestId("equipment-table-quantity-0").textContent).toContain("20.00 km");
    expect(screen.getByTestId("equipment-table-performance-0").textContent).toContain("0.40 L/km");
  });

  it("groups legacy allocations exactly as before and keeps the empty-assignment explanation", () => {
    const row = { ...base, activitySegments: [], activityAllocations: [{ boqItemId: 7, startTime: "08:00", endTime: "10:00", hoursWorked: 2 }] };
    const { unmount } = renderSections(row);
    expect(screen.getByTestId("equipment-table-work-0").textContent).toContain("Earthwork");
    expect(screen.getByTestId("equipment-table-work-0").textContent).toContain("8:00 AM → 10:00 AM");
    unmount();
    renderSections({ ...base, task: "", activitySegments: [] });
    expect(screen.getByText("No BOQ item assigned to this machine day.")).toBeTruthy();
  });
});

describe("DPR20 B1 stoppage parity and linked maintenance", () => {
  const log = { id: 41, status: "resolved", description: "Hydraulic repair", fromTime: "10:00", toTime: "11:00", downtimeHours: 1, responsibility: "vendor" };
  const attachment = { id: 99, moduleType: "equipment_maintenance", linkedRecordId: 41, fileName: "repair.pdf", objectPath: "/objects/repair.pdf" };
  const stop = { maintenanceLogId: 41, description: log.description, fromTime: log.fromTime, toTime: log.toTime,
    repairScope: "vendor_payment", responsibility: "vendor", debitableToVendor: true, remarks: "Inspect seals", attachment };

  it("shows enriched details and linked status once, keeping the attachment viewer accessible", () => {
    render(<DprEquipmentTableBreakdowns stops={[stop as any]} linkedRows={[log]} index={0} />);
    expect(screen.getAllByText("Hydraulic repair")).toHaveLength(1);
    expect(screen.getAllByText("resolved")).toHaveLength(1);
    expect(screen.queryByTestId("equipment-table-linked-maintenance-41")).toBeNull();
    expect(screen.getByTestId("equipment-table-stop-0-0").textContent).toContain("Repair/payment scope: vendor_payment");
    expect(screen.getByTestId("equipment-table-stop-0-0").textContent).toContain("Debitable to vendor: Yes");
    expect(screen.getByText("Remarks: Inspect seals")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View attachment: repair.pdf" }));
    expect(screen.getByRole("dialog").textContent).toContain("repair.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Close attachment" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not resurrect enriched stops from an authoritative empty list; retains separate linked maintenance", () => {
    render(<DprEquipmentTableBreakdowns stops={[]} linkedRows={[log]} index={0} />);
    expect(screen.queryByTestId("equipment-table-stop-0-0")).toBeNull();
    expect(screen.getByTestId("equipment-table-linked-maintenance-41").textContent).toContain("resolved");
  });

  it("retains draft-only details and filename-only attachments without inventing a viewer record", () => {
    render(<DprEquipmentTableBreakdowns stops={[{ ...stop, attachment: { fileName: "draft.pdf", objectPath: "/objects/draft" } }]}
      linkedRows={[]} index={0} />);
    expect(screen.getByText("Saved attachment: draft.pdf")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /View attachment/ })).toBeNull();
    expect(screen.getByTestId("equipment-table-stop-0-0").textContent).toContain("Inspect seals");
  });
});

describe("DPR20 B1 scope and one-table source contract", () => {
  const source = readFileSync("client/src/pages/SiteReport.tsx", "utf8");
  const renderer = readFileSync("client/src/components/DprEquipmentReadOnlyRow.tsx", "utf8");
  const equipmentSection = source.split("<section><h2>Equipment</h2>")[1].split("</section>")[0];

  it("uses the approved opt-in five-column management table and retains default audit rendering", () => {
    expect(equipmentSection).not.toContain("<DprEquipmentCompact");
    expect((equipmentSection.match(/<DprEquipmentReadOnlyTable /g) ?? [])).toHaveLength(1);
    expect(equipmentSection).toContain("<DprEquipmentReadOnlyTable management");
    expect(equipmentSection).toContain("<DprEquipmentReadOnlyRow management");
    expect(renderer).toContain('["Machine", "Work", "Hours", "Diesel", "Consumption"]');
    expect(renderer).toContain('["Machine", "Work", "Usage", "Diesel", "Consumption", "Notes"]');
    expect((equipmentSection.match(/visibleEquipment\.map/g) ?? [])).toHaveLength(1);
    expect(source).toContain("breakdowns: item.breakdowns ?? breakdownsBySourceId.get(Number(item.id)) ?? []");
    expect(source).toContain("const totalDiesel = visibleEquipment.reduce");
    expect(renderer).toContain("row.hoursWorked != null");
    expect(renderer).toContain("finite(row.expectedDiesel)");
    expect(renderer).toContain("displayNorm(row.dieselNorm, normUnit)");
  });

  it("leaves lifecycle eligibility, move endpoint and button placement intact without B2 integration", () => {
    expect(source).toContain('const canMove = canEdit\n                      && usageId != null\n                      && usageLifecycle?.status === "closed"\n                      && usageLifecycle.successorId == null;');
    expect(source).toContain('data-testid={`button-move-equipment-${i}`}');
    expect(source).toContain('/api/equipment-usage/${usageId}/move');
    expect(source).toContain("lifecycleSlot={lifecycleText");
    expect(renderer).toContain('<th scope="col" className="equipment-lifecycle print:hidden">Lifecycle</th>');
    expect(source).not.toContain("managementMetrics");
    expect(readFileSync("client/src/pages/DprDetails.tsx", "utf8")).toContain("<DprEquipmentReadOnlyRow");
    for (const page of ["SiteEntry", "SiteEdit", "GuidedDpr"]) {
      expect(readFileSync(`client/src/pages/${page}.tsx`, "utf8")).toContain("<DprEquipmentCompact");
    }
  });
});

describe("DPR-PAGE-01 compact management print with default audit preserved", () => {
  const source = readFileSync("client/src/pages/SiteReport.tsx", "utf8");
  const css = readFileSync("client/src/components/dprManagement.css", "utf8");
  const parsed = postcss.parse(css);
  const rules: postcss.Rule[] = [];
  parsed.walkRules(rule => { rules.push(rule); });
  const declaration = (selector: string, property: string) =>
    rules.filter(rule => rule.selectors.includes(selector)).flatMap(rule => rule.nodes)
      .find(node => node.type === "decl" && node.prop === property) as postcss.Declaration;

  it("uses opt-in compact print on the existing A4 page without named-page breaks or scaling", () => {
    expect(source).toContain('import "@/components/dprManagement.css"');
    expect(source).toContain('<article className="dpr-management">');
    expect(readFileSync("client/src/pages/DprDetails.tsx", "utf8")).not.toContain("dprManagement.css");
    for (const rule of rules) {
      for (const selector of rule.selectors) expect(selector).toMatch(/^(?:\.dpr-|body:has\(\.dpr-management\))/);
    }
    expect(css).toContain("page: auto !important");
    expect(css).not.toContain("@page");
    expect(readFileSync("client/src/index.css", "utf8")).toContain("size: A4 portrait;");
    expect(css).not.toContain("landscape");
    expect(css).not.toContain("scale(");
    expect(css).not.toContain("zoom:");
  });

  it("fits all five management columns with wrapping, compact text and repeated equipment headers", () => {
    expect(declaration(".dpr-management-table", "table-layout").value).toBe("fixed");
    const compactRules: postcss.Rule[] = [];
    parsed.walkRules(rule => { compactRules.push(rule); });
    const widths = Array.from({ length: 5 }, (_, index) => {
      const candidates = compactRules.filter(rule => rule.selector.endsWith(`th:nth-child(${index + 1})`));
      const width = candidates.at(-1)!.nodes.find(node => node.type === "decl" && node.prop === "width") as postcss.Declaration;
      return parseFloat(width.value);
    });
    expect(widths.reduce((total, width) => total + width, 0)).toBe(100);
    expect(declaration(".dpr-management-table td", "overflow-wrap").value).toBe("anywhere");
    const printRules = compactRules.filter(rule => rule.parent?.type === "atrule" && (rule.parent as postcss.AtRule).params === "print");
    expect(printRules.some(rule => rule.selectors.includes(".dpr-management .dpr-equipment-readonly td") && rule.nodes.some(node => node.type === "decl" && node.prop === "font-size" && node.value === "8pt"))).toBe(true);
    const auditCss = readFileSync("client/src/components/dprEquipmentReadOnly.css", "utf8");
    expect(auditCss).toContain("white-space: normal !important");
    expect(auditCss).toContain(".dpr-equipment-readonly thead { display: table-header-group !important; }");
  });

  it("hides management actions and Lifecycle in print while keeping other pages' full audit print", () => {
    expect(css).toContain(".dpr-management button,.dpr-management .print-hidden,.dpr-row-controls { display: none !important; }");
    const compactCss = readFileSync("client/src/components/dprEquipmentReadOnly.css", "utf8");
    expect(compactCss).toContain(".equipment-lifecycle,.equipment-details-toggle { display: none !important; }");
    expect(compactCss).toContain(".equipment-audit-panel { display: block !important;");
  });
});