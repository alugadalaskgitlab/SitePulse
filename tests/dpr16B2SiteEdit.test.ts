import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateDprSubmitReadiness } from "../shared/dprSubmitReadiness";
import { withCutFillReadinessContext } from "../client/src/lib/cutFillLedger";
import { excavationMaterialOutcomeIssue } from "../shared/cutFillReconciliation";

const edit = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
const boq = [{ id: 7, description: "ROADWAY EXCAVATION", unit: "CUM" }];
const row = { entryKey: "edit-row-7", activity: "ROADWAY EXCAVATION", boqItemId: 7,
  chainageFrom: "1+000", chainageTo: "1+100", quantity: 100, uom: "CUM",
  materialOutcome: null, reusableQty: null };
const evaluate = (progress: typeof row[]) => evaluateDprSubmitReadiness({
  workType: "road", progress: withCutFillReadinessContext(progress, boq),
  equipment: [], labour: [], materials: [],
});

describe("DPR16 B2 classic SiteEdit", () => {
  it("uses the real BOQ-enriched evaluator; missing material outcome resolves and partly reusable still validates", () => {
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

  it("evaluates current form without invoking mutations or mutating quantity during display", () => {
    const display = edit.slice(edit.indexOf("// Display-only: use the same normalized"), edit.indexOf("if (isLoading) {", edit.indexOf("// Display-only: use the same normalized")));
    expect(display).toContain("formInitializedRef.current && boqProjectsLoaded");
    expect(display).toContain("evaluateDprSubmitReadiness({");
    expect(display).toContain("withCutFillReadinessContext(progress.map(p => {");
    expect(display).toContain("const quantity = p.quantity ?? calculateQuantity({ ...p })");
    expect(display).toContain("uom: progressUom(p)");
    expect(display).toContain("normalizeExcavationMaterialOutcome(quantity, p.materialOutcome, p.reusableQty)");
    expect(display).not.toMatch(/\.mutate\(|setProgress\(|useEffect\(/);
    expect(edit).toContain('data-testid="classic-edit-readiness-banner"');
    expect(edit).toContain('data-testid="classic-edit-readiness-unavailable"');
  });

  it("fixes the exact mounted row and keeps all original form controls inside its collapsed details", () => {
    expect(edit).toContain("key={entry.entryKey}");
    expect(edit).toContain("data-entry-key={entry.entryKey}");
    expect(edit).toContain("previous.includes(entryKey) ? previous : [...previous, entryKey]");
    expect(edit).toContain('row.getAttribute("data-entry-key") !== entryKey');
    expect(edit).toContain("scrollAndHighlightRow({ section: issue.section, rowIndex");
    expect(edit).toContain('data-testid={`edit-activity-toggle-${idx}`}');
    const details = edit.slice(edit.indexOf('<div id={`edit-activity-details-'), edit.indexOf('{workType === "road" && (', edit.indexOf('<div id={`edit-activity-details-')));
    for (const testId of ["input-qty-", "input-layer-no-", "select-uom-", "select-qty-source-", "select-personnel-", "button-entry-photo-camera-"]) {
      expect(details).toContain(testId);
    }
     expect(details).toContain("xl:grid-cols-8");
     const geometry = details.slice(details.indexOf('data-testid={`edit-activity-geometry-${idx}`}'), details.indexOf('className="col-span-full max-w-xs"'));
     expect(geometry).not.toContain('data-testid={`select-uom-${idx}`}');
     expect(geometry).toContain('data-testid={`input-qty-${idx}`}');
     expect(details).toContain('data-testid={`select-uom-${idx}`}');
    expect(details).toContain("MANUAL_QUANTITY_SOURCES.map");
    expect(details).toContain("<CutFillOutcomeControls");
    expect(details).toContain("condensedFill onViewSource");
    expect(details).toContain("readOnly persistedArrangementId={entry.earthworkArrangementId}");
    expect(edit).toContain("normalizeSiteEditProgressPayload");
  });

  it("uses compact equipment presentation without changing its linked controls, tank confirmation or persistence", () => {
    const compactStart = edit.indexOf("<DprEquipmentCompact", edit.indexOf("<CardTitle>Equipment Log"));
    const compact = edit.slice(compactStart, edit.indexOf("/>", compactStart) + 2);
    expect(compact).toContain("sectionPresentation");
    expect(compact).toContain('enableTankContinuity={entry.dieselSource === "plant_stock"}');
    expect(compact).toContain("allowLinkedSourceEdit={isAdmin}");
    expect(compact).toContain("stoppageSlot={stoppageSlot}");
    expect(edit).toContain("const stoppageSlot = (");
    expect(edit).toContain("value={entry.breakdowns ?? []}");
    expect(compact).not.toContain("showTankBalance={false}");
    expect(edit).toContain("dieselBalanceConfirmed?: boolean | null");
    expect(edit).toContain("normalizeSiteEditEquipmentPayload");
    expect(edit).toContain("submitDraftMutation.mutate(payload)");
    expect(edit).toContain("updateMutation.mutate(payload)");
  });
});