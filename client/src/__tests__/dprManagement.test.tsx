// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DprEquipmentReadOnlyRow, DprEquipmentReadOnlyTable, type ReadOnlyEquipmentRow } from "@/components/DprEquipmentReadOnlyRow";
import { DprActivityReadOnly } from "@/components/DprActivityReadOnly";
import { ProgrammeBarOutcomeHistory } from "@/components/ProgrammeBarOutcomeHistory";
import { DprMaterialsReceived } from "@/components/DprMaterialsReceived";
import { DPR_CONSUMPTION_LEGEND, buildManagementShare, managementMachines, managementQuantity, managementReceivedGroups, managementSummaryList, managementWorkEntries, shareManagementReport } from "@/lib/dprManagementPresentation";
import { shortItemName } from "@shared/boqItemName";
import { summarizeReceived } from "@/lib/materialUnloadingSummary";
import SiteReport from "@/pages/SiteReport";

describe("persisted structure quantity override", () => {
  it.each([2, null])("retains row factor 3 when the BOQ factor is %s", itemFactor => {
    const item = { kind: "structure", activity: "Concrete", itemOfWork: "Concrete", quantity: 10, uom: "MT", dprConversionFactor: 3 };
    const boqItem = { id: 1, unit: "Cum", dprConversionFactor: itemFactor };
    render(<table><tbody><DprActivityReadOnly management item={item} boqItem={boqItem} index={0} /></tbody></table>);
    expect(screen.getByText("10 MT")).toBeTruthy();
    expect(screen.getByText("BOQ credit 30 Cum")).toBeTruthy();
    expect(screen.queryByText("unit review needed")).toBeNull();
  });
});

