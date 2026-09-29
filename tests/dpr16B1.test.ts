import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateSectionReadiness, sectionIssueFieldTestId } from "../client/src/lib/dprSectionReadiness";

const boq = [{ id: 7, description: "ROADWAY EXCAVATION", unit: "CUM" }];
const excavation = { activity: "ROADWAY EXCAVATION", boqItemId: 7, chainageFrom: "1+000", chainageTo: "1+100", quantity: 100, uom: "CUM", materialOutcome: null, reusableQty: null };
const equipment = { machine: "Excavator", openingReading: 100, closingReading: null };

describe("DPR16 B1 section presentation and evaluator", () => {
  it("enriches saved excavation from BOQ and resolves only the edited row", () => {
    const saved = { workType: "road", progress: [excavation], equipment: [equipment], labour: [], materials: [] };
    const missing = evaluateSectionReadiness(saved, boq);
    expect(missing.mandatory).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "activities", rowIndex: 0, label: excavation.activity }),
      expect.objectContaining({ section: "equipment", rowIndex: 0 }),
    ]));
    const edited = evaluateSectionReadiness(saved, boq, { progress: [{ ...excavation, materialOutcome: "fully_reusable", reusableQty: 100 }] });
    expect(edited.mandatory.some(issue => issue.section === "activities")).toBe(false);
    expect(edited.mandatory.some(issue => issue.section === "equipment")).toBe(true);
    expect(saved.progress[0].materialOutcome).toBeNull();
  });
  it("preserves real partly-reusable validation and row identity after reordering", () => {
    const other = { activity: "OTHER WORK", quantity: 2 };
    const readiness = evaluateSectionReadiness({ workType: "road", progress: [other, { ...excavation, materialOutcome: "partly_reusable", reusableQty: 120 }] }, boq);
    expect(readiness.mandatory).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "activities", rowIndex: 1, message: expect.stringMatching(/between 0 and 100 CUM/i) }),
    ]));
    expect(readiness.mandatory.some(issue => issue.section === "activities" && issue.rowIndex === 0)).toBe(false);
  });
  it("uses saved quantities on hub and actual local calculated quantities in open activity", () => {
    const saved = { workType: "road", progress: [{ ...excavation, materialOutcome: "partly_reusable", reusableQty: 90 }] };
    expect(evaluateSectionReadiness(saved, boq).ready).toBe(true);
    const live = evaluateSectionReadiness(saved, boq, {
      progress: [{ ...saved.progress[0], quantity: 80 }], // actual form's geometry-derived quantity
    });
    expect(live.mandatory).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "activities", rowIndex: 0, message: expect.stringMatching(/between 0 and 80 CUM/i) }),
    ]));
    expect(saved.progress[0].quantity).toBe(100);
  });
  it("maps evaluator messages to real focused controls using normalized row indexes", () => {
    const issue = (section: "activities" | "equipment", message: string, rowIndex = 2) => ({ section, message, rowIndex, label: "row" });
    expect(sectionIssueFieldTestId(issue("activities", "choose fully reusable, partly reusable, or unsuitable"))).toBe("select-cut-fill-outcome");
    expect(sectionIssueFieldTestId(issue("activities", "reusable quantity must be between 0 and 80 CUM"))).toBe("input-reusable-qty");
    expect(sectionIssueFieldTestId(issue("activities", "chainage is incomplete"), "1+000")).toBe("input-progress-to-2");
    expect(sectionIssueFieldTestId(issue("activities", "quantity missing"))).toBe("input-progress-qty-2");
    expect(sectionIssueFieldTestId(issue("equipment", "closing meter reading required"))).toBe("equipment-compact-closing-meter-2");
    expect(sectionIssueFieldTestId(issue("equipment", "end time required"))).toBe("equipment-compact-end-2");
  });
  it("shares the approved condensed activity UI with classic while keeping section-only navigation and persistence", () => {
    const entry = readFileSync("client/src/pages/SiteEntry.tsx", "utf8");
    const hub = readFileSync("client/src/pages/DprSections.tsx", "utf8");
    expect(entry).toContain("requireConfirmationForConsumption\n                  index={idx}");
    expect(entry).toContain("condensedActivityPresentation && <button type=\"button\"");
    expect(entry).toContain("condensedActivityPresentation && !expandedActivities.includes(entry.entryKey)");
    expect(entry).toContain("condensedFill={condensedActivityPresentation}");
    expect(entry).toContain("pickDprSectionPayload(sectionEditor.section, draftPayload)");
    expect(entry).toContain("confirmLeave(() => sectionEditor.onFixOtherSection?.(issue))");
    expect(entry).toContain("data-testid={`select-personnel-${idx}`}");
    expect(entry).toContain("data-testid={`input-progress-width-${idx}`}");
    expect(entry).toContain("data-testid={`input-progress-layer-no-${idx}`}");
    expect(entry).toContain("dieselBalanceConfirmed={entry.dieselBalanceConfirmed}");
    expect(hub).toContain("readiness.mandatory");
    expect(hub).toContain("onSave: save");
  });
});