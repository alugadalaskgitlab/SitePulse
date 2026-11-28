// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { format, subDays } from "date-fns";
import * as XLSX from "xlsx";
import PlantBitumenStock from "../client/src/pages/PlantBitumenStock";
import PlantLdoFlowMeter from "../client/src/pages/PlantLdoFlowMeter";
import { PhysicalStockCorrectionButton } from "../client/src/components/PhysicalStockCorrectionDialog";
import { LDO_DENSITY_KG_PER_LITER } from "../shared/bitumen-dip-chart";
import { TrackerConsumption } from "../client/src/components/TrackerConsumption";

const fx = vi.hoisted(() => ({ owner: true, norm: true, data: {} as Record<string, any>, excel: vi.fn(), request: vi.fn(), pdfTable: vi.fn(), pdfSave: vi.fn(), print: vi.fn() }));
vi.mock("xlsx", async original => ({ ...await original<typeof import("xlsx")>(), writeFile: fx.excel }));
vi.mock("jspdf", () => ({ default: class { text = vi.fn(); save = fx.pdfSave; } }));
vi.mock("jspdf-autotable", () => ({ default: fx.pdfTable }));
vi.mock("@/lib/installedApp", () => ({ openPrintableHtmlOrPreview: fx.print }));
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
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  render(<TrackerConsumption kind="bitumen" days={[{ date, actual: 5 }, { date: yesterday, actual: 6 }, { date: "2020-01-01", actual: 99 }]}
    parties={[{ id: 7, name: "Party seven" }, { id: 8, name: "Party eight" }]} dispatches={[
      { date, loadWeight: 60, theoreticalBitumenQty: 3, partyId: 7 },
      { date, loadWeight: 40, theoreticalBitumenQty: 1, partyId: 8 },
      { date: yesterday, loadWeight: 40, theoreticalBitumenQty: 1, partyId: 8 },
    ]} canViewNormActual canExport />);
  expect(screen.queryByText("2020-01-01")).toBeNull();
  fireEvent.change(screen.getByLabelText("Consumption party"), { target: { value: "7" } });
  expect(screen.queryByText(yesterday)).toBeNull();
  const total = screen.getByText("Total").closest("tr")!;
  expect(within(total).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["Total", "60.000", "3.000", "—", "—"]);
  fireEvent.click(screen.getByRole("button", { name: "Excel" }));
  const sheet = fx.excel.mock.calls[0][0].Sheets.Consumption;
  expect(XLSX.utils.sheet_to_json(sheet)).toContainEqual({
    Date: "Total", "Production (MT)": "60.000", "Norm use (MT)": "3.000", "Actual use from dips (MT)": "—", "Difference (MT)": "—",
  });
});
it("exports the same multi-day totals to PDF and print, including dates beyond the default ten days", () => {
  render(<TrackerConsumption kind="bitumen" days={[{ date, actual: 5 }, { date: "2020-01-01", actual: 2 }]}
    dispatches={[{ date, loadWeight: 100, theoreticalBitumenQty: 4 }, { date: "2020-01-01", loadWeight: 50, theoreticalBitumenQty: 3 }]}
    canViewNormActual canExport />);
  fireEvent.change(screen.getByLabelText("Consumption from date"), { target: { value: "2020-01-01" } });
  const total = screen.getByText("Total").closest("tr")!;
  expect(within(total).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["Total", "150.000", "7.000", "7.000", "0.000"]);
  fireEvent.click(screen.getByRole("button", { name: "PDF" }));
  expect(fx.pdfTable.mock.calls[0][1].body.at(-1)).toEqual(["Total", "150.000", "7.000", "7.000", "0.000"]);
  expect(fx.pdfSave).toHaveBeenCalledWith("bitumen_consumption.pdf");
  fireEvent.click(screen.getByRole("button", { name: "Print" }));
  expect(fx.print.mock.calls[0][0]).toContain("<td>Total</td><td>150.000</td><td>7.000</td><td>7.000</td><td>0.000</td>");
});
it("keeps norm permission checks and never substitutes missing dip readings with norm use", () => {
  render(<TrackerConsumption kind="bitumen" days={[]} dispatches={[{ date, loadWeight: 100, theoreticalBitumenQty: 4 }]} canViewNormActual={false} canExport={false} />);
  expect(within(screen.getByText("Total").closest("tr")!).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["Total", "—", "—", "—", "—"]);
  expect(screen.queryByRole("button", { name: "Excel" })).toBeNull();
});

