// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DprMaterialsReceived, completeBoqTotal } from "../client/src/components/DprMaterialsReceived";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(site = "North & South", date = "2026-07-04") {
  const client = new QueryClient({
    defaultOptions: { queries: {
      retry: false,
      queryFn: async ({ queryKey }) => {
        const response = await fetch(queryKey[0] as string);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      },
    } },
  });
  const view = render(<QueryClientProvider client={client}><DprMaterialsReceived site={site} date={date} /></QueryClientProvider>);
  return { ...view, client };
}

const rows = [
  { id: 1, source: "trip", material: "GSB", quantity: 10, uom: "CFT", time: null, supplier: "Carrier A",
    vehicleNumber: "AB-01", unloadedAt: "stretch", materialSourceSupplier: "Quarry A", receiptNumber: "R-1",
    boqQuantity: { quantity: 2, uom: "MT" } },
  { id: 2, source: "trip", material: "GSB", quantity: 5, uom: "cft", time: "11:30", unloadedAt: "yard", yardLabel: "Main yard",
    boqQuantity: { quantity: 1, uom: "mt" } },
  { id: 3, source: "trip", material: "GSB", quantity: 3, uom: "MT", unloadedAt: null,
    boqQuantity: { quantity: 3, uom: "MT" } },
  { id: 4, source: "dpr", material: "Water", quantity: 7, uom: "Liters", time: null, unloadedAt: "stretch" },
];

describe("DPR17 Materials Received readonly day panel", () => {
  it("does not request a broad query without BOTH site and date", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { rerender, client } = setup("", "2026-07-04");
    expect(screen.getByText(/Site and date required/)).toBeTruthy();
    rerender(<QueryClientProvider client={client}><DprMaterialsReceived site="North" date="" /></QueryClientProvider>);
    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows loading, then scoped empty separately", async () => {
    let resolve!: (value: unknown) => void;
    const fetchSpy = vi.fn(() => new Promise(r => { resolve = r; }));
    vi.stubGlobal("fetch", fetchSpy);
    setup();
    expect(screen.getByRole("status").textContent).toContain("Loading materials received");
    expect(screen.queryByText("No materials received this day.")).toBeNull();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const url = new URL(fetchSpy.mock.calls[0][0], "http://localhost");
    expect(url.pathname).toBe("/api/materials-received");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      site: "North & South", dateFrom: "2026-07-04", dateTo: "2026-07-04",
    });
    resolve({ ok: true, json: async () => [] });
    await waitFor(() => expect(screen.getByText("No materials received this day.")).toBeTruthy());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reports query errors, not an empty day", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    setup();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("HTTP 503"));
    expect(screen.queryByText("No materials received this day.")).toBeNull();
  });

  it("groups native UOM, only shows complete BOQ totals, and keeps the table readonly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => rows }));
    const { container } = setup();
    await waitFor(() => expect(screen.getByTestId("row-material-trip-1")).toBeTruthy());
    expect(screen.getByText("North & South · 2026-07-04")).toBeTruthy();
    const cft = screen.getByTestId("card-material-GSB-CFT");
    expect(cft.textContent).toContain("15.00");
    expect(cft.textContent).toContain("2 entries");
    expect(cft.textContent).toContain("Stretch 10.00 · Yard 5.00 · Not recorded 0.00");
    expect(within(cft).getByTestId("boq-total-GSB-CFT").textContent).toContain("≈ 3.000 MT");
    expect(screen.getByTestId("card-material-GSB-MT").textContent).toContain("3.00");
    expect(screen.getByTestId("card-material-Water-LITERS").textContent).toContain("Other entries (DPR/equipment) 7.00");
    expect(screen.queryByTestId("boq-total-Water-LITERS")).toBeNull();
    expect(within(screen.getByTestId("row-material-trip-1")).getAllByRole("cell")[0].textContent).toBe("—");
    expect(screen.getByTestId("row-material-trip-2").textContent).toContain("Yard · Main yard");
    expect(screen.getByTestId("row-material-trip-3").textContent).toContain("Not recorded");
    expect(screen.getByTestId("row-material-dpr-4").textContent).toContain("Not applicable");
    expect(screen.getAllByRole("columnheader").map(node => node.textContent)).toEqual([
      "Time", "Transporter", "Material", "Qty/UOM", "Unloaded at", "Material Source", "Receipt No.",
    ]);
    expect(container.querySelector("button, input, select, textarea, a")).toBeNull();
    expect(screen.getByTestId("row-material-trip-1").textContent).toContain("Quarry A");
    expect(screen.getByTestId("row-material-trip-1").textContent).toContain("R-1");
  });

  it("never displays a partial or mixed-unit BOQ total, including nonfinite values", () => {
    const base = rows.slice(0, 2);
    expect(completeBoqTotal(base, "GSB", "CFT")).toEqual({ quantity: 3, uom: "MT" });
    expect(completeBoqTotal([{ ...base[0], boqQuantity: null }, base[1]], "GSB", "CFT")).toBeNull();
    expect(completeBoqTotal([{ ...base[0], boqQuantity: { quantity: Infinity, uom: "MT" } }, base[1]], "GSB", "CFT")).toBeNull();
    expect(completeBoqTotal([{ ...base[0], boqQuantity: { quantity: 2, uom: "" } }, base[1]], "GSB", "CFT")).toBeNull();
    expect(completeBoqTotal([base[0], { ...base[1], boqQuantity: { quantity: 1, uom: "CUM" } }], "GSB", "CFT")).toBeNull();
    expect(completeBoqTotal(rows, "GSB", "MT")).toEqual({ quantity: 3, uom: "MT" });
  });

  it("hides the secondary total in rendered cards when one conversion is missing or uses another BOQ unit", async () => {
    const incomplete = [rows[0], { ...rows[1], boqQuantity: null }];
    const mixed = [rows[0], { ...rows[1], boqQuantity: { quantity: 1, uom: "CUM" } }];
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => incomplete })
      .mockResolvedValueOnce({ ok: true, json: async () => mixed });
    vi.stubGlobal("fetch", fetchSpy);
    const first = setup();
    await waitFor(() => expect(screen.getByTestId("card-material-GSB-CFT")).toBeTruthy());
    expect(screen.getByTestId("card-material-GSB-CFT").textContent).toContain("15.00");
    expect(screen.queryByTestId("boq-total-GSB-CFT")).toBeNull();
    first.unmount();
    setup();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("card-material-GSB-CFT")).toBeTruthy());
    expect(screen.queryByTestId("boq-total-GSB-CFT")).toBeNull();
  });
});