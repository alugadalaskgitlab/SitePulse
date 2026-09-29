// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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
  it.each(["draft", "submitted"])("renders %s row data and omits only empty Breakdown sections", dprStatus => {
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
    const normal = screen.getByTestId("equipment-compact-0");
    const stopped = screen.getByTestId("equipment-compact-1");
    const statusOnly = screen.getByTestId("equipment-compact-2");
    expect(within(normal).queryByTestId("equipment-compact-read-group-breakdowns-0")).toBeNull();
    expect(within(statusOnly).queryByTestId("equipment-compact-read-group-breakdowns-2")).toBeNull();
    expect(within(statusOnly).getByTestId("equipment-compact-read-group-identity-2").textContent).toContain("Breakdown");
    expect(within(stopped).getByTestId("equipment-compact-breakdown-1-0").textContent).toContain("Hydraulic hose");
    expect(within(stopped).getByTestId("equipment-compact-read-group-breakdowns-1").textContent).toContain("Debitable to vendor: Yes");
    expect(within(normal).getByTestId("equipment-compact-read-group-identity-0").textContent).toContain("Fixture Hire");
    expect(within(normal).getByTestId("equipment-compact-read-group-identity-0").textContent).toContain("hourly");
    expect(within(normal).getByTestId("equipment-compact-read-group-readings-0").textContent).toContain("8:00 AM");
    expect(within(normal).getByTestId("equipment-compact-read-group-diesel-0").textContent).toContain("Confirmed");
    expect(within(normal).getByTestId("equipment-compact-read-group-performance-0").textContent).toContain("Actual Consumed");
    expect(within(normal).getByTestId("equipment-compact-read-group-performance-0").textContent).toContain("Expected");
    expect(within(normal).getByTestId("equipment-compact-read-group-performance-0").textContent).toContain("Actual Consumption Rate");
    expect(within(normal).getByTestId("equipment-compact-group-work-0").textContent).toContain("Incidental diversion, not BOQ");
    expect(within(normal).getByTestId("equipment-compact-group-work-0").textContent).toContain("Fixture BOQ work");
  });
});

it("SiteReport passes already-loaded linked stoppages only when an older row has no breakdowns field", () => {
  state.linkedBreakdowns = [{
    id: 90, sourceRecordId: 7291, description: "Linked hose failure",
    fromTime: "09:00", toTime: "10:00", responsibility: "vendor",
  }];
  state.dpr = {
    id: 6291, site: "FIXTURE SITE", date: "2026-08-05", engineer: "Fixture engineer",
    dprStatus: "submitted", workType: "road", boqProjectId: 5501,
    progress: [], labour: [], materials: [], sitePurchases: [],
    equipment: [{ ...machine, breakdowns: undefined }, { ...machine, id: 7292, breakdowns: [] }],
  };
  render(<SiteReport />);
  expect(screen.getByTestId("equipment-compact-read-group-breakdowns-0").textContent).toContain("Linked hose failure");
  expect(screen.queryByTestId("equipment-compact-read-group-breakdowns-1")).toBeNull();
});