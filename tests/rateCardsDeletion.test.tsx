// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RateCards from "@/pages/RateCards";
import { MANUAL_VENDOR_RATE_CARD_NOTE } from "@shared/vendorRateCardIdentity";

vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSearch: () => "?vendorName=RATE-CARD-TEST",
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  return {
    Select: ({ value, onValueChange, children }: any) => {
      const parts = React.Children.toArray(children) as any[];
      return <select data-testid={parts[0]?.props["data-testid"]} value={value} onChange={event => onValueChange(event.target.value)}>{parts[1]}</select>;
    },
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  };
});

const vendorName = "RATE-CARD-TEST";
const persistedManualRows = [
  { id: 11, vendorName, category: "equipment", itemKey: "EQ_ROLLER_HRS", itemLabel: "ROLLER - HOURLY HIRE", unit: "HRS", rate: 100, notes: MANUAL_VENDOR_RATE_CARD_NOTE },
  { id: 12, vendorName, category: "material", itemKey: "MAT_SAND_CFT", itemLabel: "SAND", unit: "CFT", rate: 200, notes: MANUAL_VENDOR_RATE_CARD_NOTE },
  { id: 13, vendorName, category: "transport", itemKey: "EQ_TIPPER_TRIP", itemLabel: "TIPPER - TRIP", unit: "TRIP", rate: 300, notes: MANUAL_VENDOR_RATE_CARD_NOTE },
  { id: 14, vendorName, category: "labour", itemKey: "LAB_SKILLED", itemLabel: "LABOUR SKILLED", unit: "HEAD-DAY", rate: 400, notes: MANUAL_VENDOR_RATE_CARD_NOTE },
  { id: 15, vendorName, category: "material", itemKey: "MAT_LEGACY_SAND_TRIP", itemLabel: "LEGACY SAND", unit: "TRIP", rate: 450, notes: null },
];
let currentRows = persistedManualRows;
let failingDeleteId: number | null = null;
let deferDelete = false;
let finishDeferredDelete: (() => void) | null = null;

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
}

