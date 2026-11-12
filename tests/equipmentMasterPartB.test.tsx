// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EquipmentMasterType } from "@shared/schema";
import { EquipmentMasterRows } from "@/components/EquipmentMasterRows";
import { EquipmentMasterCreateDialog } from "@/components/EquipmentMasterCreateDialog";
import { EquipmentMasterSection } from "@/pages/Plant";
import {
  derivedEquipmentType,
  equipmentHireTermsError,
  equipmentTypeChange,
  isGeneratorEquipmentName,
} from "@shared/equipmentMasterRules";
import { buildEquipmentVendorOptions } from "../server/equipmentVendorOptions";

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    sectionCan: (section: string, action: string) => section === "master_equipment" && ["view", "edit", "create"].includes(action),
    featureCan: () => false,
    isOwner: false,
  }),
}));

const vendors = [
  { id: 1, name: "NARASIMHULU CONTRACTORS", isActive: true, aliases: ["NARASIMHULU"] },
  { id: 2, name: "INACTIVE VENDOR", isActive: false, aliases: [] },
];

function equipment(overrides: Partial<EquipmentMasterType> & { id: number; name: string }): EquipmentMasterType {
  return {
    registrationNumber: null,
    equipmentType: "Wrong saved type",
    ownership: "owned",
    vendorName: null,
    tallyCostCentreName: null,
    hireBillingBasis: null,
    hireRate: null,
    hireStartDate: null,
    hireEndDate: null,
    hireDieselResponsibility: null,
    hireOperatorResponsibility: null,
    hireAgreementRemarks: null,
    hireBreakdownDeductionEnabled: false,
    hireMonthlyDivisorType: null,
    hireMonthlyDivisor: null,
    meterType: "hour_meter",
    consumptionNorm: 12,
    plantName: null,
    isActive: 1,
    outputUnit: null,
    outputTheoretical: null,
    outputEfficiency: null,
    standardOutputs: null,
    fuelType: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as EquipmentMasterType;
}

const sampleEquipment = [
  equipment({ id: 1, name: "JCB-2 SITE", registrationNumber: "AP21AA1111" }),
  equipment({
    id: 2, name: "TIPPER-3 SITE", registrationNumber: "TS15UF7763", ownership: "hired",
    vendorName: "NARASIMHULU", hireBillingBasis: "daily", hireRate: 5000,
    hireStartDate: "2026-01-01", hireEndDate: "2026-12-31",
  }),
  equipment({
    id: 3, name: "TANDEM ROLLER-1 SITE", registrationNumber: "TS15UF3333", ownership: "hired",
    vendorName: "MONTHLY OWNER", hireBillingBasis: "monthly", hireRate: 18000,
    hireStartDate: "2026-01-01", hireEndDate: "2026-12-31", hireMonthlyDivisorType: "30",
    hireDieselResponsibility: "vendor", hireOperatorResponsibility: "hlc", hireBreakdownDeductionEnabled: true,
    hireAgreementRemarks: "Test agreement",
  }),
  equipment({ id: 4, name: "ROLLER OLD", ownership: "owned", isActive: 0 }),
];

function renderWithQuery(element: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        queryFn: async ({ queryKey }) => {
          const response = await fetch(String(queryKey[0]));
          if (!response.ok) throw new Error(`Request failed: ${response.status}`);
          return response.json();
        },
      },
    },
  });
  const result = render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return { ...result, client };
}

function InteractiveEquipmentRows({ equipmentRows = sampleEquipment, vendorNames = ["NARASIMHULU CONTRACTORS", "MONTHLY OWNER"] }: {
  equipmentRows?: EquipmentMasterType[];
  vendorNames?: string[];
}) {
  const [showInactive, setShowInactive] = useState(false);
  return (
    <EquipmentMasterRows
      equipment={equipmentRows}
      showInactive={showInactive}
      onShowInactiveChange={setShowInactive}
      vendorMasterNames={vendorNames}
      canEdit
      canDelete={false}
      onEdit={vi.fn()}
      onToggleActive={vi.fn()}
      onDelete={vi.fn()}
    />
  );
}

