// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DprEquipmentReadOnlyRow, DprEquipmentReadOnlyTable, consumptionForReadOnlyRow, type ReadOnlyEquipmentRow } from "@/components/DprEquipmentReadOnlyRow";
import { buildDprEquipmentTableDetails } from "@/components/DprEquipmentTableDetails";

vi.mock("@/components/AttachmentViewer", () => ({
  AttachmentViewer: ({ attachment, onClose }: any) => attachment
    ? <div role="dialog">{attachment.fileName}<button onClick={onClose}>Close attachment</button></div> : null,
}));
afterEach(cleanup);
const master = { meterType: "hour_meter", ownership: "hired", vendorName: "Ramesh Plant Services", consumptionNorm: 5 };
const boqItems = [{ id: 7, description: "Wet Mix Macadam", itemCode: "WMM" }];
const base: ReadOnlyEquipmentRow = {
  id: 48, machine: "Soil Compactor", vehicleNo: "TS08JG4572", operator: "Ramesh", equipmentId: 12,
  entryType: "monthly", startTime: "08:00", endTime: "16:00", openingReading: 100, closingReading: 102,
  hoursWorked: 2, diesel: 10, expectedDiesel: 10, dieselNorm: 5, dieselSource: "plant_stock",
  openingDiesel: 20, dieselBalanceInTank: 22, dieselBalanceConfirmed: true, usageStatus: "working",
  usageStatusReason: "Saved status note", task: "Compacting second lift",
  activitySegments: [{ startTime: "08:00", endTime: "10:00", hoursWorked: 2, boqItems: [{ boqItemId: 7 }] }],
  breakdowns: [],
};
function display(row = base, equipment = master, extra: Partial<Parameters<typeof DprEquipmentReadOnlyRow>[0]> = {}) {
  return render(<DprEquipmentReadOnlyTable rows={[row]} equipmentFor={() => equipment} hasLifecycle={extra.lifecycleSlot !== undefined}>
    <DprEquipmentReadOnlyRow row={row} equipment={equipment} boqItems={boqItems} index={0} {...extra} />
  </DprEquipmentReadOnlyTable>);
}
describe("DPR-VIEW-01 shared read-only renderer", () => {
  it("uses the existing builder's historical runtime and fuel without recomputing usage", () => {
    const details = buildDprEquipmentTableDetails({ ...base, hoursWorked: 7.25 }, master);
    expect(details.historicalUsage.runtime).toBe(7.25);
    expect(details.preview.runtime).toBe(2);
    const result = consumptionForReadOnlyRow({ ...base, hoursWorked: 7.25 }, details);
    expect(result.value).toBeCloseTo(details.fuel.actualConsumed! / 7.25);
  });
  it("renders one compact table, hides working status in the summary and closes audit by default", () => {
    display();
    expect(screen.getAllByRole("table")).toHaveLength(1);
    const row = screen.getByTestId("row-equipment-0");
    expect(row.textContent).toContain("Soil Compactor");
    expect(row.textContent).toContain("TS08JG4572");
    expect(row.textContent).toContain("Hired · Ramesh Plant Services");
    expect(row.textContent).toContain("Monthly");
    expect(row.textContent).toContain("Operator: Ramesh");
    expect(row.textContent).not.toContain("Working");
    expect(row.textContent).not.toContain("Machine day");
    expect(screen.getByTestId("equipment-audit-details-0").getAttribute("data-expanded")).toBe("false");
  });
  it("renders measured tank consumption and prioritizes canonical performance", () => {
    display(base, master, { canonical: { state: "available", rate: 3.8, unit: "L/hr", provenance: "Verified canonical source" } });
    expect(screen.getByTestId("equipment-consumption-0").textContent).toContain("3.8 L/hr");
    expect(screen.getByTestId("equipment-consumption-0").textContent).toContain("measured ✓");
    expect(screen.getByTestId("equipment-audit-details-0").textContent).toContain("Verified canonical source");
  });
  it("retains the row-level figure when canonical access is unavailable", () => {
    display({ ...base, dieselBalanceConfirmed: false }, master, { canonical: { state: "unavailable", reason: "complete equipment-day access is not verified" } });
    const consumption = screen.getByTestId("equipment-consumption-0").textContent!;
    expect(consumption).toContain("5.0 L/hr");
    expect(consumption).toContain("issued");
    expect(document.body.textContent).not.toContain("access is not verified");
  });
  it("displays trip vehicles and all audit norms in km/L only", () => {
    display({ ...base, hoursWorked: null, totalKm: 108, entryType: "trip_based", numberOfTrips: 9, tripDistance: 6, diesel: 18, dieselNorm: 0.2, dieselSource: "direct_purchase", openingReading: null, closingReading: null }, { ...master, meterType: "odometer", consumptionNorm: 0.25 });
    expect(screen.getByTestId("row-equipment-0").textContent).toContain("9 trips × 6.0 km = 108.0 km");
    expect(screen.getByTestId("equipment-consumption-0").textContent).toContain("6.0 km/L");
    expect(document.body.textContent).not.toContain("L/km");
    expect(screen.getByTestId("equipment-audit-details-0").textContent).toContain("5.000 km/L");
    expect(screen.getByTestId("equipment-audit-details-0").textContent).toContain("4.000 km/L");
  });
  it("displays odometer distance and recorded historical quantity", () => {
    display({ ...base, hoursWorked: null, totalKm: 82, openingReading: 84320, closingReading: 84402, diesel: 18, dieselSource: "direct_purchase" }, { ...master, meterType: "odometer", consumptionNorm: 0.2 });
    expect(screen.getByTestId("row-equipment-0").textContent).toContain("84,320.0 → 84,402.0 = 82.0 km");
  });
  it("displays clock runtime for time-based rows", () => {
    display({ ...base, entryType: "daily", openingReading: null, closingReading: null, hoursWorked: 8 });
    expect(screen.getByTestId("row-equipment-0").textContent).toContain("8:00 AM → 4:00 PM = 8.0 h");
  });
  it("renders incomplete reason with no invented consumption when closing reading is missing", () => {
    display({ ...base, closingReading: null, endTime: "", startTime: "", hoursWorked: null, dieselBalanceConfirmed: false });
    const cell = screen.getByTestId("equipment-consumption-0").textContent!;
    expect(cell).toBe("Incompleteclosing reading missing");
    expect(cell).not.toMatch(/[0-9]/);
  });
  it.each([
    [11.5, "▲ 15%"], [8.8, "check ▼ 12%"], [10.8, "✓"],
  ])("renders the approved deviation flag for issued %s", (diesel, flag) => {
    display({ ...base, diesel, dieselBalanceConfirmed: false });
    expect(screen.getByTestId("equipment-consumption-0").textContent).toContain(flag);
  });
  it("toggles a CSS-controlled audit panel and preserves all saved / preview facts", () => {
    display({ ...base, hoursWorked: 3, dieselNorm: 6, expectedDiesel: 18 });
    const toggle = screen.getByTestId("button-equipment-details-0");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByTestId("equipment-audit-details-0");
    expect(panel.getAttribute("data-expanded")).toBe("true");
    for (const text of ["Machine day", "Opening / closing meter", "Start / end time", "Clock duration", "Saved operating quantity", "3.000 h", "Calculated preview quantity", "2.000 h", "Saved expected diesel", "18.000 L", "Fuel-summary expected", "Issued − saved expected", "Saved norm", "6.000 L/hr", "Current master norm", "5.000 L/hr", "DPR snapshot consumed", "8.000 L", "DPR snapshot consumed − expected variance", "Saved status note", "Opening / closing tank", "Physical tank balance", "Confirmed", "monthly"]) expect(panel.textContent).toContain(text);
    fireEvent.click(toggle);
    expect(panel.getAttribute("data-expanded")).toBe("false");
  });
  it("retains legacy assignment details and assigned / unassigned / machine-day totals", () => {
    display({ ...base, activitySegments: [], activityAllocations: [{ boqItemId: 7, startTime: "08:00", endTime: "10:00", hoursWorked: 2 }] });
    const work = screen.getByTestId("equipment-table-work-0").textContent!;
    expect(work).toContain("Wet Mix Macadam");
    expect(work).toContain("8:00 AM → 10:00 AM");
    expect(work).toContain("Assigned: 2");
    expect(work).toContain("Unassigned: 6");
    expect(work).toContain("Machine Day: 8");
    expect(work).not.toContain("Assignment validation");
    expect(screen.getByText(/Assignment validation uses machine-day clock duration/)).toBeTruthy();
  });
  it.each(["linked", "general", "unlinked"] as const)("only shows incidental warning for an unlinked, non-General task (%s)", mode => {
    display({ ...base, activitySegments: mode === "linked" ? base.activitySegments : [], resourceScope: mode === "general" ? "general" : null });
    expect(screen.getByTestId("row-equipment-0").textContent!.includes("Non-BOQ / Incidental")).toBe(mode === "unlinked");
    expect(screen.getByTestId("equipment-table-work-0").textContent).not.toContain("Non-BOQ / Incidental");
    if (mode === "general") expect(screen.getByTestId("row-equipment-0").textContent).toContain("General");
    if (mode === "unlinked") expect(screen.getByTestId("row-equipment-0").textContent).toContain("Not linked");
  });
  it("retains breakdown fields, attachment interaction and linked maintenance evidence", () => {
    const attachment = { id: 9, moduleType: "maintenance", linkedRecordId: 81, fileName: "pump-repair-bill.pdf", objectPath: "/objects/repair" } as any;
    display({ ...base, usageStatus: "breakdown", usageStatusReason: "Hydraulic leak", breakdowns: [{
      id: 81, description: "Hydraulic hose", fromTime: "10:00", toTime: "11:30", downtimeHours: 1.5,
      responsibility: "vendor", repairScope: "parts and labour", debitableToVendor: true, remarks: "Retain the replaced hose", attachment,
    }] }, master, { linkedRows: [{ id: 81, status: "resolved", fromTime: "10:00", toTime: "11:40", downtimeHours: 1.67, description: "Hose replaced", responsibility: "contractor" }, { id: 82, status: "open", description: "Inspect pump" }] });
    expect(screen.getByTestId("row-equipment-0").textContent).toContain("Breakdown · Hydraulic leak");
    const panel = screen.getByTestId("equipment-audit-details-0");
    for (const text of ["parts and labour", "Debitable to vendor: Yes", "Retain the replaced hose", "resolved", "1.67 h", "Hose replaced", "CONTRACTOR", "Inspect pump", "pump-repair-bill.pdf"]) expect(panel.textContent).toContain(text);
    fireEvent.click(screen.getByTestId("button-equipment-details-0"));
    fireEvent.click(screen.getByText("View attachment: pump-repair-bill.pdf"));
    expect(screen.getByRole("dialog").textContent).toContain("pump-repair-bill.pdf");
    fireEvent.click(screen.getByText("Close attachment"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("retains diesel source, station, bill and a saved zero amount", () => {
    display({ ...base, dieselSource: "direct_purchase", fuelStation: "Sai Fuel Centre", billNumber: "123", amountPaid: 0 });
    expect(screen.getByTestId("row-equipment-0").textContent).toContain("Direct purchase · Sai Fuel Centre · bill 123 · ₹0.00");
    expect(screen.getByTestId("equipment-audit-details-0").textContent).toContain("Sai Fuel Centre / 123 / ₹0.00");
  });
  it("keeps a lifecycle slot interactive without copying its behavior", () => {
    const move = vi.fn();
    display(base, master, { lifecycleSlot: <button data-testid="button-move-equipment-0" onClick={move}>Send onward</button> });
    fireEvent.click(screen.getByTestId("button-move-equipment-0"));
    expect(move).toHaveBeenCalledOnce();
    expect(screen.getByTestId("button-move-equipment-0").closest("td")?.className).toContain("print:hidden");
  });
  it("sums existing values by unit and marks partial totals incomplete", () => {
    const rows = [base, { ...base, id: 49, hoursWorked: null, totalKm: 82, expectedDiesel: null, diesel: 18 }, { ...base, id: 50, hoursWorked: 0, diesel: null, expectedDiesel: null }];
    render(<DprEquipmentReadOnlyTable rows={rows} equipmentFor={() => master}>{null}</DprEquipmentReadOnlyTable>);
    const totals = screen.getByTestId("equipment-totals").textContent!;
    expect(totals).toContain("2.000 h (incomplete)");
    expect(totals).toContain("82.000 km (incomplete)");
    expect(totals).toContain("28.000 L (incomplete) issued");
    expect(totals).toContain("10.000 L (incomplete) expected");
    expect(totals).toContain("0.000 L (incomplete) issued − expected");
  });
});
describe("DPR-VIEW-01 page, mobile and print contracts", () => {
  const site = readFileSync("client/src/pages/SiteReport.tsx", "utf8");
  const detail = readFileSync("client/src/pages/DprDetails.tsx", "utf8");
  const css = readFileSync("client/src/components/dprEquipmentReadOnly.css", "utf8");
  it("uses one shared renderer on both existing pages with the same permission-aware canonical path", () => {
    for (const source of [site, detail]) {
      expect(source).toContain("<DprEquipmentReadOnlyTable");
      expect(source).toContain("<DprEquipmentReadOnlyRow");
      expect(source).not.toContain("<DprEquipmentCompact");
      expect(source).toContain("resolveDprActualEfficiency");
      expect(source).toContain('sectionCan("equipment_performance_report", "view") || sectionCan("plant_equipment", "view")');
      expect(source).toContain("useDprEquipmentPerformance(dpr, canViewPerformance, user?.id, completePerformanceContext)");
    }
    expect(detail).toContain('<TableHead className="text-right">Hours</TableHead>');
  });
  it("preserves the original SiteReport lifecycle gating, endpoint and test IDs", () => {
    expect(site).toContain('const canMove = canEdit\n                      && usageId != null\n                      && usageLifecycle?.status === "closed"\n                      && usageLifecycle.successorId == null;');
    for (const id of ["button-move-equipment", "select-move-destination", "input-successor-date", "button-confirm-move", "badge-equipment-lifecycle"]) expect(site).toContain(`data-testid={\`${id}-\${i}\`}`);
    expect(site).toContain('apiRequest("POST", `/api/equipment-usage/${usageId}/move`');
    expect(site).toContain("successorDate,");
    expect(site).toContain("setSuccessorDate(dpr.date)");
  });
  it("uses single-column cards below 640px and forces all audit panels open for print without lifecycle", () => {
    expect(css).toContain("@media screen and (max-width: 639px)");
    expect(css).toContain(".dpr-equipment-readonly thead { display: none; }");
    expect(css).toContain(".equipment-audit-panel { display: block !important;");
    expect(css).toContain(".equipment-lifecycle,.equipment-details-toggle { display: none !important; }");
    expect(css).toContain("break-inside: auto !important");
    expect(css).not.toContain("@page");
  });
});