const state = vi.hoisted(() => ({
  bars: [] as any[], receipts: [] as any[], receiptPending: false, receiptError: false, canEdit: true,
  dpr: null as any, boqItems: [] as any[], equipment: [] as any[], stoppages: [] as any[], lifecycle: null as any, mutate: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/hooks/use-dprs", () => ({ useDpr: () => ({ data: state.dpr, isLoading: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/use-dpr-material-receipts", () => ({
  useDprMaterialReceipts: () => ({ data: state.receipts, isPending: state.receiptPending, isError: state.receiptError, refetch: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({
    data: queryKey[0] === "/api/dpr/programme-bars" ? state.bars
      : queryKey[0] === "/api/equipment-usage/lifecycle" ? state.lifecycle
      : queryKey[0] === "/api/plant-module/equipment" ? state.equipment
      : queryKey[0] === "/api/maintenance/logs" ? state.stoppages : [],
  }),
  useMutation: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock("@/hooks/use-dpr-equipment-performance", () => ({ useDprEquipmentPerformance: () => ({ data: undefined, isLoading: false, isFetching: false }) }));
vi.mock("@/hooks/use-dpr-boq-items", () => ({ useDprBoqItems: () => ({ items: state.boqItems }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ sectionCan: () => state.canEdit, user: { id: 1 } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("@/components/EditPermissionButton", () => ({ EditPermissionButton: ({ onEditGranted }: any) => <button onClick={onEditGranted}>Edit</button> }));
vi.mock("@/components/CancelDialog", () => ({ default: () => null }));
vi.mock("@/components/HistoryDialog", () => ({ default: () => null }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() } }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => {
  state.bars = []; state.receipts = []; state.receiptError = false; state.receiptPending = false; state.canEdit = true;
  state.equipment = []; state.stoppages = []; state.lifecycle = null; state.mutate.mockReset(); state.toast.mockReset();
  state.boqItems = [{ id: 7, description: "Wet Mix Macadam", unit: "Cum" }];
  state.dpr = { id: 409, site: "Alladurg PWD Road to Pampad", date: "2026-10-02", engineer: "K V Babu",
    dprStatus: "submitted", progress: [], equipment: [], labour: [], materials: [], sitePurchases: [], remarks: "" };
  window.history.replaceState({}, "", "/site/report/409");
});
const master = { meterType: "hour_meter", ownership: "hired", vendorName: "Ratnam", consumptionNorm: 5 };
const machine: ReadOnlyEquipmentRow = {
  id: 1, equipmentId: 12, machine: "Tractor", vehicleNo: "0930", operator: "Yovan",
  entryType: "monthly", usageStatus: "working", startTime: "09:50", endTime: "17:13",
  openingReading: 100, closingReading: 102, hoursWorked: 2, dieselNorm: 5, diesel: 10,
  expectedDiesel: 10, dieselSource: "plant_stock", openingDiesel: 20, dieselBalanceInTank: 20, dieselBalanceConfirmed: true,
};
function equipmentDisplay(row = machine, equipment = master, lifecycleSlot?: any) {
  return render(<DprEquipmentReadOnlyTable management rows={[row]} equipmentFor={() => equipment}>
    <DprEquipmentReadOnlyRow management row={row} equipment={equipment} index={0} lifecycleSlot={lifecycleSlot} />
  </DprEquipmentReadOnlyTable>);
}
describe("DPR-PAGE-01 management equipment", () => {
  it.each([[18.5, "▲15%"], [21.2, "▼12% check"], [19.2, null], [19, null], [21, null]])(
    "only flags deviations outside the inclusive 10%% boundary (closing tank %s)", (closing, mark) => {
      equipmentDisplay({ ...machine, dieselBalanceInTank: closing });
      const cell = screen.getByTestId("equipment-consumption-0");
      if (mark) expect(cell.textContent).toContain(mark);
      else expect(cell.textContent).not.toMatch(/[▲▼✓]/);
    });
  it("has five columns, no audit panels, issued litres only, and no meter-clock warning", () => {
    const { container } = equipmentDisplay();
    expect(screen.getAllByRole("columnheader").map(n => n.textContent)).toEqual(["Machine", "Work", "Hours", "Diesel", "Consumption"]);
    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByTestId("button-equipment-details-0")).toBeNull();
    expect(screen.getByTestId("row-equipment-0").textContent).toContain("Hired · Ratnam · Monthly · Op. Yovan");
    expect(screen.getByTestId("row-equipment-0").textContent).toContain("2.0 h meter (100 → 102)");
    expect(screen.getByTestId("row-equipment-0").textContent).toContain("09:50 – 17:13 (7.4 h)");
    expect(container.textContent).not.toMatch(/meter.vs.clock|snapshot|canonical|Machine day|tank 20/);
    expect(screen.getByText(DPR_CONSUMPTION_LEGEND)).toBeTruthy();
  });
  it.each([
    [{ closingReading: null }, master, "no closing reading"],
    [{ dieselNorm: null }, { ...master, consumptionNorm: null }, "no norm recorded"],
  ])("shows dash and short reason for incomplete/no-norm %#", (override, equipment, reason) => {
    equipmentDisplay({ ...machine, ...override }, equipment as any);
    expect(screen.getByTestId("equipment-consumption-0").textContent).toBe(`—${reason}`);
  });
  it("retains valid helper issued fallback without basis wording or reclassifying it incomplete", () => {
    equipmentDisplay({ ...machine, dieselBalanceConfirmed: false, diesel: 11.5 });
    const cell = screen.getByTestId("equipment-consumption-0");
    expect(cell.textContent).toContain("5.8 L/hr");
    expect(cell.textContent).toContain("▲15%");
    expect(cell.textContent).not.toMatch(/issued|unconfirmed|incomplete|—/);
    expect(screen.getByText(DPR_CONSUMPTION_LEGEND)).toBeTruthy();
  });
  it.each(["idle_no_work", "idle_no_operator", "breakdown"])("shows status/reason instead of consumption (%s)", usageStatus => {
    equipmentDisplay({ ...machine, usageStatus: usageStatus as any, usageStatusReason: "Hydraulic leak" });
    expect(screen.getByTestId("equipment-consumption-0").textContent).toContain("Hydraulic leak");
    expect(screen.getByTestId("equipment-consumption-0").textContent).not.toContain("L/hr");
  });
  it("shows real odometer distance and km/L; totals keep km only for vehicles", () => {
    equipmentDisplay({ ...machine, hoursWorked: null, totalKm: 82, openingReading: 84320, closingReading: 84402, dieselNorm: 0.2, diesel: 16.4 },
      { ...master, meterType: "odometer", consumptionNorm: 0.2 });
    expect(screen.getByTestId("row-equipment-0").textContent).toContain("82 km (84,320 → 84,402)");
    expect(screen.getByTestId("equipment-consumption-0").textContent).toContain("5.0 km/L");
    expect(screen.getByRole("table").querySelector("tfoot")?.textContent).toContain("82.0 km");
  });
  it("formats trips without inventing distance", () => {
    equipmentDisplay({ ...machine, entryType: "trip_based", numberOfTrips: 9, tripDistance: 6, hoursWorked: null, totalKm: 108 },
      { ...master, meterType: "odometer", consumptionNorm: 0.2 });
    expect(screen.getByTestId("row-equipment-0").textContent).toContain("9 trips × 6 km = 108 km");
  });
  it("keeps saved runtime, compact totals and used only with confirmed tank data", () => {
    const view = equipmentDisplay({ ...machine, hoursWorked: 7.25, expectedDiesel: 25.789 });
    const total = screen.getByRole("table").querySelector("tfoot")?.textContent;
    expect(total).toContain("7.3 h"); expect(total).toContain("10 L used · 25.8 L expected");
    expect(total).not.toMatch(/\d+\.\d{3}|km/);
    view.unmount();
    equipmentDisplay({ ...machine, dieselBalanceConfirmed: false });
    expect(screen.getByRole("table").querySelector("tfoot")?.textContent).not.toContain("used");
  });
  it("keeps the row-end lifecycle action interactive and excluded from print", () => {
    const click = vi.fn();
    equipmentDisplay(machine, master, <button onClick={click}>Send onward</button>);
    fireEvent.click(screen.getByText("Send onward"));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByText("Send onward").closest(".print\\:hidden")).not.toBeNull();
  });
});
describe("DPR-PAGE-02 machines and scoped presentation", () => {
  it("shows four logged Machines / all worked, never the old ratio", () => {
    state.dpr.equipment = Array.from({ length: 4 }, (_, id) => ({ ...machine, id }));
    render(<SiteReport />);
    const tile = document.querySelector(".dpr-management-tile-machines")!;
    expect(tile.querySelector("strong")?.textContent).toBe("4");
    expect(tile.textContent).toBe("Equipment4all worked");
    expect(tile.textContent).not.toContain("/");
  });
  it("counts full-day, idle and part-day separately in attention order, once per machine", () => {
    state.dpr.equipment = [
      { ...machine, id: 1, usageStatus: "breakdown", breakdowns: [{ description: "Full-day" }] },
      { ...machine, id: 2, usageStatus: "idle_no_work" },
      { ...machine, id: 3, usageStatus: "idle_no_operator" },
      { ...machine, id: 4, breakdowns: [] },
    ];
    state.stoppages = [
      { id: 41, sourceRecordId: 4, eventType: "breakdown", downtimeHours: 1.5 },
      { id: 42, sourceRecordId: 4, eventType: "breakdown", downtimeHours: .25 },
      { id: 43, sourceRecordId: 1, eventType: "breakdown", downtimeHours: 8 },
    ];
    render(<SiteReport />);
    const tile = document.querySelector(".dpr-management-tile-machines")!;
    expect(tile.querySelector("strong")?.textContent).toBe("4");
    expect(tile.querySelector(".dpr-management-summary-list")?.textContent).toBe("1 breakdown, 2 idle, 1 part-day breakdown");
    expect(tile.querySelectorAll(".dpr-management-attention-breakdown")).toHaveLength(2);
    expect(tile.querySelector(".dpr-management-attention-idle")?.textContent).toBe("2 idle");
    expect(tile.textContent).not.toContain("all worked");
  });
  it.each(["breakdown", "idle_no_work", "idle_no_operator", null, "unknown"])("still shows a logged machine when none worked (%s)", usageStatus => {
    state.dpr.equipment = [{ ...machine, usageStatus }];
    render(<SiteReport />);
    const tile = document.querySelector(".dpr-management-tile-machines")!;
    expect(tile.querySelector("strong")?.textContent).toBe("1");
    expect(tile.textContent).not.toContain("all worked");
  });
  it("does not count maintenance service, cancelled events or other DPR rows as stoppages", () => {
    state.dpr.equipment = [{ ...machine, breakdowns: [] }];
    state.stoppages = [
      { sourceRecordId: 1, eventType: "service" },
      { sourceRecordId: 1, eventType: "breakdown", isCancelled: true },
      { sourceRecordId: 9001, eventType: "breakdown" },
    ];
    render(<SiteReport />);
    expect(document.querySelector(".dpr-management-tile-machines")?.textContent).toBe("Equipment1all worked");
  });
  it("retains hidden-machine rules and existing diesel/labour/material tile existence", () => {
    state.dpr.equipment = [];
    render(<SiteReport />);
    expect(document.querySelectorAll(".dpr-management-summary > div")).toHaveLength(1);
    expect(document.querySelector(".dpr-management-tile-machines")).toBeNull();
  });
  it("supports embedded stoppages and unknown statuses without claiming all worked", () => {
    expect(managementMachines([{ usageStatus: "working", breakdowns: [{ description: "Leak" }, { description: "Leak" }] }])).toEqual({
      count: 1, breakdown: 0, idle: 0, partDay: 1, allWorked: false,
    });
    expect(managementMachines([{ usageStatus: null }]).allWorked).toBe(false);
    expect(managementMachines([]).allWorked).toBe(false);
  });
  it("uses amber unloading wording, dash Trips and a separate Site purchases heading with no money", () => {
    state.receipts = [{ material: "WMM", quantity: 8, uom: "MT", source: "dpr" }];
    state.dpr.sitePurchases = [{ itemDescription: "Safety gloves", quantity: 6, uom: "Pairs", amount: 1234 }];
    render(<SiteReport />);
    const table = screen.getByRole("table", { name: "Materials received" });
    expect(table.querySelector('[data-label="Trips"]')?.textContent).toBe("—");
    expect(table.querySelector(".dpr-management-unloading-missing")?.textContent).toBe("unloading place not recorded");
    expect(screen.getByRole("heading", { name: "Site purchases" })).toBeTruthy();
    expect(document.querySelector(".dpr-management")?.textContent).not.toMatch(/₹|1234/);
  });
  it("keeps secondary text scoped and defines desktop/phone gutters and print reset", () => {
    const css = readFileSync("client/src/components/dprManagement.css", "utf8");
    expect(css).toContain("width: calc(100% - 32px)");
    expect(css).toContain("margin: 16px auto; padding: 20px");
    expect(css).toMatch(/@media screen and \(max-width: 767px\)[\s\S]*width: calc\(100% - 24px\); margin: 12px auto; padding: 14px/);
    expect(css).toMatch(/\.dpr-management \.dpr-management-subtle,\s*\.dpr-management \.equipment-subtle \{ color: #334155; font-size: 12\.5px; line-height: 1\.45/);
    expect(css).toMatch(/\.dpr-management \.equipment-legend \{ font-size: 11\.5px; color: #334155/);
    expect(css).toMatch(/@media print[\s\S]*\.dpr-management \{[^}]*width: 100%;[^}]*margin: 0; padding: 0/);
    expect(css).toMatch(/body:has\(\.dpr-management\) \{[^}]*padding: 0 !important; margin: 0 !important/);
    expect(readFileSync("client/src/index.css", "utf8")).toMatch(/@page\s*\{\s*margin: 1cm;\s*size: A4 portrait/);
  });
});
describe("DPR-PAGE-01 work and programme", () => {
  const wmm = { activity: "Wet Mix Macadam", quantity: 56.25, uom: "Cum", chainageFrom: "0+280", chainageTo: "0+380", width: 3.75, thickness: 0.15, materialOutcome: "reused", reusableQty: 21 };
  function activity(item: any = wmm, boqItem: any = { unit: "Cum" }) {
    return render(<table><tbody><DprActivityReadOnly management item={item} index={0} boqItem={boqItem} nameStyle="activity" /></tbody></table>);
  }
  it("shows one quantity, no expandable details, no inappropriate earthwork fields, empty programme", () => {
    const { container } = activity();
    expect(screen.getByTestId("text-report-physical-0").textContent).toBe("56.25 Cum");
    expect(container.textContent).not.toMatch(/reused|Reusable|Recorded quantity|Physical measurement|Details|Material outcome/);
    expect(screen.queryByTestId("text-boq-progress-0")).toBeNull();
    expect(within(screen.getByTestId("row-progress-0")).getAllByRole("cell")[4].textContent).toBe("");
    expect(container.querySelector(".dpr-work-note")).toBeNull();
  });
  it("labels stored side through the shared mapper and does not duplicate dimensions, retaining unique structure text", () => {
    const { container } = activity({ ...wmm, side: "full", structureName: "Culvert C4", stage: "Deck" });
    expect(screen.getByText("Full Width")).toBeTruthy();
    expect(screen.getAllByText("100 × 3.75 × 0.15 m")).toHaveLength(1);
    expect(container.querySelector(".dpr-work-note")?.textContent).toBe("Culvert C4 · Deck");
  });
  it("puts populated earthwork/flag-only text in one grey line", () => {
    const { container } = activity({ ...wmm, activity: "Excavation", isIncidental: true, incidentalDescription: "Drain clearance", noSiteWorkDescription: "Wrong type" });
    expect(container.querySelector(".dpr-work-note")?.textContent).toContain("reused · Reusable 21 Cum · Drain clearance");
    expect(container.textContent).not.toContain("Wrong type");
  });
  it("shows amber BOQ note only when value/unit differs or needs review", () => {
    expect(managementQuantity({ quantity: 10, uom: "Cum" }, { unit: "Cum" }).note).toBeNull();
    expect(managementQuantity({ quantity: 10, uom: "Cum", rowConversionFactor: 2 }, { unit: "MT", dprConversionFactor: 2 }).note).toContain("BOQ credit");
    expect(managementQuantity({ quantity: 10, uom: "MT" }, { unit: "Ha" }).note).toBe("unit review needed");
  });
  it("uses real reportedQty and plannedQty, never latest outcome quantity, and marks overdue", () => {
    state.bars = [{ id: 3, reachLabel: "Reach 1", chainageFrom: 0, chainageTo: 1.6, startDate: "2020-09-25", endDate: "2020-09-30",
      reportedQty: 412, plannedQty: 900, unit: "Cum", latestOutcome: { actualQuantity: 9999 } }];
    render(<ProgrammeBarOutcomeHistory management projectId={8} boqItemId={7} programmeBarId={3} testidPrefix="p" />);
    expect(screen.getByTestId("p-programme-outcome").textContent).toContain("Reach 1 · Ch 0+000 – 1+600 · 25 Sep – 30 Sep");
    expect(screen.getByTestId("p-programme-outcome").textContent).toContain("Done 412 / 900 Cum (46%) past planned end");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("46");
    expect(document.body.textContent).not.toContain("9999");
  });
  it("never invents zero actual when reported progress is unresolved", () => {
    state.bars = [{ id: 3, reachLabel: "Reach 1", plannedQty: 900, reportedQty: 412, reportedQtyUnresolved: true, unit: "Cum" }];
    render(<ProgrammeBarOutcomeHistory management projectId={8} boqItemId={7} programmeBarId={3} testidPrefix="p" />);
    expect(screen.getByText("Progress unavailable")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
describe("DPR-PAGE-01 materials, page and sharing", () => {
  it("uses correct unloading wording, opens trips in a dialog not inline, combines issues/purchases", () => {
    state.receipts = [
      { id: 1, source: "trip", material: "WMM", quantity: 14.125, uom: "MT", unloadedAt: "yard", vehicleNumber: "TS08", supplier: "Saravana" },
      { id: 2, source: "trip", material: "GSB", quantity: 12, uom: "MT", unloadedAt: "stretch" },
      { id: 3, source: "trip", material: "Sand", quantity: 8, uom: "Cum" },
    ];
    const { container } = render(<DprMaterialsReceived management site="Alladurg" date="2026-10-02" />);
    expect(screen.getByText("Yard (stock)")).toBeTruthy(); expect(screen.getByText("Stretch (used on site)")).toBeTruthy(); expect(screen.getByText("unloading place not recorded")).toBeTruthy();
    expect(screen.getByText("No store issues or site purchases today.")).toBeTruthy();
    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByText("TS08")).toBeNull();
    fireEvent.click(screen.getByTestId("button-trip-list"));
    expect(screen.getByRole("dialog").textContent).toContain("TS08");
  });
  it("uses stored labour tasks, hides absent Hours, shows remarks and compact received summary", () => {
    state.dpr.progress = [{ activity: "WMM", quantity: 56.25, uom: "Cum", boqItemId: 7 }];
    state.dpr.labour = [{ contractor: "Machender", category: "Unskilled", gender: "M", count: 1, task: "WMM" }, { contractor: "Samson", category: "Skilled", count: 1 }];
    state.dpr.remarks = "Rain stopped work at 16:20";
    state.receipts = [{ id: 1, source: "trip", material: "WMM", uom: "MT", quantity: 141.034, unloadedAt: "stretch" }];
    render(<SiteReport />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(state.dpr.site);
    expect(screen.getByTestId("dpr-remarks").textContent).toBe(state.dpr.remarks);
    const labour = screen.getByRole("table", { name: "Labour" });
    expect(within(labour).queryByRole("columnheader", { name: "Hours" })).toBeNull();
    expect(within(screen.getByTestId("row-labour-1")).getAllByRole("cell")[3].textContent).toBe("");
    expect(document.querySelector(".dpr-management-summary")?.textContent).toContain("141.03 MT");
    expect(screen.getByText(/Daily Progress Report/).textContent).toContain("DPR #409");
  });
  it("hides zero summary tiles, conditionally includes Hours, empty remarks and permissions", () => {
    state.canEdit = false; state.dpr.labour = [{ count: 1, hours: 3.25, category: "Skilled", task: "" }];
    render(<SiteReport />);
    expect(screen.queryByText("Edit")).toBeNull();
    expect(document.querySelectorAll(".dpr-management-summary > div")).toHaveLength(2);
    expect(screen.getByTestId("dpr-remarks").textContent).toBe("— none recorded —");
    expect(screen.getByRole("columnheader", { name: "Hours" })).toBeTruthy();
    expect(document.body.textContent).toContain("3.3 h");
  });
  it("shares only existing native material groups and includes remarks/work/status facts", () => {
    const text = buildManagementShare({ ...state.dpr, progress: [{ activity: "WMM", quantity: 56.25, uom: "Cum" }], labour: [{ count: 2 }], remarks: "Rain" },
      [machine, { ...machine, usageStatus: "breakdown" }], [{ material: "WMM", quantity: 12, uom: "MT" }, { material: "WMM", quantity: 4, uom: "Cum" }]);
    expect(text).toContain("Work done: WMM: 56.25 Cum"); expect(text).toContain("1/2 working · 0 idle · 1 breakdown");
    expect(text).toContain("Materials received: 12 MT WMM (0 trips); 4 CUM WMM (0 trips)"); expect(text).toContain("Remarks: Rain");
  });
  it("uses native share when supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    expect(await shareManagementReport("DPR facts")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "DPR facts" });
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });
  it("opens encoded WhatsApp summary and copies when popup is unavailable", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(await shareManagementReport("Site & qty\n56.25 Cum")).toBe("copied");
    expect(open).toHaveBeenCalledWith("https://wa.me/?text=Site%20%26%20qty%0A56.25%20Cum", "_blank", "noopener,noreferrer");
    expect(writeText).toHaveBeenCalledWith("Site & qty\n56.25 Cum");
  });
  it("has opt-in mobile cards across all blocks and compact A4 print rules", () => {
    const css = readFileSync("client/src/components/dprManagement.css", "utf8");
    expect(css).toContain("@media screen and (max-width: 639px)");
    expect(css).toContain(".dpr-management-table td[data-label]::before");
    expect(css).not.toContain("@page");
    expect(css).toContain("page: auto !important");
    expect(css).toContain(".dpr-row-controls { display: none !important; }");
    expect(css).not.toContain("overflow-x: auto");
  });
  it("overrides the global hidden header only for this report and removes banner/shell print overflow", () => {
    const css = readFileSync("client/src/components/dprManagement.css", "utf8");
    expect(css).toContain("body:has(.dpr-management) .dpr-management-header { display: flex !important; }");
    expect(css).toContain("body:has(.dpr-management) .dpr-management-actions { display: none !important; }");
    expect(css).toContain("body:has(.dpr-management) #replit-dev-banner");
    expect(css).toContain("body:has(.dpr-management) #root *:has(.dpr-management)");
    expect(css).toContain("min-height: 0 !important");
    expect(css).toContain("overflow: visible !important");
    expect(css).not.toContain("page: dpr-management-page");
  });
});

describe("DPR-PAGE-01-FIX summary lists and complete share text", () => {
  const work = [
    { activity: "Wet Mix Macadam", quantity: 56.25, uom: "Cum", boqItemId: 7 },
    { activity: "GSB", quantity: 120, uom: "Cum" },
    { activity: "Clearing", quantity: 0.5, uom: "Ha" },
    { activity: "Diversion", quantity: 40, uom: "Sqm", isIncidental: true },
    { activity: "Prime Coat", quantity: 82.34, uom: "Sqm" },
  ];
  const tripReceipts = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: i + 1, material: "WMM", quantity: i === 0 ? 41.034 : 25, uom: "MT", source: "trip" })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: i + 6, material: "Soil", quantity: 20, uom: "MT", source: "trip" })),
  ];
  function tiles() {
    const summary = document.querySelector(".dpr-management-summary")!;
    return Array.from(summary.children) as HTMLElement[];
  }
  function list(item: typeof work[number]) {
    return `${shortItemName(item.activity)} ${managementQuantity(item, state.boqItems.find(b => b.id === item.boqItemId)).text}${item.isIncidental ? " (incidental)" : ""}`;
  }

  it("A: keeps the one-activity big quantity and full original name", () => {
    state.dpr.progress = [work[0]];
    render(<SiteReport />);
    expect(tiles()[0].querySelector("strong")?.textContent).toBe("56.25 Cum");
    expect(tiles()[0].querySelector(".dpr-management-tile-heading")?.textContent).toBe("Work done");
    expect(tiles()[0].querySelector(".dpr-management-summary-list")?.textContent).toBe("Wet Mix Macadam");
    expect([...tiles()[0].children].map(node => node.textContent)).toEqual([
      "Work done", "56.25 Cum", "Wet Mix Macadam",
    ]);
  });

  it("B: lists three native quantities in DPR order, using the shared name/quantity helpers", () => {
    state.dpr.progress = work.slice(0, 3);
    render(<SiteReport />);
    expect(tiles()[0].querySelector("strong")?.textContent).toBe("3 items");
    expect(tiles()[0].querySelector(".dpr-management-summary-list")?.textContent).toBe(work.slice(0, 3).map(list).join(" · "));
    work.slice(0, 3).forEach((item, i) => {
      expect(screen.getByTestId(`text-report-physical-${i}`).textContent).toBe(managementQuantity(item).text);
    });
    expect(tiles()[0].textContent).not.toMatch(/176\.75|₹|rate|amount|value/i);
  });

  it("C: shows five items but only the first three followed by +2 more", () => {
    state.dpr.progress = work;
    render(<SiteReport />);
    expect(tiles()[0].querySelector("strong")?.textContent).toBe("5 items");
    expect(tiles()[0].querySelector(".dpr-management-summary-list")?.textContent).toBe(`${work.slice(0, 3).map(list).join(" · ")} · +2 more`);
    expect(tiles()[0].textContent).not.toMatch(/Diversion|Prime Coat/);
    expect(screen.getByRole("table", { name: "Work done" }).textContent).toContain("Diversion");
  });

  it("D: excludes noSiteWork rows from both count and list before truncating", () => {
    state.dpr.progress = [work[0], { ...work[1], noSiteWork: true }, ...work.slice(2)];
    render(<SiteReport />);
    expect(tiles()[0].querySelector("strong")?.textContent).toBe("4 items");
    expect(tiles()[0].querySelector(".dpr-management-summary-list")?.textContent).toBe(`${[work[0], work[2], work[3]].map(list).join(" · ")} · +1 more`);
    expect(tiles()[0].textContent).not.toContain("GSB");
    expect(buildManagementShare(state.dpr, [], [])).not.toContain("GSB");
    expect(screen.getByRole("table", { name: "Work done" }).textContent).toContain("GSB");
  });

  it.each([{ progress: [] }, { progress: work.map(item => ({ ...item, noSiteWork: true })) }])("shows No site work for empty or all-excluded work %#", ({ progress }) => {
    state.dpr.progress = progress;
    render(<SiteReport />);
    expect(tiles()[0].querySelector("strong")?.textContent).toBe("No site work");
    expect(tiles()[0].querySelector(".dpr-management-summary-list")).toBeNull();
    expect(buildManagementShare(state.dpr, [], []).split("\n")[1]).toBe("Work done: No site work");
  });

  it("marks a single incidental activity and retains the one-item quantity", () => {
    state.dpr.progress = [work[3], { ...work[0], noSiteWork: true }];
    render(<SiteReport />);
    expect(tiles()[0].querySelector("strong")?.textContent).toBe("40 Sqm");
    expect(tiles()[0].querySelector(".dpr-management-tile-heading")?.textContent).toBe("Work done");
    expect(tiles()[0].querySelector(".dpr-management-summary-list")?.textContent).toBe("Diversion (incidental)");
    expect(buildManagementShare(state.dpr, [], [])).toContain("Work done: Diversion: 40 Sqm (incidental)");
  });

  it("marks incidental activities within multi-item lists", () => {
    state.dpr.progress = [work[3], work[2]];
    render(<SiteReport />);
    expect(tiles()[0].querySelector(".dpr-management-summary-list")?.textContent).toBe("Diversion 40 Sqm (incidental) · Clearing 0.5 Ha");
  });

  it("E: lists two material groups with quantity and their grouped trip counts", () => {
    state.receipts = tripReceipts;
    render(<SiteReport />);
    expect(tiles()[1].querySelector("strong")?.textContent).toBe("2 materials");
    expect(tiles()[1].querySelector(".dpr-management-summary-list")?.textContent).toBe("WMM 141.03 MT (5 trips) · Soil 60 MT (3 trips)");
  });

  it("F: retains one-material quantity and adds 5 trips to its small line", () => {
    state.receipts = tripReceipts.slice(0, 5);
    render(<SiteReport />);
    expect(tiles()[1].querySelector("strong")?.textContent).toBe("141.03 MT");
    expect(tiles()[1].querySelector(".dpr-management-tile-heading")?.textContent).toBe("Materials received");
    expect(tiles()[1].querySelector(".dpr-management-summary-list")?.textContent).toBe("WMM 141.03 MT (5 trips)");
  });

  it("preserves all-source quantities but matches table trip sums for mixed sources and native units", () => {
    state.receipts = [
      { material: "WMM", quantity: 12, uom: "MT", source: "trip" },
      { material: "WMM", quantity: 8, uom: " mt ", source: "dpr" },
      { material: "WMM", quantity: 4, uom: "Cum", source: "equipment" },
      { material: "", quantity: 99, uom: "MT", source: "dpr" },
    ];
    render(<SiteReport />);
    expect(summarizeReceived(state.receipts).map(g => g.count)).toEqual([2, 1]);
    expect(managementReceivedGroups(state.receipts).map(g => g.tripCount)).toEqual([1, 0]);
    expect(tiles()[1].querySelector(".dpr-management-summary-list")?.textContent).toBe("WMM 20 MT (1 trips) · WMM 4 CUM (0 trips)");
    expect(buildManagementShare(state.dpr, [], state.receipts)).toContain("Materials received: 20 MT WMM (1 trips); 4 CUM WMM (0 trips)");
    const table = screen.getByRole("table", { name: "Materials received" });
    const rows = within(table).getAllByRole("row").slice(1);
    const trips = (uom: string) => rows.filter(row =>
      row.querySelector('[data-label="Material"]')?.textContent === "WMM" &&
      row.querySelector('[data-label="Received qty"]')?.textContent?.trim().toUpperCase().endsWith(uom),
    ).reduce((sum, row) => sum + (Number(row.querySelector('[data-label="Trips"]')?.textContent) || 0), 0);
    expect(trips("MT")).toBe(1);
    expect(trips("CUM")).toBe(0);
    managementReceivedGroups(state.receipts).forEach(group => expect(group.tripCount).toBe(trips(group.uom)));
  });

  it.each(["dpr", "equipment"])("single material counts only trip receipts, not %s receipts", source => {
    state.receipts = [
      { material: "WMM", quantity: 12, uom: "MT", source: "trip", supplier: "Supplier A", unloadedAt: "yard" },
      { material: "WMM", quantity: 8, uom: " mt ", source, supplier: "Supplier B" },
    ];
    render(<SiteReport />);
    expect(tiles()[1].querySelector("strong")?.textContent).toBe("20 MT");
    expect(tiles()[1].querySelector(".dpr-management-tile-heading")?.textContent).toBe("Materials received");
    expect(tiles()[1].querySelector(".dpr-management-summary-list")?.textContent).toBe("WMM 20 MT (1 trips)");
    const tripSum = within(screen.getByRole("table", { name: "Materials received" })).getAllByRole("row").slice(1)
      .reduce((sum, row) => sum + (Number(row.querySelector('[data-label="Trips"]')?.textContent) || 0), 0);
    expect(tripSum).toBe(1);
    expect(buildManagementShare(state.dpr, [], state.receipts)).toContain("Materials received: 20 MT WMM (1 trips)");
  });

  it("never renders purchase amounts anywhere in the management SiteReport", () => {
    state.dpr.sitePurchases = [
      { itemDescription: "Work gloves", vendor: "Ravi Stores", quantity: 5, uom: "pairs", amount: 987654.32 },
      { itemDescription: "Safety tape", vendor: "Ravi Stores", amount: 876543.21 },
    ];
    const { container } = render(<SiteReport />);
    expect(screen.getByTestId("row-site-purchase-0").textContent).toBe("Site purchase · Work gloves · Ravi Stores · 5 pairs");
    expect(screen.getByTestId("row-site-purchase-1").textContent).toBe("Site purchase · Safety tape · Ravi Stores");
    expect(container.textContent).not.toMatch(/₹|987654|9,87,654|876543|8,76,543|amount|rate|value/i);
    expect(buildManagementShare(state.dpr, [], [])).not.toMatch(/₹|987654|876543/);
    expect(state.dpr.sitePurchases[0].amount).toBe(987654.32);
  });

  it("truncates five materials on screen but shares all five untruncated in receipt order", () => {
    state.receipts = [...tripReceipts,
      { material: "Sand", quantity: 4.75, uom: "Cum" },
      { material: "Aggregate", quantity: 19.8, uom: "MT" },
      { material: "Cement", quantity: 7.32, uom: "MT" },
    ];
    render(<SiteReport />);
    expect(tiles()[1].querySelector("strong")?.textContent).toBe("5 materials");
    expect(tiles()[1].querySelector(".dpr-management-summary-list")?.textContent).toBe("WMM 141.03 MT (5 trips) · Soil 60 MT (3 trips) · Sand 4.75 CUM (0 trips) · +2 more");
    expect(tiles()[1].textContent).not.toMatch(/Aggregate|Cement/);
    const text = buildManagementShare(state.dpr, [], state.receipts);
    expect(text).toContain("Materials received: 141.03 MT WMM (5 trips); 60 MT Soil (3 trips); 4.75 CUM Sand (0 trips); 19.8 MT Aggregate (0 trips); 7.32 MT Cement (0 trips)");
    expect(text).not.toContain("more");
  });

  it("G: guards desktop top-aligned one-row tiles, readable lists, and single-column phone wrapping", () => {
    state.dpr.progress = work.slice(0, 3);
    state.dpr.equipment = [machine];
    state.dpr.labour = [{ count: 4 }];
    state.receipts = tripReceipts;
    render(<SiteReport />);
    expect(tiles()).toHaveLength(5);
    expect(document.querySelectorAll(".dpr-management-summary-list")).toHaveLength(3);
    const css = readFileSync("client/src/components/dprManagement.css", "utf8");
    expect(css).toMatch(/\.dpr-management-summary\s*\{[^}]*align-items: start/);
    expect(css).toMatch(/@media screen and \(min-width: 768px\)\s*\{\s*\.dpr-management-summary\s*\{[^}]*flex-direction: row/);
    expect(css).toMatch(/\.dpr-management-tile-bulk\s*\{ flex-grow: 2\.2/);
    expect(css).toMatch(/\.dpr-management-tile-diesel\s*\{ flex-grow: \.85/);
    expect(css).toMatch(/\.dpr-management-tile-labour\s*\{ flex-grow: \.7/);
    expect(css).toMatch(/\.dpr-management-summary-list\s*\{[^}]*display: block;[^}]*font-size: 12\.5px;[^}]*color: #334155;[^}]*overflow-wrap: anywhere/);
    expect(css).toMatch(/\.dpr-management-summary\s*\{[^}]*flex-direction: column/);
    expect(css).toContain(".dpr-management-summary strong { display: block; font-size: 19px; white-space: nowrap; }");
  });

  it("H: the actual Share button passes every activity and material to native sharing", async () => {
    state.dpr.progress = work;
    state.receipts = tripReceipts;
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    try {
      render(<SiteReport />);
      fireEvent.click(screen.getByTestId("button-share-whatsapp"));
      await waitFor(() => expect(share).toHaveBeenCalledOnce());
      const text = share.mock.calls[0][0].text;
      expect(text).toBe(buildManagementShare(state.dpr, [], state.receipts, state.boqItems));
      expect(text.split("\n")[1]).toBe(`Work done: ${work.map(item => `${shortItemName(item.activity)}: ${managementQuantity(item).text}${item.isIncidental ? " (incidental)" : ""}`).join("; ")}`);
      expect(text).toContain("Materials received: 141.03 MT WMM (5 trips); 60 MT Soil (3 trips)");
      expect(text).not.toMatch(/\+\d+ more|₹|rate|amount|value/i);
    } finally {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    }
  });

  it.each([2, null])("preserves saved structure factor 3 over BOQ factor %s in summary/table/share", itemFactor => {
    const item = { itemOfWork: "Concrete", quantity: 10, uom: "MT", boqItemId: 8, dprConversionFactor: 3 };
    state.boqItems = [{ id: 8, unit: "Cum", dprConversionFactor: itemFactor }];
    state.dpr.workType = "structure";
    state.dpr.structureItems = [item];
    state.dpr.progress = work;
    render(<SiteReport />);
    expect(tiles()[0].querySelector("strong")?.textContent).toBe("10 MT");
    expect(tiles()[0].querySelector(".dpr-management-tile-heading")?.textContent).toBe("Work done");
    expect(tiles()[0].querySelector(".dpr-management-summary-list")?.textContent).toBe("Concrete");
    expect(screen.getByText("BOQ credit 30 Cum")).toBeTruthy();
    const normalized = { ...item, kind: "structure", activity: item.itemOfWork };
    expect(managementQuantity(normalized, state.boqItems[0]).measurement.boqQty).toBe(30);
    expect(managementWorkEntries([normalized], state.boqItems)[0].quantity).toBe("10 MT");
    expect(buildManagementShare(state.dpr, [], [], state.boqItems).split("\n")[1]).toBe("Work done: Concrete: 10 MT");
    expect(item).not.toHaveProperty("rowConversionFactor");
  });

  it("keeps list truncation a presentation-only operation with a correct remaining count", () => {
    expect(managementSummaryList([])).toBe("");
    expect(managementSummaryList(["a", "b", "c"])).toBe("a · b · c");
    expect(managementSummaryList(["a", "b", "c", "d"])).toBe("a · b · c · +1 more");
  });
});