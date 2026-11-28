// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmTankStock } from "../client/src/components/ConfirmTankStock";
const fx = vi.hoisted(() => ({ canEnter: true, request: vi.fn(), complete: vi.fn(), error: false, existing: [] as any[] }));
const geometry = { shape: "vertical_cylinder", diameterCm: 100, heightCm: 200 };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ featureCan: () => fx.canEnter }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: fx.request, queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey: [key] }: any) => ({
    isLoading: false, isError: fx.error,
    data: key.includes("plant-settings") ? { bitumenDensityKgPerL: 1, tankConfig: JSON.stringify({ bitumen1: geometry, bitumen2: geometry, ldo1: geometry, ldo2: geometry }) } :
      key.includes("packed-stock") ? { rows: [] } : key.includes("bitumen") ? fx.existing : [],
  }),
}));
afterEach(() => { cleanup(); vi.resetAllMocks(); fx.canEnter = true; fx.error = false; fx.existing = []; });
const show = () => render(<ConfirmTankStock date="2026-11-28" plantName="Plant A" onComplete={fx.complete} />);
it("saves all four opening readings through the existing dip routes, then continues", async () => {
  fx.request.mockResolvedValue({}); show();
  for (const kind of ["Bitumen", "LDO"]) for (const tank of [1, 2]) {
    fireEvent.change(screen.getByLabelText(`${kind} tank ${tank} actual dip (cm)`), { target: { value: "100" } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Save opening dips" }));
  await waitFor(() => expect(fx.complete).toHaveBeenCalledWith({ bitumen1: 100, bitumen2: 100, ldo1: 100, ldo2: 100 }));
  expect(fx.request).toHaveBeenCalledTimes(4);
  expect(fx.request.mock.calls[0]).toMatchObject(["POST", "/api/plant-module/bitumen-dip-readings", {
    plantName: "Plant A", date: "2026-11-28", tankNumber: 1, depthCm: 100, readingType: "opening",
  }]);
  expect(fx.request.mock.calls[2][1]).toBe("/api/plant-module/ldo-dip-readings");
  expect(fx.request.mock.calls[2][2].volumeLiters).toBeCloseTo(Math.PI * 50 * 50 * 100 / 1000, 8);
});
it("Skip always continues without creating readings", () => {
  show(); fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  expect(fx.complete).toHaveBeenCalledWith({}); expect(fx.request).not.toHaveBeenCalled();
});
it("allows blanks and carries only readings actually saved", async () => {
  fx.request.mockResolvedValue({}); show();
  fireEvent.change(screen.getByLabelText("Bitumen tank 1 actual dip (cm)"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Save opening dips" }));
  await waitFor(() => expect(fx.complete).toHaveBeenCalledWith({ bitumen1: 100 }));
  expect(fx.request).toHaveBeenCalledTimes(1);
});
it("never blocks continuation on a failed reading save", async () => {
  fx.request.mockRejectedValue(new Error("Reading could not be saved")); show();
  fireEvent.change(screen.getByLabelText("LDO tank 1 actual dip (cm)"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Save opening dips" }));
  expect((await screen.findByRole("alert")).textContent).toContain("You can skip for now");
  fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  expect(fx.complete).toHaveBeenCalledWith({});
});
it("keeps Skip available for a user without dip-entry permission or with failed loading", () => {
  fx.canEnter = false; fx.error = true; show();
  expect((screen.getByRole("button", { name: "Save opening dips" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  expect(fx.complete).toHaveBeenCalledWith({}); expect(fx.request).not.toHaveBeenCalled();
});
it("keeps existing opening dips and never recreates them", () => {
  fx.existing = [{ tankNumber: 1, date: "2026-11-28", readingType: "opening", depthCm: 80 }];
  show(); fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  expect(fx.complete).toHaveBeenCalledWith({ bitumen1: 80 }); expect(fx.request).not.toHaveBeenCalled();
});
