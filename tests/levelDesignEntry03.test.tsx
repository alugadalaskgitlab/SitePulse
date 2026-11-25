// @vitest-environment jsdom
import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "@/lib/queryClient";
import { SiteDesignLevelsTab } from "@/components/level-sheets/SiteDesignLevelsTab";
import { ReadingsTab } from "@/components/level-sheets/ReadingsTab";

const settings = { bookChainageSystem: "ours" as const, consultantOffsetM: 0 };
beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.stubGlobal("fetch", vi.fn(async (input: any) => new Response(JSON.stringify(String(input).includes("/design/layers?")
    ? [{ layerName: "WMM", count: 3, fromKm: 0.75, toKm: 0.77 }]
    : String(input).includes("/bootstrap") ? { layerOptions: ["WMM", "OGL"] }
    : { rows: [], defaults: { crossfallLeftPct: 2.5, crossfallRightPct: 2, topWidthLeftM: 3.5, topWidthRightM: 3 } }), { status: 200 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function siteTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SiteDesignLevelsTab siteId={1} settings={settings} layerOptions={["WMM", "OGL"]} canCreate canEdit /></QueryClientProvider>);
}
it("shows layer counts/ranges and uses defaults for a row with only chainage and centre", async () => {
  vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ id: 10 })));
  siteTab();
  expect(await screen.findByRole("option", { name: "WMM · 3 rows · 0+750 to 0+770" })).toBeTruthy();
  await waitFor(() => expect((screen.getByLabelText("New left top width") as HTMLInputElement).value).toBe("3.5"));
  fireEvent.change(screen.getByLabelText("New design chainage"), { target: { value: "0+750" } });
  fireEvent.change(screen.getByLabelText("New centre level"), { target: { value: "100.123" } });
  fireEvent.click(screen.getByRole("button", { name: "Add design row" }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("POST", "/api/level-sheets/design/rows", expect.objectContaining({
    centreLevel: 100.123, chainageOursKm: 0.75, crossfallLeftPct: 2.5, crossfallRightPct: 2, topWidthLeftM: 3.5, topWidthRightM: 3,
  })));
});
it("previews both repeated rows, skips by default, then imports once despite a double click", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiRequest).mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }) as any);
  const { container } = siteTab();
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["", "WMM", "", ""], ["Chainage", -5, 0, 5],
    [750, 99.9, 100, 99.9], [750, 100.9, 101, 100.9], [760, 101.9, 102, 101.9],
  ]), "Design");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
  const file = new File([bytes], "consultant.xlsx");
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  const choice = await screen.findByLabelText("Repeated chainage 1 0.75");
  expect((choice as HTMLSelectElement).value).toBe("");
  expect(screen.getByText(/Row 1: centre 100.000/)).toBeTruthy();
  expect(screen.getByText(/Row 2: centre 101.000/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Import 1 rows" })).toBeTruthy();
  fireEvent.change(choice, { target: { value: "1" } });
  const button = screen.getByRole("button", { name: "Import 2 rows" });
  fireEvent.click(button); fireEvent.click(button);
  expect(await screen.findByRole("button", { name: "Importing 2 rows…" })).toBeTruthy();
  await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
  expect(vi.mocked(apiRequest).mock.calls[0][2]).toMatchObject({ fileName: "consultant.xlsx", duplicateChoices: { "1": { "0.75": 1 } } });
  finish(new Response(JSON.stringify({ imported: 2, skipped: 0, layers: [{ layerName: "WMM", count: 2, fromKm: 0.75, toKm: 0.76 }] })));
  expect(await screen.findByText("Imported 2 rows into WMM (0+750 to 0+760)")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("lists every active TBM, defaults the finish to start and shows a plain closing result", () => {
  function Entry() {
    const [header, setHeader] = useState({ tbmName: "", tbmRl: "", initialBackSight: "1", closingForeSight: "1", closingTbmName: "", closingTbmRl: "" });
    return <ReadingsTab rows={[{ chainageOursKm: 0, points: [{ columnKey: "cl", side: "CL", distanceM: 0, value: 1 }] }]} onRowsChange={() => {}} mode="staff" onModeChange={() => {}} designRows={[]} settings={settings} header={header}
      onHeaderChange={setHeader} toleranceAboveMm={10} toleranceBelowMm={10} allowedClosingErrorMm={10} resetKey={null} readOnly={false}
      tbms={[{ id: 1, name: "tbm 1", rl: 100, chainageOursKm: 0.75, active: true }, { id: 2, name: "tbm 2", rl: 101, chainageOursKm: 1, active: true }, { id: 3, name: "inactive tbm", rl: 102, active: false }]} />;
  }
  render(<Entry />);
  fireEvent.change(screen.getByLabelText("Start from TBM"), { target: { value: "1" } });
  expect((screen.getByLabelText("Known TBM RL") as HTMLInputElement).readOnly).toBe(true);
  expect((screen.getByLabelText("Finish on TBM") as HTMLSelectElement).value).toBe("1");
  expect(screen.getByLabelText("Start from TBM").textContent).toContain("TBM 2 · 1+000 · 101.000");
  expect(screen.queryByText(/inactive tbm/)).toBeNull();
  expect(screen.getByText(/Levels check OK/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Finish on TBM"), { target: { value: "2" } });
  expect(screen.getByText(/Levels do not close/)).toBeTruthy();
});
