// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toast: vi.fn(),
  fetch: vi.fn(),
  equipment: [{
    id: 1,
    name: "Excavator 1",
    isActive: 1,
    meterType: "hour_meter",
    consumptionNorm: 10,
    ownership: "owned",
  }] as Array<Record<string, unknown>>,
  usage: [] as Array<Record<string, unknown>>,
  incoming: [] as Array<Record<string, unknown>>,
  sites: [{ id: 1, name: "SITE A", isActive: 1 }] as Array<Record<string, unknown>>,
  empty: [] as Array<Record<string, unknown>>,
  mutationCalls: [] as Array<{ data: any }>,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = options.queryKey?.[0];
    if (key === "/api/plant-module/equipment") {
      return { data: mocks.equipment, isLoading: false };
    }
    if (key === "/api/plant-module/equipment-usage") {
      return { data: mocks.usage, isLoading: false };
    }
    if (key === "/api/plant-module/equipment-usage/incoming") {
      return { data: mocks.incoming, isLoading: false };
    }
    if (key === "/api/sites") {
      return { data: mocks.sites, isLoading: false };
    }
    return { data: mocks.empty, isLoading: false };
  },
  useMutation: () => ({
    isPending: false,
    mutate: (data: any) => mocks.mutationCalls.push({ data }),
  }),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: mocks.apiRequest,
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    sectionCan: () => true,
    isAdmin: true,
    user: { id: 7, fullName: "Test User" },
  }),
}));
vi.mock("@/lib/featureFlags", () => ({
  useFeatureFlags: () => ({ companyName: "Test Company", logoFile: "" }),
}));
vi.mock("@/hooks/use-origin", () => ({
  useOrigin: () => ({ getPlantBackLink: () => "/plant" }),
}));
vi.mock("@/hooks/use-form-draft", () => ({
  useFormDraft: () => ({
    clearDraft: vi.fn(),
    lastSavedAt: null,
    draftSavedAt: null,
  }),
}));
vi.mock("@/hooks/use-upload", () => ({
  useUpload: () => ({ uploadFile: vi.fn() }),
}));
vi.mock("@/lib/equipmentContinuity", () => ({
  fetchLatestPriorClosing: vi.fn().mockResolvedValue({ closingReading: null }),
}));
vi.mock("@/components/EditPermissionButton", () => ({
  EditPermissionButton: () => null,
}));
vi.mock("@/components/AutoSaveIndicator", () => ({
  AutoSaveIndicator: () => null,
}));
vi.mock("@/components/DraftRestoredBanner", () => ({
  DraftRestoredBanner: () => null,
}));
vi.mock("@/components/InsufficientDieselDialog", () => ({
  InsufficientDieselDialog: () => null,
  parseInsufficientPlantStock: () => null,
}));
vi.mock("@/components/BreakdownStoppageEditor", () => ({
  BreakdownStoppageEditor: () => null,
}));
vi.mock("@/components/EquipmentMasterCreateDialog", () => ({
  EquipmentMasterCreateDialog: () => null,
}));

import PlantEquipmentUsage from "../client/src/pages/PlantEquipmentUsage";

async function openEntry() {
  render(<PlantEquipmentUsage />);
  fireEvent.click(screen.getByTestId("button-add-usage"));
  await screen.findByTestId("select-equipment");
  fireEvent.click(screen.getByTestId("select-equipment"));
  fireEvent.click(await screen.findByRole("option", { name: /Excavator 1/ }));
  await waitFor(() => expect(screen.getByTestId("input-opening-reading")).toBeTruthy());
  await waitFor(() => expect((screen.getByTestId("input-opening-diesel") as HTMLInputElement).disabled).toBe(false));
}

function chooseDieselSource(label: RegExp) {
  fireEvent.click(screen.getByTestId("select-diesel-source"));
  fireEvent.click(screen.getByRole("option", { name: label }));
}

function fillMeterReadings() {
  fireEvent.change(screen.getByTestId("input-opening-reading"), { target: { value: "100" } });
  fireEvent.change(screen.getByTestId("input-closing-reading"), { target: { value: "110" } });
}

