// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EquipmentTankDipInput } from "@/components/EquipmentTankDipInput";
import { Input } from "@/components/ui/input";
import { DprEquipmentCompact } from "@/components/DprEquipmentCompact";
import { EquipmentTankBalanceInputs } from "@/components/EquipmentTankBalanceInputs";
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ isOwner: false }) }));

const equipment = { id: 991, dipLitersPerCm: 12.5, deadStockDepthCm: 4, tankCapacityLiters: 500 };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function wrap(child: React.ReactNode, previous: unknown = null) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(previous))));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
}

it("converts 42 cm to 525 L, usable 475 L, and warns without blocking", () => {
  const change = vi.fn();
  wrap(<EquipmentTankDipInput equipment={equipment} kind="closing" cm={42} litres={525}
    openingLitres={400} issuedLitres={100} onChange={change}><Input aria-label="Legacy litres" /></EquipmentTankDipInput>);
  expect(screen.getByText("Tank 525 L · usable 475 L")).toBeInTheDocument();
  expect(screen.getByText("Above tank capacity")).toBeInTheDocument();
  expect(screen.getByText(/Consumption is negative/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Closing dip (cm)"), { target: { value: "3" } });
  expect(change).toHaveBeenLastCalledWith(3, 37.5);
  expect(screen.queryByLabelText("Legacy litres")).not.toBeInTheDocument();
});

it("defaults opening from the last dip and keeps manual changes with a dated warning", async () => {
  function Form() {
    const [value, setValue] = useState<{ cm: number | null; litres: number | null }>({ cm: null, litres: null });
    return <EquipmentTankDipInput equipment={equipment} kind="opening" {...value} date="2026-11-28" isNew
      onChange={(cm, litres) => setValue({ cm, litres })}><Input aria-label="Legacy litres" /></EquipmentTankDipInput>;
  }
  wrap(<Form />, { cm: 42, litres: 525, date: "2026-11-27" });
  await waitFor(() => expect(screen.getByLabelText("Opening dip (cm)")).toHaveValue(42));
  fireEvent.change(screen.getByLabelText("Opening dip (cm)"), { target: { value: "43" } });
  expect(screen.getByText("Last closing was 42 cm (525 L) on 2026-11-27")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText("Opening dip (cm)")).toHaveValue(43));
});

it("does not replace manually typed opening when the previous closing arrives late", async () => {
  let resolve!: (response: Response) => void;
  const request = new Promise<Response>(r => { resolve = r; });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.stubGlobal("fetch", vi.fn(() => request));
  const change = vi.fn();
  render(<QueryClientProvider client={client}>
    <EquipmentTankDipInput equipment={equipment} kind="opening" date="2026-11-28" isNew onChange={change}>
      <Input />
    </EquipmentTankDipInput>
  </QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Opening dip (cm)"), { target: { value: "41" } });
  resolve(new Response(JSON.stringify({ cm: 42, litres: 525, date: "2026-11-27" })));
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(change).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledWith(41, 512.5);
});

it("keeps uncalibrated litres controls unchanged and needs no query provider", () => {
  const change = vi.fn();
  render(<EquipmentTankDipInput equipment={{ dipLitersPerCm: null }} kind="opening" onChange={change}>
    <Input aria-label="Original litres" defaultValue="123" />
  </EquipmentTankDipInput>);
  expect(screen.getByLabelText("Original litres")).toHaveValue("123");
  expect(screen.queryByText("Opening dip (cm)")).not.toBeInTheDocument();
});

it("shows below-outlet warning and zero usable litres without blocking the input", () => {
  wrap(<EquipmentTankDipInput equipment={equipment} kind="closing" cm={3} litres={37.5} onChange={vi.fn()}>
    <Input />
  </EquipmentTankDipInput>);
  expect(screen.getByText("Tank 37.5 L · usable 0 L")).toBeInTheDocument();
  expect(screen.getByText("below outlet — engine may not draw")).toBeInTheDocument();
  expect(screen.getByLabelText("Closing dip (cm)")).toBeEnabled();
});

it("does not auto-fill a stored row", async () => {
  const change = vi.fn();
  wrap(<EquipmentTankDipInput equipment={equipment} kind="opening" cm={40} litres={500} date="2026-11-28"
    isNew={false} onChange={change}><Input /></EquipmentTankDipInput>, { cm: 42, litres: 525, date: "2026-11-27" });
  await waitFor(() => expect(screen.getByText(/Last closing was/)).toBeInTheDocument());
  expect(change).not.toHaveBeenCalled();
});

it("DPR compact and legacy equipment forms save both centimetres and physical litres", () => {
  const change = vi.fn();
  const view = wrap(<DprEquipmentCompact row={{ equipmentId: 991, machine: "Fixture DG", dieselSource: "plant_stock", openingDiesel: 525, dieselBalanceInTank: 500 }}
    equipment={equipment} onChange={change} historicalCorrection />);
  // The compact editor preserves its existing collapsed/expanded behavior.
  const toggle = screen.queryByTestId("equipment-compact-toggle-0");
  if (toggle) fireEvent.click(toggle);
  const closing = screen.getByLabelText("Closing dip (cm)");
  fireEvent.change(closing, { target: { value: "42" } });
  expect(change).toHaveBeenLastCalledWith({ closingDipCm: 42, dieselBalanceInTank: 525 });
  view.unmount();
  wrap(<EquipmentTankBalanceInputs equipment={equipment} index={0} onChange={change} />);
  fireEvent.change(screen.getByLabelText("Opening dip (cm)"), { target: { value: "42" } });
  expect(change).toHaveBeenLastCalledWith({ openingDipCm: 42, openingDiesel: 525 });
});
