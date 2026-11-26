// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fixture.toast }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));

import { LevelSheetEditor } from "@/components/level-sheets/LevelSheetEditor";
import { apiRequest } from "@/lib/queryClient";

const bootstrap = {
  sites: [{ id: 1, name: "ALLADURG PWD ROAD TO PAMPAD" }],
  siteId: 1,
  projects: [{ id: 2, name: "FIXTURE PROJECT", siteId: 1, status: "active" }],
  boqProjectId: 2,
  items: [{ id: 3, itemCode: "GSB-01", displayName: "GSB", itemName: "Granular Sub-base", description: "WMM fixture", unit: "cum", layerConfig: {} }],
  personnel: [{ id: 4, name: "FIXTURE SURVEYOR", role: "Surveyor", isActive: 1 }],
  layerOptions: ["GSB", "WMM"],
  settings: { bookChainageSystem: "ours" as const, consultantOffsetM: 0 },
};

function renderEditor({ sheetId = null, sheet = null }: { sheetId?: number | null; sheet?: any } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <LevelSheetEditor
      siteId={1} bootstrap={bootstrap} sheetId={sheetId} sheet={sheet}
      loadingSheet={false} sheetError={null} canCreate canEdit canApprove
      onBack={vi.fn()} onSave={vi.fn()} saving={false}
    />
  </QueryClientProvider>);
}