describe("DIESEL01 Plant equipment usage", () => {
  beforeEach(() => {
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      scrollIntoView: { configurable: true, value: vi.fn() },
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    });
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/plant/equipment-usage");
    mocks.usage.length = 0;
    mocks.incoming.length = 0;
    mocks.mutationCalls.length = 0;
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ previousBalance: 50 }),
    });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("blocks positive plant-stock diesel when the closing tank balance is missing", async () => {
    await openEntry();
    chooseDieselSource(/Plant Stock/);
    fillMeterReadings();
    fireEvent.change(screen.getByTestId("input-diesel-issued"), { target: { value: "20" } });

    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.toast.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      variant: "destructive",
    }));
    expect(mocks.toast.mock.calls.at(-1)?.[0].title).toMatch(/tank|balance|opening|closing/i);
    expect(mocks.mutationCalls).toHaveLength(0);
  });

  it("blocks positive plant-stock diesel when the opening tank balance is missing", async () => {
    await openEntry();
    chooseDieselSource(/Plant Stock/);
    fillMeterReadings();
    fireEvent.change(screen.getByTestId("input-opening-diesel"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("input-diesel-issued"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("input-diesel-balance"), { target: { value: "10" } });

    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.toast.mock.calls.at(-1)?.[0].title).toMatch(/opening/i);
    expect(mocks.mutationCalls).toHaveLength(0);
  });

  it("blocks a negative opening tank balance for positive plant-stock diesel", async () => {
    await openEntry();
    chooseDieselSource(/Plant Stock/);
    fillMeterReadings();
    fireEvent.change(screen.getByTestId("input-opening-diesel"), { target: { value: "-1" } });
    fireEvent.change(screen.getByTestId("input-diesel-issued"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("input-diesel-balance"), { target: { value: "10" } });

    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.toast.mock.calls.at(-1)?.[0].title).toMatch(/opening|non-negative/i);
    expect(mocks.mutationCalls).toHaveLength(0);
  });

  it("accepts explicit zero opening and closing tank readings for positive plant-stock diesel", async () => {
    await openEntry();
    chooseDieselSource(/Plant Stock/);
    fillMeterReadings();
    fireEvent.change(screen.getByTestId("input-opening-diesel"), { target: { value: "0" } });
    fireEvent.change(screen.getByTestId("input-diesel-issued"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("input-diesel-balance"), { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.mutationCalls).toHaveLength(1));
    expect(mocks.mutationCalls[0].data).toEqual(expect.objectContaining({
      dieselSource: "plant_stock",
      dieselIssued: 20,
      openingDiesel: 0,
      dieselBalanceInTank: 0,
    }));
  });

  it("saves an optional contractor diesel advance while keeping tank fields hidden", async () => {
    await openEntry();
    chooseDieselSource(/Contractor Provided/);
    fillMeterReadings();

    const dieselInput = screen.getByTestId("input-diesel-issued");
    expect(dieselInput).toBeTruthy();
    expect(screen.queryByTestId("input-opening-diesel")).toBeNull();
    expect(screen.queryByTestId("input-diesel-balance")).toBeNull();
    fireEvent.change(dieselInput, { target: { value: "12.5" } });
    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.mutationCalls).toHaveLength(1));
    expect(mocks.mutationCalls[0].data).toEqual(expect.objectContaining({
      dieselIncluded: true,
      dieselSource: "contractor",
      dieselIssued: 12.5,
      openingDiesel: null,
      dieselBalanceInTank: null,
      dieselBalanceConfirmed: false,
    }));
  });

  it("retains contractor diesel on the incoming close payload with null tank fields", async () => {
    window.history.replaceState({}, "", "/plant/equipment-usage?plant=HMP%20PLANT");
    mocks.incoming.push({
      id: 77,
      date: "2026-09-01",
      equipmentId: 1,
      openingReading: 100,
      closingReading: null,
      entryType: "time_meter",
      dieselIncluded: true,
      dieselSource: "contractor",
      dieselIssued: null,
      openingDiesel: null,
      dieselBalanceInTank: null,
      dieselBalanceConfirmed: false,
      remarks: "",
    });
    render(<PlantEquipmentUsage />);
    fireEvent.click(await screen.findByTestId("button-adopt-incoming-77"));
    await screen.findByTestId("input-closing-reading");
    fireEvent.change(screen.getByTestId("input-closing-reading"), { target: { value: "110" } });
    expect(screen.queryByTestId("input-opening-diesel")).toBeNull();
    expect(screen.queryByTestId("input-diesel-balance")).toBeNull();
    fireEvent.change(screen.getByTestId("input-diesel-issued"), { target: { value: "8.5" } });
    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.mutationCalls).toHaveLength(1));
    expect(mocks.mutationCalls[0].data).toEqual(expect.objectContaining({
      id: 77,
      data: expect.objectContaining({
        dieselIncluded: true,
        dieselSource: "contractor",
        dieselIssued: 8.5,
        openingDiesel: null,
        dieselBalanceInTank: null,
        dieselBalanceConfirmed: false,
      }),
    }));
  });

  it("blocks an incoming plant-stock completion before mutation when the tank balance is missing", async () => {
    window.history.replaceState({}, "", "/plant/equipment-usage?plant=HMP%20PLANT");
    mocks.incoming.push({
      id: 78,
      date: "2026-09-01",
      equipmentId: 1,
      openingReading: 100,
      closingReading: null,
      entryType: "time_meter",
      dieselIncluded: false,
      dieselSource: "plant_stock",
      dieselIssued: null,
      openingDiesel: 0,
      dieselBalanceInTank: null,
      dieselBalanceConfirmed: false,
      remarks: "",
    });
    render(<PlantEquipmentUsage />);
    fireEvent.click(await screen.findByTestId("button-adopt-incoming-78"));
    await screen.findByTestId("input-closing-reading");
    fireEvent.change(screen.getByTestId("input-closing-reading"), { target: { value: "110" } });
    fireEvent.change(screen.getByTestId("input-diesel-issued"), { target: { value: "8.5" } });
    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.toast.mock.calls.at(-1)?.[0].title).toMatch(/tank|balance|opening|closing/i);
    expect(mocks.mutationCalls).toHaveLength(0);
  });

  it("retains contractor diesel on the send-to-site create payload with null tank fields", async () => {
    await openEntry();
    chooseDieselSource(/Contractor Provided/);
    fillMeterReadings();
    fireEvent.click(screen.getByTestId("toggle-send-to-site"));
    fireEvent.click(screen.getByTestId("select-destination-site"));
    fireEvent.click(await screen.findByRole("option", { name: "SITE A" }));
    fireEvent.change(screen.getByTestId("input-diesel-issued"), { target: { value: "6.25" } });
    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.mutationCalls).toHaveLength(1));
    expect(mocks.mutationCalls[0].data).toEqual(expect.objectContaining({
      status: "open",
      dieselIncluded: true,
      dieselSource: "contractor",
      dieselIssued: 6.25,
      openingDiesel: null,
      dieselBalanceInTank: null,
      dieselBalanceConfirmed: false,
    }));
  });

  it("retains contractor diesel on an existing-entry update and hides tank inputs for explicit contractor source", async () => {
    mocks.usage.push({
      id: 42,
      date: "2026-09-01",
      equipmentId: 1,
      entryType: "time_meter",
      openingReading: 100,
      closingReading: 110,
      startTime: null,
      endTime: null,
      openingDiesel: null,
      dieselIssued: null,
      dieselIncluded: false,
      dieselSource: "contractor",
      dieselBalanceInTank: null,
      dieselBalanceConfirmed: false,
      expectedDiesel: null,
      hoursOrKmRun: 10,
      remarks: "",
    });
    render(<PlantEquipmentUsage />);
    fireEvent.click(await screen.findByTestId("button-edit-usage-42"));
    const dieselInput = await screen.findByTestId("input-diesel-issued");
    expect(screen.queryByTestId("input-opening-diesel")).toBeNull();
    expect(screen.queryByTestId("input-diesel-balance")).toBeNull();
    fireEvent.change(dieselInput, { target: { value: "4.75" } });
    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.mutationCalls).toHaveLength(1));
    expect(mocks.mutationCalls[0].data).toEqual(expect.objectContaining({
      id: 42,
      data: expect.objectContaining({
        dieselIncluded: false,
        dieselSource: "contractor",
        dieselIssued: 4.75,
        openingDiesel: null,
        dieselBalanceInTank: null,
        dieselBalanceConfirmed: false,
      }),
    }));
  });

  it("blocks an existing plant-stock update before mutation when the tank balance is missing", async () => {
    mocks.usage.push({
      id: 43,
      date: "2026-09-01",
      equipmentId: 1,
      entryType: "time_meter",
      openingReading: 100,
      closingReading: 110,
      startTime: null,
      endTime: null,
      openingDiesel: 0,
      dieselIssued: null,
      dieselIncluded: false,
      dieselSource: "plant_stock",
      dieselBalanceInTank: null,
      dieselBalanceConfirmed: false,
      expectedDiesel: null,
      hoursOrKmRun: 10,
      remarks: "",
    });
    render(<PlantEquipmentUsage />);
    fireEvent.click(await screen.findByTestId("button-edit-usage-43"));
    await screen.findByTestId("input-diesel-issued");
    fireEvent.change(screen.getByTestId("input-diesel-issued"), { target: { value: "4.75" } });
    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.toast.mock.calls.at(-1)?.[0].title).toMatch(/tank|balance|opening|closing/i);
    expect(mocks.mutationCalls).toHaveLength(0);
  });

  it("blocks a send-to-site plant-stock advance before the create mutation when the tank balance is missing", async () => {
    await openEntry();
    chooseDieselSource(/Plant Stock/);
    fillMeterReadings();
    fireEvent.click(screen.getByTestId("toggle-send-to-site"));
    fireEvent.click(screen.getByTestId("select-destination-site"));
    fireEvent.click(await screen.findByRole("option", { name: "SITE A" }));
    fireEvent.change(screen.getByTestId("input-diesel-issued"), { target: { value: "6.25" } });
    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.toast.mock.calls.at(-1)?.[0].title).toMatch(/tank|balance|opening|closing/i);
    expect(mocks.mutationCalls).toHaveLength(0);
  });

  it("keeps direct purchase details and tank fields available", async () => {
    await openEntry();
    chooseDieselSource(/Direct Site Purchase/);
    fillMeterReadings();
    fireEvent.change(screen.getByTestId("input-site-name"), { target: { value: "Site A" } });
    fireEvent.change(screen.getByTestId("input-fuel-station"), { target: { value: "HP" } });
    fireEvent.change(screen.getByTestId("input-bill-number"), { target: { value: "B-1" } });
    fireEvent.change(screen.getByTestId("input-amount-paid"), { target: { value: "1000" } });
    fireEvent.change(screen.getByTestId("input-opening-diesel"), { target: { value: "30" } });
    fireEvent.change(screen.getByTestId("input-diesel-issued"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("input-diesel-balance"), { target: { value: "25" } });
    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.mutationCalls).toHaveLength(1));
    expect(mocks.mutationCalls[0].data).toEqual(expect.objectContaining({
      dieselIncluded: false,
      dieselSource: "direct_purchase",
      fuelStation: "HP",
      billNumber: "B-1",
      amountPaid: 1000,
      openingDiesel: 30,
      dieselIssued: 5,
      dieselBalanceInTank: 25,
    }));
  });

  it("does not require tank readings when plant-stock diesel is zero", async () => {
    await openEntry();
    chooseDieselSource(/Plant Stock/);
    fillMeterReadings();
    fireEvent.change(screen.getByTestId("input-opening-diesel"), { target: { value: "0" } });
    fireEvent.change(screen.getByTestId("input-diesel-issued"), { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("button-save-usage"));

    await waitFor(() => expect(mocks.mutationCalls).toHaveLength(1));
    expect(mocks.mutationCalls[0].data).toEqual(expect.objectContaining({
      dieselSource: "plant_stock",
      dieselIssued: 0,
      dieselBalanceInTank: null,
    }));
  });
});