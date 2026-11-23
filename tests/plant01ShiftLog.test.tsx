// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  personnel: [{ id: 42, name: "Linked Staff Name", isActive: 1 }],
  dgs: [{
    equipmentId: 5,
    equipmentName: "DG-5",
    usage: null,
    openingMeterPrefill: 123.4,
    openingDieselPrefill: 78,
    prefillFrom: "previous closing",
  }],
  noDgs: [] as any[],
  settings: { dgProductionEquipmentIds: "[5]", boilerFuelMeterMode: "working" as "working" | "dips_only" },
  previous: null as any,
  featureCan: vi.fn(() => true),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = options.queryKey?.[0];
    if (key === "/api/personnel") return { data: mocks.personnel, isLoading: false };
    if (key === "/api/plant-module/plant-settings") return { data: mocks.settings, isLoading: false };
    if (key === "/api/plant-module/shift-logs/previous-before") return { data: mocks.previous, isLoading: false };
    if (key === "/api/plant-module/shift-logs/by-date") return { data: undefined, isLoading: false };
    if (key === "/api/plant-module/shift-logs/dg-readings") {
      let selected: number[] = [];
      try {
        selected = JSON.parse(mocks.settings.dgProductionEquipmentIds || "[]");
      } catch {}
      const readings = mocks.dgs.every((row: any) => selected.includes(row.equipmentId))
        ? mocks.dgs
        : mocks.noDgs;
      return { data: readings, isLoading: false };
    }
    if (key === "/api/plant-module/heating-sessions/dryer-source-mismatches") return { data: [], isLoading: false };
    if (key === "/api/plant-module/heating-sessions") return { data: [], isLoading: false };
    if (key === "/api/plant-module/shift-logs/reconciliation") return { data: {}, isLoading: false };
    return { data: [], isLoading: false };
  },
  useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useRoute: () => [true, { date: "2026-11-22" }],
  useLocation: () => ["/plant/shift-log/2026-11-22", vi.fn()],
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(), getQueryData: vi.fn() },
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 901, fullName: "Operator User", personnelId: 42, isOwner: false, isAdmin: false },
    featureCan: mocks.featureCan,
    sectionCan: () => false,
  }),
}));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ defaultPlantName: "HMP Plant" }) }));
vi.mock("@/hooks/use-origin", () => ({
  useOrigin: () => ({
    isFromPortal: false,
    appendPlantContext: (path: string) => path,
    getPlantBackLink: () => "/plant",
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-form-draft", () => ({
  useFormDraft: () => ({
    clearDraft: vi.fn(),
    wasRestoredRef: { current: false },
    lastSavedAt: null,
    draftSavedAt: null,
  }),
}));
vi.mock("@/components/EditPermissionButton", () => ({ EditPermissionButton: () => null }));
vi.mock("@/components/AutoSaveIndicator", () => ({ AutoSaveIndicator: () => null }));
vi.mock("@/components/DraftRestoredBanner", () => ({ DraftRestoredBanner: () => null }));
vi.mock("@/components/ReportExportGate", () => ({ ReportExportGate: ({ children }: any) => <>{children}</> }));
vi.mock("@/components/DryerSourceFixDialog", () => ({ default: () => null }));

import PlantShiftLog from "../client/src/pages/PlantShiftLog";

describe("PLANT-01 shift readings entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings = { dgProductionEquipmentIds: "[5]", boilerFuelMeterMode: "working" };
    mocks.previous = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("ldo-meter/last?tank=2")) {
        return {
          ok: true,
          json: async () => ({ value: 246.7, source: "previous closing meter" }),
        } as Response;
      }
      if (String(input).includes("ldo-meter/last?tank=1")) {
        return {
          ok: true,
          json: async () => ({ value: 135.8, source: "previous closing meter" }),
        } as Response;
      }
      if (String(input).includes("/by-date/2026-11-21")) {
        return {
          ok: true,
          json: async () => ({ bitumenTank1ClosingDip: 41.5, bitumenTank2ClosingDip: 37.2 }),
        } as Response;
      }
      if (String(input).includes("previous-before/")) {
        return { ok: true, json: async () => mocks.previous } as Response;
      }
      if (String(input).includes("dips-only-inputs")) {
        return { ok: true, json: async () => ({ receiptLitres: 4000, transferLitres: 200 }) } as Response;
      }
      return { ok: false, status: 404, json: async () => null, text: async () => "" } as Response;
    }));
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      scrollIntoView: { configurable: true, value: vi.fn() },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps visible readings and LDO dips and boiler meters in More details", async () => {
    render(<PlantShiftLog />);
    const card = screen.getByTestId("card-shift-start-end");
    const opening = within(screen.getByTestId("section-opening-readings"));
    const closing = within(screen.getByTestId("section-closing-readings"));
    const moreDetails = within(screen.getByTestId("details-shift-more"));

    await waitFor(() => expect((within(card).getByTestId("input-operator") as HTMLInputElement).value).toBe("Linked Staff Name"));
    expect(opening.getByTestId("input-bitumen-t1-open").isConnected).toBe(true);
    expect(closing.getByTestId("input-bitumen-t1-close").isConnected).toBe(true);
    expect(opening.queryByTestId("input-ldo-dip-t1-open-main")).toBeNull();
    expect(opening.queryByTestId("input-ldo-dip-t2-open-main")).toBeNull();
    expect(closing.queryByTestId("input-ldo-dip-t1-close-main")).toBeNull();
    expect(closing.queryByTestId("input-ldo-dip-t2-close-main")).toBeNull();
    expect(moreDetails.getByTestId("input-ldo-dip-t1-open-main").isConnected).toBe(true);
    expect(moreDetails.getByTestId("input-ldo-dip-t2-open-main").isConnected).toBe(true);
    expect(moreDetails.getByTestId("input-ldo-dip-t1-close-main").isConnected).toBe(true);
    expect(moreDetails.getByTestId("input-ldo-dip-t2-close-main").isConnected).toBe(true);
    expect(moreDetails.getByTestId("input-ldo-t1-open").isConnected).toBe(true);
    expect(opening.getByTestId("input-ldo-t2-open").isConnected).toBe(true);
    expect(closing.getByTestId("input-ldo-t2-close").isConnected).toBe(true);
    expect((opening.getByTestId("input-dg-5-openingReading") as HTMLInputElement).value).toBe("123.4");
    expect((opening.getByTestId("input-dg-5-openingDiesel") as HTMLInputElement).value).toBe("78");
    expect(closing.getByTestId("input-dg-5-closingReading").isConnected).toBe(true);
    expect(closing.getByTestId("input-dg-5-closingDiesel").isConnected).toBe(true);
  });

  it("shows boiler meter readings in More details when boiler operation is selected", async () => {
    render(<PlantShiftLog />);
    const details = screen.getByTestId("details-shift-more");
    fireEvent.click(within(details).getByText("More details"));
    fireEvent.click(screen.getByTestId("switch-boiler-runs-during-production"));
    const opening = within(details);
    const closing = within(details);

    expect(opening.getByTestId("input-ldo-t1-open").isConnected).toBe(true);
    expect(closing.getByTestId("input-ldo-t1-close").isConnected).toBe(true);
    await waitFor(() => expect((opening.getByTestId("input-ldo-t1-open") as HTMLInputElement).value).toBe("135.8"));
  });

  it("opens Plant stopped directly in the idle-event dialog with the current time", () => {
    render(<PlantShiftLog />);
    fireEvent.click(screen.getByTestId("button-quick-plant-stopped"));
    const start = screen.getByTestId("input-idle-start") as HTMLInputElement;
    expect(start.value).toMatch(/^\d{2}:\d{2}$/);
  });

  it("carries the previous shift's dryer tank and shows the note", async () => {
    mocks.previous = { dryerFedFrom: "TANK_1" };
    render(<PlantShiftLog />);
    expect(await screen.findByText("Same as previous day")).toBeTruthy();
    expect(screen.getByTestId("select-dryer-fed-from").textContent).toContain("Tank 1 (small vertical)");
  });

  it("keeps LDO dips and boiler fields in More details and shows only configured DGs", () => {
    mocks.settings = { dgProductionEquipmentIds: "[]", boilerFuelMeterMode: "dips_only" };
    render(<PlantShiftLog />);
    const opening = within(screen.getByTestId("section-opening-readings"));
    const closing = within(screen.getByTestId("section-closing-readings"));
    expect(opening.queryByTestId("input-ldo-dip-t1-open-main")).toBeNull();
    expect(opening.queryByTestId("input-ldo-dip-t2-open-main")).toBeNull();
    expect(closing.queryByTestId("input-ldo-dip-t1-close-main")).toBeNull();
    expect(closing.queryByTestId("input-ldo-dip-t2-close-main")).toBeNull();
    const moreDetails = within(screen.getByTestId("details-shift-more"));
    expect(moreDetails.getByTestId("input-ldo-dip-t1-open-main").isConnected).toBe(true);
    expect(moreDetails.getByTestId("input-ldo-dip-t2-open-main").isConnected).toBe(true);
    expect(moreDetails.getByTestId("input-ldo-dip-t1-close-main").isConnected).toBe(true);
    expect(moreDetails.getByTestId("input-ldo-dip-t2-close-main").isConnected).toBe(true);
    expect(moreDetails.getByTestId("input-ldo-t1-open").isConnected).toBe(true);
    expect(moreDetails.getByTestId("input-ldo-t1-close").isConnected).toBe(true);
    expect(moreDetails.getByTestId("switch-boiler-runs-during-production").isConnected).toBe(true);
    expect(screen.queryByTestId("input-dg-5-openingReading")).toBeNull();
  });
});
