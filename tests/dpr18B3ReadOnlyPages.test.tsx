// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import DprDetails from "../client/src/pages/DprDetails";
import SiteReport from "../client/src/pages/SiteReport";

const state = vi.hoisted(() => ({ dpr: null as any, linkedBreakdowns: [] as any[] }));
vi.mock("../client/src/hooks/use-dprs", () => ({
  useDpr: () => ({ data: state.dpr, isLoading: false, error: null }),
}));
vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "6291" }],
  useLocation: () => ["/", vi.fn()],
  useSearch: () => "",
  Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("../client/src/lib/auth-context", () => ({
  useAuth: () => ({ sectionCan: () => false, isAdmin: false, user: { isAdmin: false } }),
}));
vi.mock("@tanstack/react-query", async importOriginal => {
  const original = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...original,
    useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey[0];
      if (key === "/api/sites") return { data: [{ id: 6060, name: "FIXTURE SITE", isActive: 1 }] };
      if (key === "/api/maintenance/logs") return { data: state.linkedBreakdowns };
      if (key === "/api/plant-module/equipment") return { data: [{
        id: 7701, ownership: "hired", vendorName: "Fixture Hire", hireBillingBasis: "monthly",
        meterType: "hour_meter", consumptionNorm: 5,
      }] };
      if (key === "/api/boq/projects" && queryKey.length === 2 && typeof queryKey[1] === "object") return { data: [{ id: 5501 }] };
      if (key === "/api/boq/projects" && queryKey[2] === "items") return { data: [{
        id: 8801, itemCode: "BOQ-B3", description: "Fixture BOQ work", displayName: "Fixture BOQ work",
      }] };
      return { data: [] };
    },
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  };
});
vi.mock("../client/src/components/ReportHeader", () => ({ ReportHeader: () => null }));
vi.mock("../client/src/components/DprPhotoGroups", () => ({ DprPhotoGroups: () => null }));
vi.mock("../client/src/components/DprMaterialsReceived", () => ({ DprMaterialsReceived: () => null }));
vi.mock("../client/src/components/DprActivityReadOnly", () => ({ DprActivityReadOnly: () => null }));
vi.mock("../client/src/components/ActivityReceiptStrip", () => ({ ActivityReceiptStrip: () => null }));
vi.mock("../client/src/components/ProgrammeBarOutcomeHistory", () => ({ ProgrammeBarOutcomeHistory: () => null }));
vi.mock("../client/src/hooks/use-dpr-boq-items", () => ({
  useDprBoqItems: () => ({ items: [{ id: 8801, itemCode: "BOQ-B3", description: "Fixture BOQ work" }] }),
}));
vi.mock("../client/src/components/EditPermissionButton", () => ({ EditPermissionButton: () => null }));
vi.mock("../client/src/components/CancelDialog", () => ({ default: () => null }));
vi.mock("../client/src/components/HistoryDialog", () => ({ default: () => null }));

afterEach(() => { cleanup(); state.dpr = null; state.linkedBreakdowns = []; });

const machine = {
  id: 7291, equipmentId: 7701, machine: "Fixture excavator", vehicleNo: "FIX-B3",
  operator: "Fixture operator", entryType: "hourly", usageStatus: "working",
  startTime: "08:00", endTime: "12:00", openingReading: 100, closingReading: 104,
  dieselSource: "plant_stock", openingDiesel: 30, diesel: 20,
  dieselBalanceInTank: 25, dieselBalanceConfirmed: true, expectedDiesel: 20,
  task: "Incidental diversion, not BOQ", breakdowns: [],
  activityAllocations: [{ boqItemId: 8801, programmeBarId: 9901, startTime: "08:00", endTime: "12:00" }],
};

