// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  api: vi.fn(), errors: [] as unknown[],
  master: { id: 991, name: "600 KVA", isActive: 1, ownership: "owned", equipmentType: "generator",
    meterType: "hour_meter", consumptionNorm: 5, dipLitersPerCm: 12.5, deadStockDepthCm: 4, tankCapacityLiters: 600 },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: any) => ({
    data: queryKey[0] === "/api/plant-module/equipment" ? [mocks.master]
      : queryKey[0] === "/api/plant-module/generators" ? [{ id: 991, name: "600 KVA" }]
      : queryKey[0] === "/api/equipment" ? null : [],
    isLoading: false,
  }),
  useMutation: (options: any) => ({
    isPending: false,
    mutate: (data: unknown) => Promise.resolve().then(() => options.mutationFn(data)).catch(e => mocks.errors.push(e)),
    mutateAsync: (data: unknown) => options.mutationFn(data),
  }),
}));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.api, queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ sectionCan: () => true, featureCan: () => true,
  isAdmin: true, isOwner: false, user: { id: 1, fullName: "Fixture" } }) }));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ companyName: "Fixture", logoFile: "" }) }));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({ getPlantBackLink: () => "/plant" }) }));
vi.mock("@/hooks/use-form-draft", () => ({ useFormDraft: () => ({ clearDraft: vi.fn() }) }));
vi.mock("@/hooks/use-upload", () => ({ useUpload: () => ({ uploadFile: vi.fn() }) }));
vi.mock("@/lib/equipmentContinuity", () => ({ fetchLatestPriorClosing: vi.fn().mockResolvedValue({ closingReading: null }) }));
vi.mock("@/components/EditPermissionButton", () => ({ EditPermissionButton: () => null }));
vi.mock("@/components/AutoSaveIndicator", () => ({ AutoSaveIndicator: () => null }));
vi.mock("@/components/DraftRestoredBanner", () => ({ DraftRestoredBanner: () => null }));
vi.mock("@/components/BreakdownStoppageEditor", () => ({ BreakdownStoppageEditor: () => null }));
vi.mock("@/components/EquipmentMasterCreateDialog", () => ({ EquipmentMasterCreateDialog: () => null }));
vi.mock("@/components/DryerSourceFixDialog", () => ({ default: () => null }));
import PlantEquipmentUsage from "@/pages/PlantEquipmentUsage";
import PlantGeneratorLogs from "@/pages/PlantGeneratorLogs";
import { HeatingSessionDialog } from "@/components/HeatingSessionDialog";

beforeEach(() => {
  mocks.api.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: 9001 })));
  mocks.errors.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => new Response(JSON.stringify(
    options?.method === "POST" ? { id: 9001, isFinalized: 1 } :
    url.includes("previous-balance") ? { previousBalance: 0, previousClosingReading: 0 } : [],
  ))));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  for (const key of ["hasPointerCapture", "setPointerCapture", "releasePointerCapture", "scrollIntoView"]) {
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: vi.fn(() => false) });
  }
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  })) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const change = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });

it("equipment usage sends both physical litres and cm through its real save mutation", async () => {
  render(<PlantEquipmentUsage />);
  fireEvent.click(screen.getByTestId("button-add-usage"));
  fireEvent.click(screen.getByTestId("select-equipment"));
  fireEvent.click(await screen.findByRole("option", { name: /600 KVA/ }));
  await waitFor(() => expect(screen.getByTestId("input-opening-diesel")).toBeEnabled());
  change("input-opening-reading", "100"); change("input-closing-reading", "110");
  fireEvent.click(screen.getByTestId("select-diesel-source"));
  fireEvent.click(screen.getByRole("option", { name: /Plant Stock/i }));
  change("input-opening-diesel", "42"); change("input-diesel-balance", "40");
  change("input-diesel-issued", "10");
  fireEvent.click(screen.getByTestId("button-save-usage"));
  await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("POST", "/api/plant-module/equipment-usage", expect.objectContaining({
    openingDipCm: 42, closingDipCm: 40, openingDiesel: 525, dieselBalanceInTank: 500, dieselIssued: 10,
  })));
  expect(mocks.errors).toEqual([]);
});

it("generator log sends litres and cm without renaming the generator", async () => {
  render(<PlantGeneratorLogs />);
  fireEvent.click(screen.getByTestId("button-add-generator-log"));
  change("input-opening-diesel", "42"); change("input-closing-diesel", "40");
  change("input-diesel-issued-gen", "10");
  fireEvent.click(screen.getByTestId("button-save-gen-log"));
  await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("POST", "/api/plant-module/generator-logs", expect.objectContaining({
    generatorName: "600 KVA", openingDipCm: 42, closingDipCm: 40, openingDiesel: 525, closingDiesel: 500, dieselIssued: 10,
  })));
  expect(mocks.errors).toEqual([]);
});

it("the live heating DG form sends the two cm columns alongside litres", async () => {
  render(<HeatingSessionDialog open onOpenChange={vi.fn()} date="2026-11-28" plantName="Fixture plant" />);
  fireEvent.click(screen.getByTestId("switch-dg-running"));
  fireEvent.click(screen.getByTestId("select-dg-generator"));
  fireEvent.click(screen.getByRole("option", { name: "600 KVA" }));
  change("input-dg-open", "42"); change("input-dg-close", "40"); change("input-dg-issued", "10");
  fireEvent.click(screen.getByTestId("button-save"));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/plant-module/heating-sessions", expect.objectContaining({ method: "POST" })));
  const [, options] = vi.mocked(fetch).mock.calls.find(([url, options]) =>
    url === "/api/plant-module/heating-sessions" && options?.method === "POST")!;
  expect(JSON.parse(options!.body as string)).toMatchObject({
    dgOpeningDipCm: 42, dgClosingDipCm: 40, dgOpeningDiesel: 525, dgClosingDiesel: 500, dgIssuedDiesel: 10,
  });
  expect(mocks.errors).toEqual([]);
});