function selectRadixOption(trigger: HTMLElement, name: string) {
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("option", { name }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    scrollIntoView: { configurable: true, value: vi.fn() },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }),
  });
});

describe("EQUIP-MASTER-01 Part B", () => {
  it("derives row type from the name, not the legacy equipmentType field", () => {
    expect(derivedEquipmentType("JCB-2 SITE")).toBe("JCB");
    expect(equipmentTypeChange("JCB-2 SITE", "EXCAVATOR").changed).toBe(true);
    expect(equipmentTypeChange("JCB-2 SITE", "JCB-3 SITE").changed).toBe(false);
    expect(isGeneratorEquipmentName("600 KVA GENERATOR")).toBe(true);
    expect(equipmentHireTermsError({ ownership: "hired", hireBillingBasis: "hourly" })).toBeNull();
    expect(equipmentHireTermsError({ ownership: "hired", hireBillingBasis: "monthly", hireRate: 100 })).toContain("Start date");
  });

  it("maps vendor aliases only when the canonical Vendor Master name is unique", () => {
    expect(buildEquipmentVendorOptions(
      [{ id: 1, name: "Vendor A", isActive: true }, { id: 2, name: "Vendor A", isActive: true }],
      [{ alias: "V A", canonicalName: "Vendor A" }, { alias: "Unique", canonicalName: "Vendor B" }],
    )).toEqual([
      { id: 1, name: "Vendor A", isActive: true, aliases: [] },
      { id: 2, name: "Vendor A", isActive: true, aliases: [] },
    ]);
  });

  it("searches Owned and Hired independently, hides inactive rows, and expands monthly and daily details", async () => {
    renderWithQuery(<InteractiveEquipmentRows />);
    expect(screen.getByTestId("tab-equipment-owned")).toHaveTextContent("Owned (1)");
    expect(screen.queryByTestId("row-equipment-4")).toBeNull();
    expect(screen.getByTestId("row-equipment-1")).toHaveTextContent("JCB · Reg. no. AP21AA1111");
    const ownedSearch = screen.getByTestId("input-equipment-search-owned");
    fireEvent.change(ownedSearch, { target: { value: "AP21" } });
    expect(screen.getByTestId("row-equipment-1")).toBeInTheDocument();
    expect(screen.queryByTestId("row-equipment-4")).toBeNull();
    fireEvent.change(ownedSearch, { target: { value: "" } });

    fireEvent.mouseDown(screen.getByTestId("tab-equipment-hired"), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByTestId("tab-equipment-hired"));
    const hiredSearch = await screen.findByTestId("input-equipment-search-hired");
    fireEvent.change(hiredSearch, { target: { value: "narasimhulu" } });
    expect(screen.getByTestId("row-equipment-2")).toBeInTheDocument();
    expect(screen.queryByTestId("row-equipment-3")).toBeNull();
    fireEvent.change(hiredSearch, { target: { value: "7763" } });
    expect(screen.getByTestId("row-equipment-2")).toBeInTheDocument();
    expect(screen.getByTestId("row-equipment-2")).not.toHaveTextContent("Monthly ₹");
    fireEvent.click(screen.getByTestId("toggle-equipment-row-2"));
    const dailyDetails = screen.getByTestId("equipment-details-2");
    expect(dailyDetails).toHaveTextContent("Daily hire — rate set when billing");
    expect(dailyDetails).toHaveTextContent("Not in vendor master");
    expect(dailyDetails).not.toHaveTextContent("5,000");
    expect(dailyDetails).not.toHaveTextContent("Start date");
    expect(within(dailyDetails).getByTestId("button-edit-equipment-2")).toBeInTheDocument();
    fireEvent.change(hiredSearch, { target: { value: "monthly owner" } });
    expect(screen.getByTestId("row-equipment-3")).toHaveTextContent("Monthly ₹18,000");
    fireEvent.click(screen.getByTestId("toggle-equipment-row-3"));
    const monthlyDetails = screen.getByTestId("equipment-details-3");
    expect(monthlyDetails).toHaveTextContent("Start date");
    expect(monthlyDetails).toHaveTextContent("End date");
    expect(monthlyDetails).toHaveTextContent("30 days");
    expect(monthlyDetails).toHaveTextContent("Diesel by");
    expect(monthlyDetails).toHaveTextContent("Test agreement");

    fireEvent.mouseDown(screen.getByTestId("tab-equipment-owned"), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByTestId("tab-equipment-owned"));
    await screen.findByTestId("input-equipment-search-owned");
    fireEvent.click(screen.getByTestId("checkbox-show-inactive"));
    expect(screen.getByTestId("row-equipment-4")).toBeInTheDocument();
    expect(screen.getByTestId("row-equipment-4")).toHaveTextContent("Inactive");
  });

  it("creates an hourly hire with no rate or dates, using a Vendor Master alias", async () => {
    let posted: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/plant-module/plant-settings") return new Response("[]", { status: 200 });
      if (url === "/api/plant-module/equipment-vendors") return new Response(JSON.stringify(vendors), { status: 200 });
      if (url === "/api/plant-module/equipment" && init?.method === "POST") {
        posted = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ id: 90, ...posted }), { status: 201 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    renderWithQuery(<EquipmentMasterCreateDialog open initialName="JCB" />);
    fireEvent.change(screen.getByTestId("select-ownership"), { target: { value: "hired" } });
    await waitFor(() => expect((screen.getByTestId("button-equipment-vendor-picker") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("button-equipment-vendor-picker"));
    fireEvent.change(screen.getByTestId("input-equipment-vendor-search"), { target: { value: "narasimhulu" } });
    fireEvent.click(screen.getByTestId("option-equipment-vendor-1"));
    selectRadixOption(screen.getByTestId("select-hire-basis"), "Hourly");
    expect(screen.queryByTestId("input-hire-rate")).toBeNull();
    expect(screen.queryByTestId("input-hire-start-date")).toBeNull();
    expect(screen.queryByTestId("input-hire-end-date")).toBeNull();
    fireEvent.click(screen.getByTestId("button-save-equipment"));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({
      name: "JCB",
      ownership: "hired",
      vendorId: 1,
      vendorName: "NARASIMHULU CONTRACTORS",
      hireBillingBasis: "hourly",
      hireRate: null,
      hireStartDate: null,
      hireEndDate: null,
    });
    expect(posted).not.toHaveProperty("equipmentType");
  });

  it("refuses a monthly hire without rate and start date with a plain validation message", async () => {
    let postCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/plant-module/plant-settings") return new Response("[]", { status: 200 });
      if (url === "/api/plant-module/equipment-vendors") return new Response(JSON.stringify(vendors), { status: 200 });
      if (url === "/api/plant-module/equipment" && init?.method === "POST") {
        postCount += 1;
        return new Response("{}", { status: 201 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    renderWithQuery(<EquipmentMasterCreateDialog open initialName="JCB" />);
    fireEvent.change(screen.getByTestId("select-ownership"), { target: { value: "hired" } });
    await waitFor(() => expect((screen.getByTestId("button-equipment-vendor-picker") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("button-equipment-vendor-picker"));
    fireEvent.click(screen.getByTestId("option-equipment-vendor-1"));
    selectRadixOption(screen.getByTestId("select-hire-basis"), "Monthly");
    fireEvent.click(screen.getByTestId("button-save-equipment"));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(postCount).toBe(0);
    expect(toastMock.mock.calls[0]?.[0]?.title).toContain("Monthly hire rate must be greater than zero");
  });

  it("preserves a saved hired-owner text when the vendor selection is left unchanged", async () => {
    let patched: Record<string, unknown> | null = null;
    let savedRecord: EquipmentMasterType | null = null;
    const hiredRecord = sampleEquipment[1];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/plant-module/plant-settings") return new Response("[]", { status: 200 });
      if (url === "/api/plant-module/equipment-vendors") return new Response(JSON.stringify(vendors), { status: 200 });
      if (url.startsWith("/api/plant-module/equipment")) {
        if (init?.method === "PATCH") {
          patched = JSON.parse(String(init.body));
          savedRecord = { ...hiredRecord, ...patched };
          return new Response(JSON.stringify(savedRecord), { status: 200 });
        }
        return new Response(JSON.stringify([hiredRecord]), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    renderWithQuery(<EquipmentMasterSection />);
    await screen.findByTestId("tab-equipment-owned");
    fireEvent.mouseDown(screen.getByTestId("tab-equipment-hired"), { button: 0, ctrlKey: false });
    await screen.findByTestId("row-equipment-2");
    fireEvent.click(screen.getByTestId("toggle-equipment-row-2"));
    fireEvent.click(screen.getByTestId("button-edit-equipment-2"));
    fireEvent.change(screen.getByTestId("input-equipment-name"), { target: { value: "TIPPER-4 SITE" } });
    fireEvent.click(screen.getByTestId("button-save-equipment"));
    await waitFor(() => expect(patched).not.toBeNull());
    expect(patched).not.toHaveProperty("vendorId");
    expect(patched).not.toHaveProperty("vendorName");
    expect(patched).toMatchObject({ name: "TIPPER-4 SITE" });
    for (const key of [
      "hireBillingBasis", "hireRate", "hireStartDate", "hireEndDate",
      "hireDieselResponsibility", "hireOperatorResponsibility", "hireAgreementRemarks",
      "hireBreakdownDeductionEnabled", "hireMonthlyDivisorType", "hireMonthlyDivisor",
    ]) {
      expect(patched).not.toHaveProperty(key);
    }
    await waitFor(() => expect(savedRecord?.name).toBe("TIPPER-4 SITE"));
    expect(savedRecord).toMatchObject({
      hireBillingBasis: "daily",
      hireRate: 5000,
      hireStartDate: "2026-01-01",
      hireEndDate: "2026-12-31",
    });
  });

  it("asks before a derived type change and keeps generator names read-only", async () => {
    let patched: Record<string, unknown> | null = null;
    let current = [sampleEquipment[0]];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/plant-module/plant-settings") return new Response("[]", { status: 200 });
      if (url === "/api/plant-module/equipment-vendors") return new Response(JSON.stringify(vendors), { status: 200 });
      if (url.startsWith("/api/plant-module/equipment")) {
        if (init?.method === "PATCH") {
          patched = JSON.parse(String(init.body));
          current = [equipment({ ...current[0], ...patched })];
          return new Response(JSON.stringify(current[0]), { status: 200 });
        }
        return new Response(JSON.stringify(current), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    const { client } = renderWithQuery(<EquipmentMasterSection />);
    await screen.findByTestId("row-equipment-1");
    fireEvent.click(screen.getByTestId("toggle-equipment-row-1"));
    fireEvent.click(screen.getByTestId("button-edit-equipment-1"));
    fireEvent.change(screen.getByTestId("input-equipment-name"), { target: { value: "EXCAVATOR" } });
    fireEvent.click(screen.getByTestId("button-save-equipment"));
    expect(await screen.findByText("Type changes from JCB to EXCAVATOR. New bills will use the EXCAVATOR rates from the rate card. Past records are not changed.")).toBeInTheDocument();
    expect(patched).toBeNull();
    fireEvent.click(screen.getByTestId("button-cancel-equipment-type-change"));
    expect(patched).toBeNull();
    fireEvent.click(screen.getByTestId("button-save-equipment"));
    fireEvent.click(await screen.findByTestId("button-confirm-equipment-type-change"));
    await waitFor(() => expect(patched).toMatchObject({ name: "EXCAVATOR" }));
    client.clear();

    cleanup();
    current = [equipment({ id: 9, name: "600 KVA GENERATOR" })];
    renderWithQuery(<EquipmentMasterSection />);
    await screen.findByTestId("row-equipment-9");
    fireEvent.click(screen.getByTestId("toggle-equipment-row-9"));
    fireEvent.click(screen.getByTestId("button-edit-equipment-9"));
    expect((screen.getByTestId("input-equipment-name") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText("Generator names are linked to plant logs and cannot be renamed here.")).toBeInTheDocument();
  });
});