describe.each([
  ["DPR details", DprDetails],
  ["Site report", SiteReport],
])("DPR18 B3 real %s read-only page", (_name, Page) => {
  it.each(["draft", "submitted"])("renders %s management rows on SiteReport and retains default audit on DprDetails", dprStatus => {
    state.dpr = {
      id: 6291, site: "FIXTURE SITE", date: "2026-08-05", engineer: "Fixture engineer",
      dprStatus, workType: "road", boqProjectId: 5501, progress: [], labour: [],
      materials: [], sitePurchases: [],
      equipment: [
        machine,
        { ...machine, id: 7292, machine: "Fixture stopped", usageStatus: "breakdown",
          breakdowns: [{ description: "Hydraulic hose", fromTime: "10:00", toTime: "11:30",
            responsibility: "vendor", repairScope: "vendor", debitableToVendor: true }] },
        { id: 7293, machine: "Fixture status only", usageStatus: "breakdown", breakdowns: [] },
      ],
    };
    render(<Page />);
    const normal = screen.getByTestId("row-equipment-0");
    const stopped = screen.getByTestId("row-equipment-1");
    const statusOnly = screen.getByTestId("row-equipment-2");
    if (_name === "Site report") {
      expect(screen.getAllByRole("table", { name: "Equipment" })).toHaveLength(1);
      expect(screen.getAllByRole("columnheader").map(node => node.textContent)).toEqual(["Machine", "Work", "Hours", "Diesel", "Consumption"]);
      expect(screen.queryByTestId("equipment-audit-details-0")).toBeNull();
      expect(screen.queryByTestId("button-equipment-details-0")).toBeNull();
      expect(normal.textContent).toContain("Hired · Fixture Hire · Hourly · Op. Fixture operator");
      expect(normal.textContent).toContain("Incidental diversion, not BOQ");
      expect(normal.textContent).toContain("Fixture BOQ work");
      expect(within(normal).getByTestId("equipment-consumption-0").textContent).toContain("6.3 L/hr");
      expect(within(normal).getByTestId("equipment-consumption-0").textContent).not.toContain("measured");
      expect(stopped.textContent).toContain("Breakdown");
      expect(statusOnly.textContent).toContain("Breakdown");
      expect(within(stopped).getByTestId("equipment-consumption-1").textContent).not.toContain("L/hr");
      expect(screen.queryByText(/Debitable to vendor/)).toBeNull();
      return;
    }
    const normalAudit = screen.getByTestId("equipment-audit-details-0");
    const stoppedAudit = screen.getByTestId("equipment-audit-details-1");
    const statusOnlyAudit = screen.getByTestId("equipment-audit-details-2");
    expect(screen.getAllByRole("table", { name: "Equipment Log" })).toHaveLength(1);
    expect(normalAudit.getAttribute("data-expanded")).toBe("false");
    expect(stoppedAudit.getAttribute("data-expanded")).toBe("false");
    expect(statusOnlyAudit.getAttribute("data-expanded")).toBe("false");
    expect(within(normalAudit).queryByTestId("equipment-table-stop-0-0")).toBeNull();
    expect(within(statusOnlyAudit).queryByTestId("equipment-table-stop-2-0")).toBeNull();
    expect(statusOnly.textContent).toContain("Breakdown");
    expect(statusOnlyAudit.textContent).toContain("Daily statusBreakdown");
    expect(stopped.textContent).toContain("Hydraulic hose");
    expect(within(stoppedAudit).getByTestId("equipment-table-stop-1-0").textContent).toContain("Hydraulic hose");
    expect(stoppedAudit.textContent).toContain("Debitable to vendor: Yes");
    expect(normal.textContent).toContain("Fixture Hire");
    expect(normal.textContent).toContain("Hourly");
    expect(normalAudit.textContent).toContain("hourly");
    expect(normalAudit.textContent).toContain("8:00 AM");
    expect(normalAudit.textContent).toContain("Confirmed");
    expect(normalAudit.textContent).toContain("DPR snapshot consumed");
    expect(normalAudit.textContent).toContain("25.000 L");
    expect(normalAudit.textContent).toContain("Saved expected diesel20.000 L");
    expect(within(normal).getByTestId("equipment-consumption-0").textContent).toContain("6.3 L/hr");
    expect(within(normal).getByTestId("equipment-consumption-0").textContent).toContain("measured ✓");
    expect(normal.textContent).toContain("Incidental diversion, not BOQ");
    expect(within(normalAudit).getByTestId("equipment-table-work-0").textContent).toContain("Fixture BOQ work");
    expect(normalAudit.textContent).toContain("Assigned:");
    expect(normalAudit.textContent).toContain("Unassigned:");
    expect(normalAudit.textContent).toContain("Machine Day:");
    fireEvent.click(within(normal).getByTestId("button-equipment-details-0"));
    expect(normalAudit.getAttribute("data-expanded")).toBe("true");
    fireEvent.click(within(stopped).getByTestId("button-equipment-details-1"));
    expect(stoppedAudit.getAttribute("data-expanded")).toBe("true");
  });
});

it("SiteReport retains child-aware linked stoppage visibility without rendering the audit panel", () => {
  state.linkedBreakdowns = [{
    id: 90, sourceRecordId: 7291, description: "Linked hose failure",
    fromTime: "09:00", toTime: "10:00", responsibility: "vendor",
  }];
  state.dpr = {
    id: 6291, site: "FIXTURE SITE", date: "2026-08-05", engineer: "Fixture engineer",
    dprStatus: "submitted", workType: "road", boqProjectId: 5501,
    progress: [], labour: [], materials: [], sitePurchases: [],
    equipment: [{ id: 7291, breakdowns: undefined }, { id: 7292, breakdowns: [] }],
  };
  render(<SiteReport />);
  expect(screen.getByTestId("row-equipment-0")).toBeTruthy();
  expect(screen.queryByTestId("row-equipment-1")).toBeNull();
  expect(screen.queryByTestId("equipment-table-stop-0-0")).toBeNull();
  expect(screen.queryByTestId("equipment-table-stop-1-0")).toBeNull();
  expect(screen.queryByTestId("equipment-table-breakdowns-1")).toBeNull();
  expect(screen.queryByTestId("equipment-audit-details-0")).toBeNull();
});