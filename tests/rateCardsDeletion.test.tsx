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
  vi.unstubAllGlobals();
});

describe("Rate Cards manual row deletion", () => {
  it("deletes saved discovered rates through the existing route", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<QueryClientProvider client={makeClient()}><RateCards /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Remove saved rate for HARVESTER - HOURLY HIRE" }));
    await waitFor(() => expect(screen.getByTestId("input-rate-0")).toHaveValue(null));
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url, init]) =>
      String(url) === "/api/vendor-rate-cards/20" && init?.method === "DELETE")).toBe(true);
  });
  it("resets an unsaved discovered edit without DELETE or confirmation", async () => {
    const confirm = vi.fn();
    vi.stubGlobal("confirm", confirm);
    render(<QueryClientProvider client={makeClient()}><RateCards /></QueryClientProvider>);
    const button = await screen.findByRole("button", { name: "Reset unsaved rate for UNSAVED EQUIPMENT" });
    const rate = within(button.closest("tr")!).getByRole("spinbutton");
    fireEvent.change(rate, { target: { value: "42" } });
    fireEvent.click(button);
    expect(rate).toHaveValue(null);
    expect(confirm).not.toHaveBeenCalled();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });
  it("retains a saved discovered edit when DELETE fails", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    failingDeleteId = 20;
    render(<QueryClientProvider client={makeClient()}><RateCards /></QueryClientProvider>);
    const button = await screen.findByRole("button", { name: "Remove saved rate for HARVESTER - HOURLY HIRE" });
    fireEvent.change(screen.getByTestId("input-rate-0"), { target: { value: "777" } });
    fireEvent.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.getByTestId("input-rate-0")).toHaveValue(777);
  });
  it("confirms and deletes persisted manual rows in every section without hiding discovered rows", async () => {
    const client = makeClient();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render(<QueryClientProvider client={client}><RateCards /></QueryClientProvider>);

    await waitFor(() => expect(screen.getByTestId("button-remove-manual-equipment-0")).toBeInTheDocument());
    expect(screen.getByTestId("button-remove-manual-material-0")).toBeInTheDocument();
    expect(screen.getByTestId("button-remove-manual-transport-0")).toBeInTheDocument();
    expect(screen.getByTestId("button-remove-manual-labour-0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove LEGACY SAND" })).toBeInTheDocument();
    expect(screen.getByTestId("row-discovered-item-0")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-remove-manual-equipment-0"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("button-remove-manual-equipment-0")).toBeInTheDocument();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url, init]) =>
      String(url).includes("/api/vendor-rate-cards/11") && init?.method === "DELETE",
    )).toBe(false);

    confirm.mockReturnValue(true);
    for (const [label, id] of [["ROLLER - HOURLY HIRE", 11], ["SAND", 12], ["TIPPER - TRIP", 13], ["LABOUR SKILLED", 14]] as const) {
      fireEvent.click(screen.getByRole("button", { name: `Remove ${label}` }));
      await waitFor(() => expect(screen.queryByRole("button", { name: `Remove ${label}` })).toBeNull());
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url, init]) =>
        String(url).includes(`/api/vendor-rate-cards/${id}`) && init?.method === "DELETE",
      )).toBe(true);
    }
    fireEvent.click(screen.getByRole("button", { name: "Remove LEGACY SAND" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove LEGACY SAND" })).toBeNull());
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url, init]) =>
      String(url).includes("/api/vendor-rate-cards/15") && init?.method === "DELETE",
    )).toBe(true);
    expect(screen.getByTestId("row-discovered-item-0")).toBeInTheDocument();
  });

  it("preserves another row's edit and restores the exact row when deletion fails", async () => {
    const client = makeClient();
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<QueryClientProvider client={client}><RateCards /></QueryClientProvider>);

    await waitFor(() => expect(screen.getByTestId("input-manual-rate-equipment-0")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("input-manual-rate-equipment-0"), { target: { value: "777" } });
    fireEvent.change(screen.getByTestId("input-manual-rate-material-0"), { target: { value: "888" } });
    failingDeleteId = 12;
    fireEvent.click(screen.getByTestId("button-remove-manual-material-0"));

    await waitFor(() => expect(screen.getByTestId("button-remove-manual-material-0")).toBeInTheDocument());
    expect(screen.getByTestId("input-manual-rate-equipment-0")).toHaveValue(777);
    const restoredSandRow = screen.getByRole("button", { name: "Remove SAND" }).closest("tr");
    expect(restoredSandRow).not.toBeNull();
    expect(within(restoredSandRow!).getByRole("spinbutton")).toHaveValue(888);
  });

  it("does not put a pending deletion back into a bulk save", async () => {
    const client = makeClient();
    vi.stubGlobal("confirm", vi.fn(() => true));
    deferDelete = true;
    render(<QueryClientProvider client={client}><RateCards /></QueryClientProvider>);

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove SAND" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Remove SAND" }));
    fireEvent.click(screen.getByTestId("button-save-all-rates"));

    await waitFor(() => {
      const bulkCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url, init]) =>
        String(url).includes("/api/vendor-rate-cards/bulk-upsert") && init?.method === "POST",
      );
      expect(bulkCall).toBeTruthy();
      expect(String(bulkCall?.[1]?.body)).not.toContain("MAT_SAND_CFT");
    });
    finishDeferredDelete?.();
  });

});