// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import PlantBitumenStock from "../client/src/pages/PlantBitumenStock";
import { TrackerConsumption } from "../client/src/components/TrackerConsumption";

const fx = vi.hoisted(() => ({ owner: true, norm: true, data: {} as Record<string, any>, excel: vi.fn(), request: vi.fn() }));
vi.mock("xlsx", async original => ({ ...await original<typeof import("xlsx")>(), writeFile: fx.excel }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  featureCan: () => true, sectionCan: () => fx.norm, user: { id: 1, isOwner: fx.owner },
}) }));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ companyName: "Fixture", companyShortName: "FIX", defaultPlantName: "Main Plant", ownCompanyPartyId: 7 }) }));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({
  getPlantBackLink: () => "/plant", appendOrigin: (url: string) => url, appendPlantContext: (url: string) => url,
}) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: fx.request, queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@/components/NegativeBalanceBanner", () => ({ NegativeBalanceBanner: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey: [key] }: any) => ({ isLoading: false, data: fx.data[key] ?? [] }),
  useMutation: (options: any) => ({ isPending: false, mutate: async (input: any) => {
    try { options.onSuccess?.(await options.mutationFn(input)); } catch (error) { options.onError?.(error); }
  } }),
}));
afterEach(() => { cleanup(); fx.data = {}; fx.owner = true; fx.norm = true; vi.clearAllMocks(); });
const date = format(new Date(), "yyyy-MM-dd");
const dip = (tankNumber: number, readingType: string, volumeLiters: number, id: number) => ({
  id, tankNumber, readingType, volumeLiters, date, time: readingType === "opening" ? "08:00" : "18:00",
  depthCm: 50, weightKg: volumeLiters * 1.02,
});

it("bitumen renders tanks, read-only positions, one consumption table and history in order", () => {
  fx.data["/api/plant-module/bitumen-dip-readings"] = [dip(1, "opening", 10000, 1), dip(1, "closing", 7000, 2), dip(2, "opening", 4000, 3), dip(2, "closing", 2000, 4)];
  fx.data["/api/plant-module/dispatches"] = [{ date, loadWeight: 100, theoreticalBitumenQty: 4, partyId: 7 }];
  render(<PlantBitumenStock />);
  const tanks = screen.getByTestId("bitumen-tanks"), positions = screen.getByTestId("bitumen-ledger-stock-positions");
  const consumption = screen.getByTestId("bitumen-consumption"), history = screen.getByText("Dip readings");
  expect(tanks.compareDocumentPosition(positions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(positions.compareDocumentPosition(consumption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(consumption.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(positions).queryByRole("button")).toBeNull();
  expect(screen.queryByText("Owner action")).toBeNull();
  for (const text of ["Bitumen Reconciliation", "Daily Consumption Summary (Last 10 days)", "Consumption Variance Analysis", "Book vs Physical Stock Correction", "Bitumen tank book stock"]) expect(screen.queryByText(text)).toBeNull();
  expect(screen.getByRole("button", { name: "Dip settings" })).toBeTruthy();
  const total = within(consumption).getByText("Total").closest("tr")!;
  // Same opening − closing + receipts and density conversion as the removed variance table.
  expect(total.textContent).toContain("100.0004.0005.1001.100 more");
  expect(fx.request).not.toHaveBeenCalled();
});
it("bitumen does not show dip settings to a non-Owner", () => {
  fx.owner = false; render(<PlantBitumenStock />);
  expect(screen.queryByRole("button", { name: "Dip settings" })).toBeNull();
});
it("filters dates and parties without assigning tank dips to a party; Excel matches the table", () => {
  render(<TrackerConsumption kind="bitumen" days={[{ date, actual: 5 }, { date: "2020-01-01", actual: 99 }]}
    parties={[{ id: 7, name: "Party seven" }, { id: 8, name: "Party eight" }]} dispatches={[
      { date, loadWeight: 60, theoreticalBitumenQty: 3, partyId: 7 },
      { date, loadWeight: 40, theoreticalBitumenQty: 1, partyId: 8 },
    ]} canViewNormActual canExport />);
  expect(screen.queryByText("2020-01-01")).toBeNull();
  fireEvent.change(screen.getByLabelText("Consumption party"), { target: { value: "7" } });
  const total = screen.getByText("Total").closest("tr")!;
  expect(within(total).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["Total", "60.000", "3.000", "—", "—"]);
  fireEvent.click(screen.getByRole("button", { name: "Excel" }));
  const sheet = fx.excel.mock.calls[0][0].Sheets.Consumption;
  expect(XLSX.utils.sheet_to_json(sheet)).toContainEqual({
    Date: "Total", "Production (MT)": "60.000", "Norm use (MT)": "3.000", "Actual use from dips (MT)": "—", "Difference (MT)": "—",
  });
});
it("keeps norm permission checks and never substitutes missing dip readings with norm use", () => {
  render(<TrackerConsumption kind="bitumen" days={[]} dispatches={[{ date, loadWeight: 100, theoreticalBitumenQty: 4 }]} canViewNormActual={false} canExport={false} />);
  expect(within(screen.getByText("Total").closest("tr")!).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["Total", "—", "—", "—", "—"]);
  expect(screen.queryByRole("button", { name: "Excel" })).toBeNull();
});