beforeEach(() => {
  currentRows = persistedManualRows.map(row => ({ ...row }));
  failingDeleteId = null;
  deferDelete = false;
  finishDeferredDelete = null;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/vendor-master")) return new Response(JSON.stringify([{ id: 99, name: vendorName, isActive: true }]));
    if (url.includes("/api/vendor-aliases")) return new Response(JSON.stringify([]));
    if (url.includes("/api/vendor-bills/vendor-names")) return new Response(JSON.stringify([vendorName]));
    if (url.includes("/api/vendor-rate-cards/discover")) {
      return new Response(JSON.stringify([
        { itemKey: "EQ_HARVESTER_HRS", itemLabel: "HARVESTER - HOURLY HIRE", category: "equipment", unit: "HRS", rate: 500, rateCardId: 20, isManual: false },
        { itemKey: "EQ_UNSAVED_HRS", itemLabel: "UNSAVED EQUIPMENT", category: "equipment", unit: "HRS", rate: null, rateCardId: null, isManual: false },
        { itemKey: "MAT_LEGACY_SAND_TRIP", itemLabel: "LEGACY SAND", category: "material", unit: "TRIP", rate: 450, rateCardId: 15, isManual: true },
      ]));
    }
    if (url.includes("/api/vendor-rate-cards?vendorName=")) return new Response(JSON.stringify(currentRows));
    if (url.includes("/api/equipment-master/canonical-types")) return new Response(JSON.stringify(["ROLLER", "HARVESTER"]));
    if (url.includes("/api/plant-materials")) return new Response(JSON.stringify([{ name: "SAND" }]));
    if (url.includes("/api/vendor-rate-cards/") && init?.method === "DELETE") {
      const id = Number(url.split("/").pop());
      if (id === failingDeleteId) return new Response(JSON.stringify({ message: "delete failed" }), { status: 500 });
      const completeDelete = () => {
        currentRows = currentRows.filter(row => row.id !== id);
        return new Response(JSON.stringify({ success: true }));
      };
      if (deferDelete) {
        return new Promise<Response>(resolve => { finishDeferredDelete = () => resolve(completeDelete()); });
      }
      return completeDelete();
    }
    if (url.includes("/api/vendor-rate-cards/bulk-upsert") && init?.method === "POST") {
      return new Response(JSON.stringify({ upserted: 1 }));
    }
    throw new Error(`Unexpected request ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Rate Cards saved-row management", () => {
  it("deletes a saved rate card through the existing route", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<QueryClientProvider client={makeClient()}><RateCards /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Remove saved rate for ROLLER - HOURLY HIRE" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove saved rate for ROLLER - HOURLY HIRE" })).toBeNull());
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url, init]) =>
      String(url) === "/api/vendor-rate-cards/11" && init?.method === "DELETE")).toBe(true);
  });
  it("shows saved cards only and never requests historical discovery rows", async () => {
    const confirm = vi.fn();
    vi.spyOn(window, "confirm").mockImplementation(confirm);
    render(<QueryClientProvider client={makeClient()}><RateCards /></QueryClientProvider>);
    await screen.findByRole("button", { name: "Remove saved rate for ROLLER - HOURLY HIRE" });
    expect(screen.queryByText("UNSAVED EQUIPMENT")).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) =>
      String(url).includes("/api/vendor-rate-cards/discover"))).toBe(false);
  });
  it("retains a saved discovered edit when DELETE fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    failingDeleteId = 11;
    render(<QueryClientProvider client={makeClient()}><RateCards /></QueryClientProvider>);
    const button = await screen.findByRole("button", { name: "Remove saved rate for ROLLER - HOURLY HIRE" });
    fireEvent.change(screen.getByTestId("input-rate-0"), { target: { value: "777" } });
    fireEvent.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.getByTestId("input-rate-0")).toHaveValue(777);
  });
  it("confirms before deleting saved rows in every section and explains bills are unaffected", async () => {
    const client = makeClient();
    const confirm = vi.fn(() => false);
    vi.spyOn(window, "confirm").mockImplementation(confirm);
    render(<QueryClientProvider client={client}><RateCards /></QueryClientProvider>);

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove saved rate for ROLLER - HOURLY HIRE" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Remove saved rate for SAND" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove saved rate for TIPPER - TRIP" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove saved rate for LABOUR SKILLED" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove saved rate for LEGACY SAND" })).toBeInTheDocument();
    expect(screen.queryByText("UNSAVED EQUIPMENT")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove saved rate for ROLLER - HOURLY HIRE" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain("Existing bills keep their saved rates and are not affected.");
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url, init]) =>
      String(url).includes("/api/vendor-rate-cards/11") && init?.method === "DELETE",
    )).toBe(false);

    confirm.mockReturnValue(true);
    for (const [label, id] of [["ROLLER - HOURLY HIRE", 11], ["SAND", 12], ["TIPPER - TRIP", 13], ["LABOUR SKILLED", 14]] as const) {
      fireEvent.click(screen.getByRole("button", { name: `Remove saved rate for ${label}` }));
      await waitFor(() => expect(screen.queryByRole("button", { name: `Remove saved rate for ${label}` })).toBeNull());
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url, init]) =>
        String(url).includes(`/api/vendor-rate-cards/${id}`) && init?.method === "DELETE",
      )).toBe(true);
    }
    fireEvent.click(screen.getByRole("button", { name: "Remove saved rate for LEGACY SAND" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove saved rate for LEGACY SAND" })).toBeNull());
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url, init]) =>
      String(url).includes("/api/vendor-rate-cards/15") && init?.method === "DELETE",
    )).toBe(true);
  });

  it("preserves another row's edit and restores the exact row when deletion fails", async () => {
    const client = makeClient();
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<QueryClientProvider client={client}><RateCards /></QueryClientProvider>);

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove saved rate for ROLLER - HOURLY HIRE" })).toBeInTheDocument());
    const rollerRow = screen.getByRole("button", { name: "Remove saved rate for ROLLER - HOURLY HIRE" }).closest("tr")!;
    const sandRow = screen.getByRole("button", { name: "Remove saved rate for SAND" }).closest("tr")!;
    fireEvent.change(within(rollerRow).getByRole("spinbutton"), { target: { value: "777" } });
    fireEvent.change(within(sandRow).getByRole("spinbutton"), { target: { value: "888" } });
    failingDeleteId = 12;
    fireEvent.click(screen.getByRole("button", { name: "Remove saved rate for SAND" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove saved rate for SAND" })).toBeInTheDocument());
    const retainedRoller = screen.getByRole("button", { name: "Remove saved rate for ROLLER - HOURLY HIRE" }).closest("tr")!;
    const restoredSandRow = screen.getByRole("button", { name: "Remove saved rate for SAND" }).closest("tr")!;
    expect(within(retainedRoller).getByRole("spinbutton")).toHaveValue(777);
    expect(within(restoredSandRow!).getByRole("spinbutton")).toHaveValue(888);
  });

  it("prevents saving while a saved-card deletion is still pending", async () => {
    const client = makeClient();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deferDelete = true;
    client.setQueryData(["/api/vendor-master"], [{ id: 99, name: vendorName, isActive: true }]);
    client.setQueryData(["/api/vendor-aliases"], []);
    client.setQueryData(["/api/vendor-bills/vendor-names"], [vendorName]);
    render(<QueryClientProvider client={client}><RateCards draftVendor={vendorName} /></QueryClientProvider>);
    const masterSelect = await screen.findByTestId("select-vendor-master") as HTMLSelectElement;
    await waitFor(() => expect(masterSelect.options.length).toBeGreaterThan(1));
    await waitFor(() => expect(masterSelect.value).toBe("99"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove saved rate for SAND" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Remove saved rate for SAND" }));
    expect((screen.getByTestId("button-save-all-rates") as HTMLButtonElement).disabled).toBe(true);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    finishDeferredDelete?.();
  });

});