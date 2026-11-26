// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReadingsTab, hydrateRows } from "@/components/level-sheets/ReadingsTab";
import { calculateLevelSheet, createRangeReadings, assumedDesignReadings, rangeCalculation, quantitiesBetweenSheets, initialCheckGrid, type CheckDetails, type ReadingMode, type LevelSignature } from "@shared/levelSheets";
import { ResultsTab } from "@/components/level-sheets/ResultsTab";
import { CheckAndSignTab } from "@/components/level-sheets/CheckAndSignTab";
import { LevelSheetPrintPreview } from "@/components/level-sheets/LevelSheetPrintPreview";
import { LevelSignaturePad } from "@/components/level-sheets/LevelSignaturePad";
vi.mock("@/hooks/use-upload", () => ({ useUpload: () => ({ uploadFile: vi.fn(), isUploading: false }) }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const design = [0, .01, .02].map(chainageOursKm => ({ chainageOursKm, centreLevel: 100, crossfallLeftPct: 2, crossfallRightPct: 2, topWidthLeftM: 3, topWidthRightM: 3, source: "TYPED" as const }));
function Harness({ initial = "rl" }: { initial?: ReadingMode }) {
  const [rows, setRows] = useState(hydrateRows(createRangeReadings(0, .01, 10, [2, 4], [2])).rows);
  const [mode, setMode] = useState(initial);
  const [header, setHeader] = useState({ tbmName: "", tbmRl: "100", initialBackSight: "1", closingForeSight: "1" });
  return <ReadingsTab rows={rows} onRowsChange={setRows} mode={mode} onModeChange={setMode} designRows={design}
    settings={{ bookChainageSystem: "consultant", consultantOffsetM: 100 }} header={header} onHeaderChange={setHeader}
    toleranceAboveMm={10} toleranceBelowMm={10} allowedClosingErrorMm={10} resetKey={null} readOnly={false} newSheet
    tbms={[{ id: 1, name: "alpha", rl: 100, chainageOursKm: 0, active: true }, { id: 2, name: "beta", rl: 101, chainageOursKm: .01, active: true }, { id: 3, name: "old", rl: 99, active: false }]} />;
}
it("keeps RL entry free of BS/FS and lists active TBMs in the site's chainage system", () => {
  render(<Harness />);
  expect(screen.queryByLabelText(/BS\)/)).toBeNull();
  expect(screen.queryByLabelText(/FS\)/)).toBeNull();
  const picker = screen.getByLabelText("Levels from TBM (optional)");
  expect(picker.textContent).toContain("ALPHA · 0+100 · 100.000");
  expect(picker.textContent).toContain("BETA");
  expect(picker.textContent).not.toContain("OLD");
});
it.each(["rl", "staff"] as const)("shows design before entry and differences at centre and within width in %s mode", mode => {
  render(<Harness initial={mode} />);
  expect(screen.getAllByText("Design 100.000").length).toBe(2);
  expect(screen.getAllByText("Design 99.960").length).toBe(4);
  expect(screen.getAllByText("Outside layer width").length).toBe(2);
  fireEvent.change(screen.getByLabelText("Reading 1 CL 0"), { target: { value: mode === "rl" ? "100.005" : ".995" } });
  fireEvent.change(screen.getByLabelText("Reading 1 L 2"), { target: { value: mode === "rl" ? "99.965" : "1.035" } });
  expect(screen.getAllByText("+5 mm · Within").length).toBe(2);
});
it("creates range rows and points in consultant chainages, then removes an individual row", () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("From chainage"), { target: { value: "0+100" } });
  fireEvent.change(screen.getByLabelText("To chainage"), { target: { value: "0+120" } });
  fireEvent.click(screen.getByRole("button", { name: "Create rows" }));
  expect(screen.getByLabelText("Reading chainage 3").getAttribute("value")).toBe("0+120");
  expect(screen.getByLabelText("Reading 3 L 3.375")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove chainage 2" }));
  expect(screen.queryByLabelText("Reading chainage 3")).toBeNull();
  expect(screen.getByLabelText("Reading chainage 2").getAttribute("value")).toBe("0+120");
});
it("bounds range generation and never calculates a closing check in RL mode", () => {
  expect(() => createRangeReadings(0, 20, 10, [], [])).toThrow(/500/);
  const calc = calculateLevelSheet({ designRows: design, readings: createRangeReadings(0, .01, 10, [], []), mode: "rl",
    tbmRl: 100, backsight: 1, closingForesight: 2, toleranceAboveMm: 10, toleranceBelowMm: 10 });
  expect(calc.closingErrorMm).toBeNull();
});
it("filters results and quantities to a stretch while preserving staff HI before the stretch", () => {
  const rows = createRangeReadings(0, .02, 10, [3], [3]).map(row => ({ ...row, points: row.points.map(point => ({ ...point, value: 100.3 })) }));
  const input = { designRows: design.map(row => ({ ...row, crossfallLeftPct: 0, crossfallRightPct: 0 })), readings: rows, mode: "rl" as const, toleranceAboveMm: 10, toleranceBelowMm: 10 };
  const full = calculateLevelSheet(input);
  expect(full.cutVolumeCum).toBeCloseTo(36);
  expect(rangeCalculation(full, .01, .02).cutVolumeCum).toBeCloseTo(18);
  render(<ResultsTab readings={hydrateRows(rows).rows} calculation={full} designRows={input.designRows} settings={{ bookChainageSystem: "ours", consultantOffsetM: 0 }} readingMode="rl" />);
  fireEvent.change(screen.getByLabelText("Result From chainage"), { target: { value: "0+010" } });
  expect(screen.queryByRole("button", { name: "ours 0+000 · consultant 0+000" })).toBeNull();
  expect(screen.getByText("18.0 / 0.0 cum")).toBeTruthy();
  const lower = { ...input, readings: rows.map(row => ({ ...row, points: row.points.map(point => ({ ...point, value: 100 })) })) };
  expect(quantitiesBetweenSheets(lower, input, .01, .02).fillCum).toBeCloseTo(18);
});
it("creates exact assumed levels and only carries edge levels when explicitly chosen", () => {
  const geometry = createRangeReadings(0, .01, 10, [5], [5]);
  expect(() => assumedDesignReadings(geometry, design, false)).toThrow(/Outside layer width/);
  const result = assumedDesignReadings(geometry, design, true);
  expect(result[0].points.map(point => point.value)).toEqual([99.94, 100, 99.94]);
  expect(result[0].points[0].remark).toBe("Made from design levels");
});
it("recognises the last design chainage stored as PostgreSQL real", () => {
  const rows = createRangeReadings(2.6, 2.61, 10, [], []);
  const stored = [2.6, 2.61].map(chainageOursKm => ({ ...design[0], chainageOursKm: Math.fround(chainageOursKm) }));
  const assumed = assumedDesignReadings(rows, stored, false);
  expect(assumed[1].points[0].value).toBe(100);
  const calculated = calculateLevelSheet({ readings: assumed, designRows: stored, mode: "rl", toleranceAboveMm: 10, toleranceBelowMm: 10 });
  expect(calculated.sections[1].points[0].designLevel).toBe(100);
});

