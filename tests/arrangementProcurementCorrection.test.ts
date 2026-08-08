/**
 * FINAL EXECUTION ARRANGEMENT / PROCUREMENT CORRECTION — Part H tests.
 *
 * Frozen business rule: NO arrangement record = normal HLC/contractor
 * self-execution by default. Absence is never an error, never "Arrangement
 * Required". Procurement is read-only about arrangements: no manage links,
 * no navigation links, no "not covered" narratives.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  deriveExecutionState,
  EXECUTION_STATE_LABELS,
  EXECUTION_STATE_COLORS,
  type ExecutionStateArrangement,
} from "../shared/executionState";
import { buildArrangementEffects, hlcRetainedFraction } from "../shared/planningEngine";

const arr = (over: Partial<ExecutionStateArrangement>): ExecutionStateArrangement => ({
  id: 1, status: "approved", arrangementType: "fully_outsourced_composite",
  qtyForScope: 1000, agencyName: "Agency X", components: null, ...over,
});

describe("Part A — no arrangement means default HLC self-execution", () => {
  it("zero arrangements → self_execution, not arrangement_required", () => {
    const r = deriveExecutionState(5000, []);
    expect(r.state).toBe("self_execution");
    expect(r.label).toBe("HLC / Self-execution");
  });

  it("self_execution label/colour are neutral — no 'Required' wording, no amber", () => {
    expect(EXECUTION_STATE_LABELS.self_execution).not.toMatch(/required/i);
    expect(EXECUTION_STATE_COLORS.self_execution.bg).not.toMatch(/amber/);
    expect(EXECUTION_STATE_COLORS.self_execution.text).not.toMatch(/amber/);
  });

  it("cancelled/rejected-only arrangements also read as self-execution (back to full HLC)", () => {
    const r = deriveExecutionState(5000, [
      arr({ status: "cancelled" }), arr({ id: 2, status: "rejected" }),
    ]);
    expect(r.state).toBe("self_execution");
  });

  it("states for REAL arrangements are undisturbed", () => {
    expect(deriveExecutionState(1000, [arr({ qtyForScope: 1000 })]).state).toBe("outsourcing_approved");
    expect(deriveExecutionState(1000, [arr({ qtyForScope: 400 })]).state).toBe("partly_outsourced");
    expect(deriveExecutionState(1000, [arr({ status: "draft" })]).state).toBe("outsourcing_proposed");
    expect(deriveExecutionState(1000, [arr({ status: "on_hold" })]).state).toBe("on_hold");
    // arrangement exists but zero quantity decided → still a deliberate record awaiting decision
    expect(deriveExecutionState(1000, [arr({ status: "draft", qtyForScope: 0 })]).state).toBe("arrangement_required");
  });
});

describe("Part A — Gantt shows no warning when no arrangement exists", () => {
  it("Gantt arrangement counter only counts arrangement_required (self_execution not counted)", () => {
    const src = readFileSync("client/src/pages/WorkProgramme.tsx", "utf8");
    expect(src).toContain('r.state === "arrangement_required"');
    expect(src).not.toContain('r.state === "self_execution"');
  });

  it("PlannedWorkArrangementWarning only renders for arrangement_required", () => {
    const src = readFileSync("client/src/components/PlannedWorkArrangementWarning.tsx", "utf8");
    expect(src).toContain('state.state !== "arrangement_required"');
  });
});

describe("Part B — Procurement is read-only about arrangements", () => {
  const registerLink = readFileSync("client/src/components/ArrangementRegisterLink.tsx", "utf8");
  const workDemand = readFileSync("client/src/pages/WorkDemand.tsx", "utf8");

  it("no 'Manage in Execution Arrangements' action", () => {
    expect(registerLink).not.toContain("Manage in Execution Arrangements");
    expect(workDemand).not.toContain("Manage in Execution Arrangements");
  });

  it("no 'not covered by an arrangement' narrative", () => {
    expect(registerLink).not.toContain("not covered by an arrangement");
    expect(workDemand).not.toContain("not covered by an arrangement");
  });

  it("no arrangement-navigation link for bituminous rows (View in Work Programme removed)", () => {
    expect(workDemand).not.toContain("View in Work Programme");
    expect(workDemand).not.toMatch(/wp-link-/);
  });

  it("legacy EarthworkArrangementCell (Procurement-embedded manager) is deleted", () => {
    const dialog = readFileSync("client/src/components/EarthworkArrangementDialog.tsx", "utf8");
    expect(dialog).not.toContain("export function EarthworkArrangementCell");
    expect(dialog).not.toContain("View in Work Programme");
  });

  it("Earthwork Control copy no longer says 'Execution Arrangement Required'", () => {
    const ec = readFileSync("client/src/pages/EarthworkControl.tsx", "utf8");
    expect(ec).not.toContain("Execution Arrangement Required");
  });

  it("read-only cell maps 'none' to neutral HLC / Self-execution (no amber, no Link)", () => {
    expect(registerLink).toContain('none: { label: "HLC / Self-execution"');
    expect(registerLink).not.toContain("Execution Arrangement Required");
    expect(registerLink).not.toMatch(/from "wouter"/);
    expect(registerLink).not.toContain("AlertTriangle");
  });
});

describe("Part G — internal earthwork_arrangement_required renders as mapping status", () => {
  it("user-facing text is 'Material mapping required', never 'Execution Arrangement Required'", () => {
    const workDemand = readFileSync("client/src/pages/WorkDemand.tsx", "utf8");
    expect(workDemand).toContain("Material mapping required");
    expect(workDemand).not.toContain("Execution Arrangement Required");
  });
});

describe("Part C — demand-reduction engine preserved", () => {
  const items = [{ id: 77, currentQty: 1000 }];
  const excludeAll = () => true;
  const baseArr = (over: any = {}) => ({
    id: 1, status: "approved", allocatedQty: 600, boqItemId: 77,
    arrangementType: "fully_outsourced_composite", agencyName: "AG",
    components: null, programmeAllocations: [], ...over,
  });
  const fraction = (arrs: any[]) =>
    hlcRetainedFraction(buildArrangementEffects(items, arrs).get(77), 1000, excludeAll).fraction;

  it("no arrangement → 100% HLC demand", () => {
    expect(fraction([])).toBe(1);
  });
  it("approved full outsourcing reduces HLC demand", () => {
    expect(fraction([baseArr({ allocatedQty: 1000 })])).toBe(0);
  });
  it("approved partial outsourcing reduces only the applicable share", () => {
    expect(fraction([baseArr()])).toBeCloseTo(0.4, 5);
  });
  it("draft/submitted do not reduce HLC demand", () => {
    expect(fraction([baseArr({ status: "draft" })])).toBe(1);
    expect(fraction([baseArr({ status: "submitted" })])).toBe(1);
  });
  it("cancelled/rejected return to full HLC demand", () => {
    expect(fraction([baseArr({ status: "cancelled" })])).toBe(1);
    expect(fraction([baseArr({ status: "rejected" })])).toBe(1);
  });
});

describe("Part D/E/F — BOQ Work Item(s) column", () => {
  const workDemand = readFileSync("client/src/pages/WorkDemand.tsx", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");

  it("shortage table has the BOQ Work Item(s) column and cell", () => {
    expect(workDemand).toContain("BOQ Work Item(s)");
    expect(workDemand).toContain("function BoqSourceCell");
    expect(workDemand).toContain("<BoqSourceCell row={row} />");
  });

  it("multiple items collapse to +N more with expandable detail", () => {
    expect(workDemand).toMatch(/\+\$\{extra\} more/);
    expect(workDemand).toContain("boq-source-detail-");
  });

  it("server resolves short names via the shared helper (no local parser in WorkDemand)", () => {
    expect(routes).toContain("boqItemShortNameById");
    expect(routes).toMatch(/itemName.*trim\(\)\) \|\| sharedShortItemName/);
    // Part F: no new local short-name parser added to WorkDemand
    expect(workDemand).not.toMatch(/function\s+\w*shortName/i);
  });

  it("no per-item quantities are invented in the source cell", () => {
    const start = workDemand.indexOf("function BoqSourceCell");
    const cell = workDemand.slice(start, workDemand.indexOf("\n}", start));
    expect(cell).not.toContain("fmtQty");
    expect(cell).not.toMatch(/i\.qty|contributed/i);
  });
});
