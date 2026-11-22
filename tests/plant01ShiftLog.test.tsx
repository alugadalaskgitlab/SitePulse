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
    if (key === "/api/plant-module/shift-logs/dg-readings") return { data: mocks.dgs, isLoading: false };
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

  it("shows opening and closing meters on the day card and prefills linked operator", async () => {
    render(<PlantShiftLog />);
    const card = screen.getByTestId("card-shift-start-end");
    const opening = within(screen.getByTestId("section-opening-readings"));
    const closing = within(screen.getByTestId("section-closing-readings"));

    await waitFor(() => expect((within(card).getByTestId("input-operator") as HTMLInputElement).value).toBe("Linked Staff Name"));
    expect((opening.getByTestId("input-bitumen-t1-open") as HTMLInputElement).value).toBe("41.5");
    await waitFor(() => expect((opening.getByTestId("input-ldo-t2-open") as HTMLInputElement).value).toBe("246.7"));
    expect(closing.getByTestId("input-bitumen-t1-close").isConnected).toBe(true);
    expect(closing.getByTestId("input-ldo-t2-close").isConnected).toBe(true);
    expect((opening.getByTestId("input-dg-5-openingReading") as HTMLInputElement).value).toBe("123.4");
    expect((opening.getByTestId("input-dg-5-openingDiesel") as HTMLInputElement).value).toBe("78");
    expect(closing.getByTestId("input-dg-5-closingReading").isConnected).toBe(true);
    expect(closing.getByTestId("input-dg-5-closingDiesel").isConnected).toBe(true);
  });

  it("shows boiler meter readings on the day card when boiler operation is selected", async () => {
    render(<PlantShiftLog />);
    fireEvent.click(screen.getByTestId("switch-boiler-runs-during-production"));
    const opening = within(screen.getByTestId("section-opening-readings"));
    const closing = within(screen.getByTestId("section-closing-readings"));

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
    expect(await screen.findByText("Same as previous day")).toBeInTheDocument();
    expect(screen.getByTestId("select-dryer-fed-from").textContent).toContain("Boiler tank");
  });

  it("uses dips-only fields, hides boiler meter inputs, and shows only configured DGs", () => {
    mocks.settings = { dgProductionEquipmentIds: "[]", boilerFuelMeterMode: "dips_only" };
    render(<PlantShiftLog />);
    const opening = within(screen.getByTestId("section-opening-readings"));
    const closing = within(screen.getByTestId("section-closing-readings"));
    expect(opening.getByTestId("input-ldo-dip-t1-open-main")).toBeInTheDocument();
    expect(closing.getByTestId("input-ldo-dip-t1-close-main")).toBeInTheDocument();
    expect(opening.queryByTestId("input-ldo-t1-open")).toBeNull();
    expect(closing.queryByTestId("input-ldo-t1-close")).toBeNull();
    expect(screen.queryByTestId("switch-boiler-runs-during-production")).toBeNull();
    expect(screen.queryByTestId("input-dg-5-openingReading")).toBeNull();
  });
});
