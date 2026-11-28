// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EquipmentTankDipInput } from "@/components/EquipmentTankDipInput";
import { equipmentFillingRate } from "@shared/equipmentTankDip";

const auth = vi.hoisted(() => ({ owner: true }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ isOwner: auth.owner }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); auth.owner = true; });
function form(hours: number) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: 991, dipLitersPerCm: 12.5 }))));
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}><EquipmentTankDipInput
    equipment={{ id: 991, dipLitersPerCm: 10 }} kind="closing" cm={28} litres={280}
    openingCm={20} openingLitres={200} issuedLitres={100} runningHours={hours} onChange={vi.fn()}>
    <input />
  </EquipmentTankDipInput></QueryClientProvider>);
}
it("automatically shows a zero-runtime filling check and Owner can update only the calibration", async () => {
  form(0);
  expect(screen.getByText("Issued 100 L raised the dip 8 cm → 12.5 L/cm (master: 10 L/cm)")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Use this figure" }));
  await waitFor(() => expect(screen.getByText("Master litres per cm updated")).toBeInTheDocument());
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe("/api/plant-module/equipment/991/dip-calibration");
  expect(options?.method).toBe("PATCH");
  expect(JSON.parse(options?.body as string)).toEqual({ issuedLitres: 100, openingDipCm: 20, closingDipCm: 28 });
});
it("requires the Filling check tick with runtime, and never offers a non-Owner the update button", () => {
  auth.owner = false;
  form(1);
  expect(screen.queryByText(/Issued 100 L raised/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Filling check"));
  expect(screen.getByText(/Issued 100 L raised/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Use this figure" })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("accepts 100 L / 8 cm and rejects zero or negative rises", () => {
  expect(equipmentFillingRate({ issuedLitres: 100, openingDipCm: 20, closingDipCm: 28 })).toBe(12.5);
  for (const close of [20, 19]) expect(() => equipmentFillingRate({ issuedLitres: 100, openingDipCm: 20, closingDipCm: close })).toThrow();
});