it("LDO keeps tanks and read-only ownership above one consumption table, followed by both histories", () => {
  fx.data["/api/plant-module/ldo-dip-readings"] = [dip(1, "opening", 1000, 1), dip(1, "closing", 800, 2), dip(2, "opening", 500, 3), dip(2, "closing", 400, 4)];
  fx.data["/api/plant-module/ldo-flow-readings"] = [
    { ...dip(2, "opening", 0, 5), meterReading: 1000 },
    { ...dip(2, "closing", 0, 6), meterReading: 1250 },
  ];
  fx.data["/api/plant-module/dispatches"] = [{ date, loadWeight: 100, theoreticalLdoQty: 280, partyId: 7 }];
  render(<PlantLdoFlowMeter />);
  const tanks = screen.getByTestId("ldo-tanks"), positions = screen.getByTestId("ldo-packed-stock-summary");
  const consumption = screen.getByTestId("ldo-consumption"), history = screen.getByText("Dip readings");
  expect(tanks.compareDocumentPosition(positions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(positions.compareDocumentPosition(consumption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(consumption.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(history.compareDocumentPosition(screen.getByText("Flow meter readings")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(positions).queryByRole("button")).toBeNull();
  for (const text of ["LDO Reconciliation", "Daily Consumption Summary (Dip-Based, Last 10 days)", "Meter readings — daily LDO consumption", "LDO Consumption Variance Analysis", "Book vs Physical LDO Stock Correction", "LDO tank book stock"]) expect(screen.queryByText(text)).toBeNull();
  expect(within(consumption).getByText("Total").closest("tr")!.textContent).toBe("Total100.0280.0300.0250.020.0 more3.00");
  fireEvent.click(within(consumption).getByRole("button", { name: "Excel" }));
  expect(XLSX.utils.sheet_to_json(fx.excel.mock.calls[0][0].Sheets.Consumption)).toContainEqual({
    Date: "Total", "Production (MT)": "100.0", "Norm use (L)": "280.0", "Actual use from dips (L)": "300.0",
    "Dryer meter (L)": "250.0", "Difference (L)": "20.0 more", "L per MT": "3.00",
  });
});

it("LDO settings stay Owner-only and the header dialog keeps the same save request", async () => {
  fx.owner = false; const page = render(<PlantLdoFlowMeter />);
  expect(screen.queryByRole("button", { name: "Dip settings" })).toBeNull();
  page.unmount(); fx.owner = true; render(<PlantLdoFlowMeter />);
  fireEvent.click(screen.getByRole("button", { name: "Dip settings" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Allowed LDO difference (L)"), { target: { value: "75" } });
  fx.request.mockResolvedValue({});
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(fx.request).toHaveBeenCalledWith("PATCH", "/api/plant-module/plant-settings/Main%20Plant/dip-watch", expect.objectContaining({ ldoAllowedDifferenceL: 75 })));
});

it("moves bitumen correction with the same HLC-only target and audit request; opening/cancelling writes nothing", async () => {
  fx.data["/api/plant-module/materials"] = [{ id: 1, name: "BITUMEN" }];
  fx.data["/api/plant-module/stock-balances"] = [{ materialId: 1, partyId: 7, balance: "10", uom: "MT" }, { materialId: 1, partyId: 8, balance: "3", uom: "MT" }];
  fx.data["/api/plant-module/bitumen-dip-readings"] = [dip(1, "closing", 10000, 1), dip(2, "closing", 2000, 2)];
  render(<PhysicalStockCorrectionButton />);
  fireEvent.click(screen.getByRole("button", { name: "Physical stock correction" }));
  expect((screen.getByLabelText("Correction tank 1") as HTMLInputElement).value).toBe("10.200");
  expect((screen.getByLabelText("Correction tank 2") as HTMLInputElement).value).toBe("2.040");
  expect(fx.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(fx.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Physical stock correction" }));
  fx.request.mockResolvedValue({ json: async () => ({ adjustment: -0.76, newBalance: 9.24 }) });
  fireEvent.click(screen.getByRole("button", { name: "Post correction" }));
  await waitFor(() => expect(fx.request).toHaveBeenCalledWith("POST", "/api/plant-module/stock-correction", {
    materialId: 1, partyId: 7, physicalQty: expect.closeTo(9.24, 6), uom: "MT", date, correctedBy: "admin",
    notes: "Shared-tank dip/book difference -0.760 MT posted to HLC only — T1: 10.200 MT, T2: 2.040 MT",
  }));
});

it("moves LDO correction with the same litre-to-MT payload and unchanged packed stock", async () => {
  fx.data["/api/plant-module/materials"] = [{ id: 2, name: "LDO" }];
  fx.data["/api/plant-module/parties"] = [{ id: 7, name: "Fixture party" }];
  fx.data["/api/plant-module/stock-balances"] = [{ materialId: 2, partyId: 7, balance: 1000, uom: "Liters" }];
  fx.data["/api/plant-module/packed-stock-positions"] = { rows: [{ materialName: "LDO", partyId: 7, stockUom: "Liters", packed: 200, packedL: 200, tank1L: 100, tank2L: 400 }] };
  fx.data["/api/plant-module/ldo-dip-readings"] = [dip(1, "closing", 1000, 1), dip(2, "closing", 500, 2)];
  render(<PhysicalStockCorrectionButton />);
  fireEvent.click(screen.getByRole("button", { name: "Physical stock correction" }));
  fireEvent.change(screen.getByLabelText("Correction material"), { target: { value: "ldo" } });
  expect((screen.getByLabelText("Correction tank 1") as HTMLInputElement).value).toBe("1000");
  expect((screen.getByLabelText("Correction party") as HTMLSelectElement).value).toBe("7");
  fx.request.mockResolvedValue({ json: async () => ({ adjustment: 1, newBalance: 2, uom: "MT" }) });
  fireEvent.click(screen.getByRole("button", { name: "Post correction" }));
  await waitFor(() => expect(fx.request).toHaveBeenCalledWith("POST", "/api/plant-module/stock-correction", {
    materialId: 2, partyId: 7, physicalQty: 1700 * LDO_DENSITY_KG_PER_LITER / 1000, tank1L: 1000, tank2L: 500, uom: "MT", date,
    notes: "LDO dip reconciliation — Boiler: 1000 L, Dryer: 500 L (Fixture party)", correctedBy: "admin",
  }));
  expect(fx.data["/api/plant-module/packed-stock-positions"].rows[0].packedL).toBe(200);
});

it("hides the physical correction entry from non-Owners", () => {
  fx.owner = false; render(<PhysicalStockCorrectionButton />);
  expect(screen.queryByRole("button", { name: "Physical stock correction" })).toBeNull();
  expect(fx.request).not.toHaveBeenCalled();
});
