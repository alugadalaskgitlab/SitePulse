// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ReadingsTab, hydrateRows } from "@/components/level-sheets/ReadingsTab";
import { calculateLevelSheet, createRangeReadings, assumedDesignReadings, rangeCalculation, quantitiesBetweenSheets, type ReadingMode } from "@shared/levelSheets";
import { ResultsTab } from "@/components/level-sheets/ResultsTab";

afterEach(cleanup);
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