beforeEach(() => {
  fixture.toast.mockReset();
  vi.mocked(apiRequest).mockReset();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/design?")) {
      return new Response(JSON.stringify({ rows: [
        { id: 1, chainageOursKm: 0, centreLevel: 100, crossfallLeftPct: 0, crossfallRightPct: 0, topWidthLeftM: 3, topWidthRightM: 3, source: "TYPED" },
        { id: 2, chainageOursKm: 0.01, centreLevel: 100, crossfallLeftPct: 0, crossfallRightPct: 0, topWidthLeftM: 3, topWidthRightM: 3, source: "TYPED" },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/bootstrap")) return new Response(JSON.stringify(bootstrap), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Level sheets screen", () => {
  it("shows the design/readings/results tabs and keeps editable point columns aligned", async () => {
    renderEditor();
    await screen.findByText("Design levels · GSB");
    expect(screen.getByRole("button", { name: "Edit in Design levels" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Import consultant Excel" })).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "2. Readings" }), { button: 0 });
    const chainage = await screen.findByRole("textbox", { name: "Reading chainage 1" });
    expect((chainage as HTMLInputElement).value).toBe("0+000");

    fireEvent.click(screen.getByRole("button", { name: "Add point left of centre" }));
    fireEvent.click(screen.getByRole("button", { name: "Add point right of centre" }));
    const leftDistance = screen.getByRole("textbox", { name: /L point distance/ });
    const rightDistance = screen.getByRole("textbox", { name: /R point distance/ });
    fireEvent.change(leftDistance, { target: { value: "2,5" } });
    fireEvent.change(rightDistance, { target: { value: "2.5" } });
    expect((leftDistance as HTMLInputElement).value).toBe("2.5");
    expect((rightDistance as HTMLInputElement).value).toBe("2.5");

    fireEvent.change(screen.getByRole("textbox", { name: "Reading 1 L 2.5" }), { target: { value: "100,2" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Reading 1 CL 0" }), { target: { value: "100,1" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Reading 1 R 2.5" }), { target: { value: "100,2" } });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "3. Result & quantities" }), { button: 0 });
    await screen.findByText("Result & quantities");
    expect(screen.getByText("ours 0+000 · consultant 0+000")).toBeTruthy();
    expect(screen.getByText("Points within", { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ours 0+000 · consultant 0+000" }));
    expect(screen.getByText(/Cross-section · top width/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Print preview" }));
    expect(await screen.findByText("Level sheet print preview")).toBeTruthy();
    expect(screen.getAllByText("Cut (sqm)").length).toBe(2);
    expect([...document.querySelectorAll("style")].some(style => style.textContent?.includes("background: transparent"))).toBe(true);
  });

  it("shows the non-required check/sign tab and labels current levels as not checked", async () => {
    renderEditor();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "4. Check & sign" }), { button: 0 });
    expect(await screen.findByText("Staff levels — not checked yet")).toBeTruthy();
    expect(screen.getByText("Taken by")).toBeTruthy();
    expect(screen.getByText("Save the level sheet before recording check details.")).toBeTruthy();
  });

  it("saves checker details and a checked point, then shows the chainage status", async () => {
    const sheet = {
      id: 11, siteId: 1, boqProjectId: 2, boqItemId: 3, layerName: "GSB", sheetDate: "2026-11-01",
      instrument: "Auto level", toleranceAboveMm: 10, toleranceBelowMm: 10, allowedClosingErrorMm: 10,
      readingMode: "rl", tbmName: "TBM 1", tbmRl: 100, initialBackSight: null, closingForeSight: null,
      readings: [{ chainageOursKm: 0, shift: null, points: [{ columnKey: "cl", side: "CL", distanceM: 0, value: 100, remark: null }] }],
      personnelIds: [4], staff: [
        { id: 4, name: "FIXTURE SURVEYOR", role: "Surveyor", isActive: 1 },
        { id: 5, name: "OLD SURVEYOR", role: "Surveyor", isActive: 0 },
      ],
      status: "saved", checkedByType: "not_checked", checkedPoints: [],
      fileName: null, objectPath: null, mimeType: null, fileSize: null,
    };
    vi.mocked(apiRequest).mockImplementation(async (_method: any, _url: any, payload: any) =>
      new Response(JSON.stringify({ ...sheet, checkedByType: payload.checkedByType, checkedByName: payload.checkedByName,
        checkedByDesignation: payload.checkedByDesignation, checkedDate: payload.checkedDate, checkedPoints: payload.checkedPoints }),
      { status: 200, headers: { "Content-Type": "application/json" } }) as any);
    renderEditor({ sheetId: 11, sheet });
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "4. Check & sign" }), { button: 0 });
    expect(await screen.findByText("OLD SURVEYOR · inactive")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Checked by"), { target: { value: "department" } });
    fireEvent.change(screen.getByLabelText("Checker name"), { target: { value: "Department Engineer" } });
    fireEvent.change(screen.getByLabelText("Designation"), { target: { value: "Assistant Engineer" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "CL" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Checked RL CL 0" }), { target: { value: "100.002" } });
    expect(screen.getByText("+2 mm")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save check & sign" }));
    expect(await screen.findByText("Checked by department (DEPARTMENT ENGINEER) at 1 of 1 chainages")).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/level-sheets/11/check", expect.objectContaining({
      checkedByType: "department", checkedByName: "Department Engineer",
      checkedPoints: [{ chainageOursKm: 0, columnKey: "cl", checked: true, checkedRl: 100.002 }],
    }));
  });

  it("requires TBM and back sight before converting filled RLs to staff readings", async () => {
    renderEditor();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "2. Readings" }), { button: 0 });
    fireEvent.change(await screen.findByRole("textbox", { name: "Reading 1 CL 0" }), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter staff readings" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Enter the TBM level and back sight");
    fireEvent.change(screen.getByRole("textbox", { name: "Known TBM RL" }), { target: { value: "99" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Staff reading on the start TBM (BS)" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter staff readings" }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Reading 1 CL 0" }) as HTMLInputElement).value).toBe("0"));
  });
  it("places +L and +R inside CL and shifts only before the selected chainage", async () => {
    renderEditor();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "2. Readings" }), { button: 0 });
    const left = await screen.findByRole("button", { name: "Add point left of centre" });
    expect(left.closest("th")?.textContent).toBe("+LCL+R");
    expect(screen.queryByRole("button", { name: "Shift instrument", exact: true })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enter staff readings" }));
    const shift = screen.getByRole("button", { name: "Moved the level instrument?" }) as HTMLButtonElement;
    expect(shift.disabled).toBe(true);
    fireEvent.click(screen.getByRole("textbox", { name: "Reading chainage 1" }));
    fireEvent.click(shift);
    expect(screen.getByRole("textbox", { name: "Change-point foresight 1" })).toBeTruthy();
  });
  it("keeps sequential decimal typing in reading, distance and TBM level boxes", async () => {
    renderEditor();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "2. Readings" }), { button: 0 });
    fireEvent.click(await screen.findByRole("button", { name: "Add point left of centre" }));
    const distance = screen.getByRole("textbox", { name: /L point distance/ });
    const reading = screen.getByRole("textbox", { name: "Reading 1 CL 0" });
    fireEvent.change(screen.getByLabelText("Levels from TBM (optional)"), { target: { value: "manual" } });
    const tbm = screen.getByRole("textbox", { name: "Known TBM RL" });
    for (const box of [distance, reading, tbm]) {
      fireEvent.focus(box);
      for (const value of ["3", "3.", "3.5"]) {
        fireEvent.change(box, { target: { value } });
        expect((box as HTMLInputElement).value).toBe(value);
      }
      fireEvent.blur(box);
      expect((box as HTMLInputElement).value).toBe("3.5");
    }
    fireEvent.focus(reading);
    fireEvent.change(reading, { target: { value: "-" } });
    expect((reading as HTMLInputElement).value).toBe("-");
    fireEvent.change(reading, { target: { value: "1,5" } });
    expect((reading as HTMLInputElement).value).toBe("1,5");
    fireEvent.blur(reading);
    expect((reading as HTMLInputElement).value).toBe("1.5");
  });
  it("keeps the chainage input mounted and its decimal buffer while the chainage changes", async () => {
    renderEditor();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "2. Readings" }), { button: 0 });
    const chainage = await screen.findByLabelText("Reading chainage 1");
    fireEvent.focus(chainage);
    for (const value of ["3", "3.", "3.5"]) {
      fireEvent.change(chainage, { target: { value } });
      expect(screen.getByLabelText("Reading chainage 1")).toBe(chainage);
      expect((chainage as HTMLInputElement).value).toBe(value);
    }
    fireEvent.blur(chainage);
    expect((chainage as HTMLInputElement).value).toBe("3+500");
  });
  it("offers all layers even after choosing Other, and uses plain staff steps", async () => {
    renderEditor();
    fireEvent.change(await screen.findByLabelText("Levels of"), { target: { value: "__other" } });
    fireEvent.change(screen.getByLabelText("Other layer"), { target: { value: "Custom layer" } });
    const layers = screen.getByLabelText("Levels of");
    expect(layers.textContent).toContain("WMM");
    expect(layers.textContent).toContain("GSB");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "2. Readings" }), { button: 0 });
    fireEvent.click(await screen.findByRole("button", { name: "Enter staff readings" }));
    expect(screen.getByLabelText("Start from TBM")).toBeTruthy();
    expect(screen.getByLabelText("Finish on TBM")).toBeTruthy();
    expect(screen.getByText(/No TBMs saved for this site/)).toBeTruthy();
    expect(screen.getByLabelText("Staff reading on the start TBM (BS)")).toBeTruthy();
    expect(screen.queryByLabelText("Closing TBM name")).toBeNull();
  });
});
