import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateDprSubmitReadiness } from "../shared/dprSubmitReadiness";
import { withCutFillReadinessContext } from "../client/src/lib/cutFillLedger";
import { excavationMaterialOutcomeIssue } from "../shared/cutFillReconciliation";

const entry = readFileSync("client/src/pages/SiteEntry.tsx", "utf8");
const boq = [{ id: 7, description: "ROADWAY EXCAVATION", unit: "CUM" }];
const row = { entryKey: "row-7", activity: "ROADWAY EXCAVATION", boqItemId: 7,
  chainageFrom: "1+000", chainageTo: "1+100", quantity: 100, uom: "CUM",
  materialOutcome: null, reusableQty: null };
const evaluate = (progress: typeof row[]) => evaluateDprSubmitReadiness({
  workType: "road", progress: withCutFillReadinessContext(progress, boq),
  equipment: [], labour: [], materials: [],
});

describe("DPR16 B2 classic SiteEntry", () => {
  it("uses the shared evaluator on live BOQ-enriched form rows, preserving cut/fill reusable quantity validation", () => {
    expect(evaluate([row]).mandatory).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "activities", rowIndex: 0, label: row.activity }),
    ]));
    expect(evaluate([{ ...row, materialOutcome: "fully_reusable", reusableQty: 100 }]).mandatory.some(
      issue => issue.section === "activities",
    )).toBe(false);
    const invalid = { ...row, materialOutcome: "partly_reusable", reusableQty: 120 };
    expect(excavationMaterialOutcomeIssue(invalid.quantity, invalid.materialOutcome, invalid.reusableQty, invalid.uom))
      .toMatch(/between 0 and 100 CUM/i);
    expect(evaluate([invalid]).mandatory).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "activities", rowIndex: 0, message: expect.stringMatching(/between 0 and 100 CUM/i) }),
    ]));
  });

  it("opts classic into existing condensed controls without changing section-specific persistence", () => {
    expect(entry).toContain("condensedActivityPresentation && <button");
    expect(entry).toContain("condensed={condensedActivityPresentation}");
    expect(entry).toContain("condensedFill={condensedActivityPresentation}");
    expect(entry).toContain("sectionPresentation\n              onChange");
    expect(entry).toContain("!sectionEditor && entry.dieselSource === \"plant_stock\"");
    const classicTank = entry.slice(entry.indexOf('{!sectionEditor && entry.dieselSource === "plant_stock"'), entry.indexOf("</details>", entry.indexOf('{!sectionEditor && entry.dieselSource === "plant_stock"')));
    expect(classicTank).not.toContain("requireConfirmationForConsumption");
    expect(entry).toContain("requireConfirmationForConsumption\n                  index={idx}");
    expect(entry).toContain("dieselBalanceConfirmed={entry.dieselBalanceConfirmed}");
    expect(entry).toContain("pickDprSectionPayload(sectionEditor.section, draftPayload)");
    expect(entry).toContain("data-testid={`select-personnel-${idx}`}");
    expect(entry).toContain("renderProgressUnit(entry, idx)");
    expect(entry).toContain("MANUAL_QUANTITY_SOURCES.map");
  });

  it("shows live mandatory items and exact-row Fix, including return from preview without resetting form", () => {
    expect(entry).toContain("data-testid=\"classic-readiness-banner\"");
    expect(entry).toContain("withCutFillReadinessContext(progress.map(p => ({");
    expect(entry).toContain("quantity: p.quantity ?? calculateQuantity(p)");
    const banner = entry.slice(entry.indexOf("const classicReadinessBanner ="), entry.indexOf("if (showPreview) {", entry.indexOf("const classicReadinessBanner =")));
    expect(banner).toContain("classicReadiness.mandatory.map");
    expect(banner).toContain("onClick={() => {");
    expect(entry).toMatch(/const classicReadinessBanner =[\s\S]*?onClick=\{\(\) => \{\s*if \(showPreview\) \{\s*setShowPreview\(false\);\s*window\.setTimeout\(\(\) => focusSectionIssue\(issue\), 80\);\s*\} else \{\s*focusSectionIssue\(issue\)/);
    const preview = entry.slice(entry.indexOf("if (showPreview) {\n    return ("), entry.indexOf("  return (\n    <div className=\"max-w-5xl"));
    expect(preview).toMatch(/\{classicReadinessBanner\}[\s\S]*?<SitePreview/);
    expect(entry.slice(entry.indexOf('  return (\n    <div className="max-w-5xl'))).toContain("{classicReadinessBanner}");
    expect(entry).toContain("setExpandedActivities(previous => previous.includes(progress[rowIndex].entryKey)");
    expect(entry).toContain("onMandatoryIssue={(issue) => {");
    expect(entry).toContain("setShowPreview(false)");
    expect(entry).toContain("window.setTimeout(() => focusSectionIssue(issue), 80)");
    expect(entry).toContain("onViewSource={() => {");
    expect(entry).toContain("readOnly persistedArrangementId={entry.earthworkArrangementId}");
  });
});