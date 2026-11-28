// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { calculateVolumeAtDepth } from "../shared/tank-calibration";
import { dipWatchSettings, preserveDipWatchConfig, tankBookStock, tankStockAtDip } from "../shared/tankBookStock";
import { TankBookStock } from "../client/src/components/TankBookStock";

const fx = vi.hoisted(() => ({ owner: false, settings: {} as any, request: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { isOwner: fx.owner } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: fx.request, queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(), useQuery: () => ({ data: fx.settings }),
}));
const geometry = { shape: "vertical_cylinder" as const, diameterCm: 100, heightCm: 200, deadStockDepthCm: 10 };
const settings = { bitumenDensityKgPerL: 1.03, tankConfig: JSON.stringify({ bitumen1: geometry, ldo1: geometry }) };
const base = { kind: "bitumen" as const, tank: 1 as const, plantName: "Plant A", defaultPlantName: "Plant A", settings };
const position = { materialName: "BITUMEN", partyName: "Fixture party", partyId: 7, tank1Mt: 2, tank2Mt: 0 };
afterEach(() => { cleanup(); fx.owner = false; fx.settings = {}; vi.resetAllMocks(); });
describe("TANK-02 Part 1 calculation", () => {
  it.each([
    geometry,
    { shape: "horizontal_cylinder" as const, diameterCm: 200, lengthCm: 1000, deadStockDepthCm: 10 },
    { shape: "vertical_cone_top" as const, diameterCm: 200, cylinderHeightCm: 100, coneHeightCm: 100, deadStockDepthCm: 10 },
  ])("inverts configured calibration and density without changing the source: %s", cfg => {
    const source = { ...settings, tankConfig: JSON.stringify({ bitumen1: cfg }) };
    const book = calculateVolumeAtDepth(cfg, 60) * 1.03 / 1000;
    const row = tankBookStock({ ...base, settings: source, positions: [{ ...position, tank1Mt: book }] });
    expect(row.expectedDip).toBeCloseTo(60, 8);
    expect(row.deadStock).toBeCloseTo(calculateVolumeAtDepth(cfg, 10) * 1.03 / 1000, 8);
    expect(row.usable! + row.deadStock!).toBeCloseTo(book, 8);
    expect(source.tankConfig).toBe(JSON.stringify({ bitumen1: cfg }));
  });
  it.each([{}, { tankConfig: settings.tankConfig }, { ...settings, bitumenDensityKgPerL: 0 }, { ...settings, tankConfig: "{}" }])("requires explicit calibration and density: %s", value => {
    const row = tankBookStock({ ...base, settings: value, positions: [position] });
    expect(row.calibrationNeeded).toBe(true); expect(row.expectedDip).toBeNull();
  });
  it("does not clamp an impossible negative book stock to a fake zero dip", () => {
    expect(tankBookStock({ ...base, positions: [{ ...position, tank1Mt: -2 }] })).toMatchObject({ calibrationNeeded: false, expectedDip: null, book: -2 });
  });
  it("calculates LDO in litres and selects the latest reading for this plant only", () => {
    const latest = { id: 3, plantName: "Plant A", tankNumber: 1, date: "2026-11-28", time: "09:00", depthCm: 140, volumeLiters: 1060 };
    const row = tankBookStock({ ...base, kind: "ldo", positions: [{ ...position, materialName: "LDO", tank1L: 1000 }], readings: [
      latest, { ...latest, id: 2, time: "08:00", volumeLiters: 990 },
      { ...latest, id: 4, plantName: "Plant B", time: "10:00", volumeLiters: 800 },
    ] });
    expect(row.expectedDip).toBeCloseTo(1000 * 1000 / (Math.PI * 50 * 50), 8);
    expect(row.latest).toEqual(latest); expect(row.difference).toBe(60); expect(row.overLimit).toBe(true);
  });
  it("never reports a partial sum when a party's position is invalid", () => {
    expect(tankBookStock({ ...base, positions: [position, { ...position, tank1Mt: "3" as any }] }).book).toBeNull();
  });
  it("preserves Owner settings through ordinary calibration edits and blocks injection through that path", () => {
    const old = JSON.stringify({ bitumen1: geometry, dipWatch: dipWatchSettings() });
    const edited = JSON.stringify({ bitumen2: geometry, dipWatch: { ldoAllowedDifferenceL: 999 } });
    expect(JSON.parse(preserveDipWatchConfig(edited, old)!)).toEqual({ bitumen2: geometry, dipWatch: dipWatchSettings() });
    expect(JSON.parse(preserveDipWatchConfig(edited, null)!)).toEqual({ bitumen2: geometry });
    expect(JSON.parse(preserveDipWatchConfig(null, old)!)).toEqual({ dipWatch: dipWatchSettings() });
  });
});
describe("TANK-02 tracker summary", () => {
  function show() {
    return render(<QueryClientProvider client={new QueryClient()}>
      <TankBookStock kind="bitumen" plantName="Plant A" defaultPlantName="Plant A" positions={[position]}
        readings={[{ tankNumber: 1, date: "2026-11-28", time: "09:00", depthCm: 25, volumeLiters: 2500, weightKg: 2500 }]} />
    </QueryClientProvider>);
  }
  it("shows book, party, expected/actual dip and a quantity difference in bold over the limit", () => {
    fx.settings = { bitumenTank1LitresPerCm: 100, bitumenDensityKgPerL: 1 };
    show();
    const tank = screen.getByTestId("tank-book-bitumen-1");
    expect(tank.textContent).toContain("Book stock: 2 MT");
    expect(tank.textContent).toContain("Usable: 0.75 MT");
    expect(tank.textContent).toContain("Dead stock: 1.25 MT");
    expect(tank.textContent).toContain("Fixture party: 2 MT");
    expect(tank.textContent).toContain("Expected dip: 20.0 cm");
    expect(tank.textContent).toContain("2026-11-28 09:00 · 25 cm · 2.5 MT");
    expect(within(tank).getByText("0.5 MT more than book").className).toContain("font-bold");
    expect(screen.queryByRole("button", { name: "Dip settings" })).toBeNull();
    expect(fx.request).not.toHaveBeenCalled();
  });
  it("shows Calibration needed, with no guessed expected dip", () => {
    show();
    expect(screen.getByTestId("tank-book-bitumen-1").textContent).toContain("Expected dip: Calibration needed");
  });
  it("lets only the Owner explicitly save settings; opening or cancelling writes nothing", async () => {
    fx.owner = true; fx.request.mockResolvedValue({});
    show(); fireEvent.click(screen.getByRole("button", { name: "Dip settings" }));
    expect((screen.getByLabelText("Allowed bitumen difference (MT)") as HTMLInputElement).value).toBe("0.2");
    expect((screen.getByLabelText("First reminder (India time)") as HTMLInputElement).value).toBe("08:00");
    expect(fx.request).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Allowed LDO difference (L)"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(fx.request).toHaveBeenCalledWith("PATCH", "/api/plant-module/plant-settings/Plant%20A/dip-watch", { ...dipWatchSettings(), ldoAllowedDifferenceL: 75 }));
  });
});