const ownRows = hydrateRows(createRangeReadings(0, .02, 10, [], []).map(row => ({ ...row, points: row.points.map(point => ({ ...point, value: 100 })) }))).rows;
const ownCalculation = calculateLevelSheet({ readings: ownRows, designRows: design, mode: "rl", toleranceAboveMm: 10, toleranceBelowMm: 10 });
function CheckHarness({ legacy = false, onSave = vi.fn().mockResolvedValue(undefined) }: { legacy?: boolean; onSave?: any }) {
  const [details, setDetails] = useState<CheckDetails | null>(null);
  return <CheckAndSignTab sheetId={1} canEdit canApprove staff={[]} personnelIds={[]} onPersonnelIdsChange={vi.fn()}
    readings={ownRows} sections={ownCalculation.sections} settings={{ bookChainageSystem: "ours", consultantOffsetM: 0 }}
    checkedByType="department" checkedByName="CHECK ENGINEER" checkedByDesignation="AE" checkedDate="2026-11-26"
    checkedPoints={legacy ? [{ chainageOursKm: 0, columnKey: "CL:0", checked: true, checkedRl: "100.007" }] : []}
    onCheckedByTypeChange={vi.fn()} onCheckedByNameChange={vi.fn()} onCheckedByDesignationChange={vi.fn()} onCheckedDateChange={vi.fn()}
    onCheckedPointsChange={vi.fn()} checkDetails={details} onCheckDetailsChange={setDetails} designRows={design}
    attachment={{ fileName: null, objectPath: null, mimeType: null, fileSize: null }} onSaveCheck={onSave} saving={false} />;
}
it("opens old checks in the new grid and compares their RL to ours rather than design", () => {
  render(<CheckHarness legacy />);
  expect(screen.getByLabelText("Their reading 1 CL 0").getAttribute("value")).toBe("100.007");
  expect(screen.getByText("Theirs 100.007")).toBeTruthy();
  expect(screen.getByText("+7 mm")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Their reading 1 CL 0"), { target: { value: "" } });
  expect(screen.getByText(/checked 0 points at 0 chainages/)).toBeTruthy();
});
it("checks staff readings with a moved instrument and filters the offered grid", () => {
  render(<CheckHarness />);
  fireEvent.click(screen.getByRole("button", { name: "Enter their staff readings" }));
  fireEvent.change(screen.getByLabelText("Known TBM RL"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Staff reading on the start TBM (BS)"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Their reading 1 CL 0"), { target: { value: "1.995" } });
  fireEvent.click(screen.getByLabelText("Reading chainage 2"));
  fireEvent.click(screen.getByRole("button", { name: "Moved the level instrument?" }));
  fireEvent.change(screen.getByLabelText("Change-point foresight 2"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("New back sight 2"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Their reading 2 CL 0"), { target: { value: "2.995" } });
  expect(screen.getAllByText("+5 mm")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Offered to chainage"), { target: { value: "0+010" } });
  expect(screen.queryByLabelText("Their reading 3 CL 0")).toBeNull();
  expect(screen.getByText(/checked 2 points at 2 chainages · largest difference 5 mm/)).toBeTruthy();
});
it("captures a mouse/finger signature and supports Clear and Sign again", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const context = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,iVBORw0KGgo=");
  function Pad() {
    const [value, setValue] = useState<LevelSignature | null>({ name: "SUNIL KUMAR", designation: "Engineer", date: "2026-11-26", imageData: null });
    return <LevelSignaturePad title="Contractor" value={value} onChange={setValue} disabled={false} />;
  }
  render(<Pad />);
  const canvas = screen.getByLabelText("Contractor sign here");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 160 } as DOMRect);
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { clientX: 30, clientY: 30 });
  fireEvent.pointerUp(canvas);
  expect(context.stroke).toHaveBeenCalled();
  expect(screen.getByAltText("Contractor signature")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sign again" }));
  expect(screen.queryByAltText("Contractor signature")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(screen.getByText("Sunil Kumar")).toBeTruthy();
});
it("prints design / ours / theirs / difference and both signature images beside prominent names", () => {
  const grid = initialCheckGrid(ownRows, []);
  grid.toKm = .01;
  grid.readings[0].points[0].value = 100.002;
  const signature = { name: "SUNIL KUMAR", designation: "Engineer", date: "2026-11-26", imageData: "data:image/png;base64,iVBORw0KGgo=" };
  render(<LevelSheetPrintPreview siteName="FIXTURE" itemLabel="" layerName="GSB" sheetDate="2026-11-26" instrument=""
    tbmName="" tbmRl="" closingErrorMm={null} readings={ownRows} calculation={ownCalculation}
    settings={{ bookChainageSystem: "ours", consultantOffsetM: 0 }} staffNames={[]} checkedByType="department"
    checkedByName="CHECK ENGINEER" checkedByDesignation="AE" checkedDate="2026-11-26"
    checkDetails={{ grid, signatures: { contractor: signature, checker: { ...signature, name: "CHECK ENGINEER" } } }} />);
  fireEvent.click(screen.getByRole("button", { name: "Print preview" }));
  expect(screen.getByAltText("contractor signature")).toBeTruthy();
  expect(screen.getByAltText("checker signature")).toBeTruthy();
  expect(screen.getByText("Sunil Kumar").className).toContain("text-lg");
  expect(screen.getByText((_, element) => element?.tagName === "TD" && !!element.textContent?.includes("Difference +2 mm"))).toBeTruthy();
  expect(screen.getByText((_, element) => element?.tagName === "TD" && !!element.textContent?.includes("Theirs 100.002"))).toBeTruthy();
  expect(screen.getAllByText("For the contractor (HLC)").length).toBe(1);
  expect(screen.queryByText("ours 0+020 · consultant 0+020")).toBeNull();
});
